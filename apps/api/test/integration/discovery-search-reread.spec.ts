/**
 * A FINISHED WEB SEARCH IS READ AGAIN WITH THE REQUEST'S CURRENT INVITATIONS
 * (closing check 2026-10-10, DISC-N3) - the real services over the real
 * database; only the model is replaced.
 *
 * Live finding: real result of 8 candidates for a request; the buyer ticks one
 * and sends (queue row written, the row locks). F5, the window is reopened: the
 * stored result is read again (`GET ...external/searches/:id`) and the address
 * invited a minute ago is back as a plain selectable candidate. A second send
 * answered ALREADY_INVITED - only then.
 *
 * Contract: `externalSearchAnswer` marks, by the rule the search itself uses
 * (`annotate`), every candidate the request has invited since - the address,
 * another mailbox of the invited company, an invited member. The unit contract
 * (no read while RUNNING, one batch, a failing read) is in
 * `supplier-discovery-async-search.spec.ts`.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { prisma, truncateAll } from "./test-db";
import { invite, makeCompanyWithUser, makeListing, proveAccounts } from "./factories";

const co = (name: string, email: string) => ({ name, email, country: "TR", reason: "r" });
const FOUND = [
  co("Unlu Teknik Rulman", "info@unluteknik.com"),
  co("Hes Kablo", "satis@heskablo.com.tr"),
  co("Federal Elektrik", "export@federal.com.tr"),
  co("Sigma Rulman", "info@sigma.com.tr"),
];

/** The real discovery service; the model answers a research text and then the candidates above (+ a member's address). */
function discovery(memberEmail: string) {
  const ai = {
    assertAiAccess: jest.fn(),
    callAi: jest.fn(async (_user: unknown, call: { responseSchema?: object }) => ({
      text: call.responseSchema ? JSON.stringify({ companies: [...FOUND, co("Uye Rulman", memberEmail)] }) : "research",
    })),
  };
  const service = new SupplierDiscoveryService(prisma as never, ai as never);
  service.mxCheck = async () => true;
  // No refusal window: the start call answers at once.
  service.startRefusalWaitMs = 0;
  return service;
}

function connections() {
  return new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    { send: jest.fn() } as never,
    { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) } as never,
    { notify: jest.fn(), pushToCompany: jest.fn(), pushToUser: jest.fn() } as never,
    new AuditService(prisma as never),
  );
}

/** Starts the search and reads it until it has ended (the window's poll). */
async function searched(service: SupplierDiscoveryService, user: AuthenticatedCompanyUser, listingId: string) {
  const { searchId } = await service.startExternalSearch(user, { type: "ALIM", listingId, itemNames: ["Rulman 6204"] });
  for (let i = 0; i < 400; i++) {
    const view = await service.externalSearchAnswer(user, searchId);
    if (view.status !== "RUNNING") return { searchId, view };
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("search still RUNNING");
}

const statuses = (view: { result?: { companies: Array<{ name: string; status: string }> } }) =>
  Object.fromEntries((view.result?.companies ?? []).map((c) => [c.name, c.status]));

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("DISC-N3: the stored result of a search is answered with the request's current invitations", () => {
  it("the live case: invited from the window, page reloaded - the address is locked as 'already invited'; so are another mailbox of an invited company and an invited member", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const member = await makeCompanyWithUser(prisma, { tier: "GOLD", name: "Uye Rulman AS" });
    await proveAccounts(prisma, member.company.id);
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      targetCountries: ["TR"],
      closesAt: new Date(Date.now() + 10 * 24 * 3_600_000),
    });
    const service = discovery(member.user.email);

    const { searchId, view } = await searched(service, buyer.auth, listing.id);
    const atSearchTime = {
      "Unlu Teknik Rulman": "SUGGESTED",
      "Hes Kablo": "SUGGESTED",
      "Federal Elektrik": "SUGGESTED",
      "Sigma Rulman": "SUGGESTED",
      "Uye Rulman": "MEMBER",
    };
    expect(view.status).toBe("DONE");
    expect(statuses(view)).toEqual(atSearchTime);

    // The buyer ticks one candidate in the window and sends; types another mailbox of Federal by hand;
    // invites the member to the request.
    const sent = await connections().inviteExternalForListing(buyer.auth, listing.id, [{ email: "info@unluteknik.com", country: "TR" }], "AI_FORM");
    expect(sent.results.map((r) => r.status)).toEqual(["QUEUED"]);
    await connections().inviteExternalForListing(buyer.auth, listing.id, ["uk@federal.com.tr"], "MANUAL");
    await invite(prisma, listing.id, member.company.id, buyer.user.id);
    // An invitation to another mailbox of Sigma that was dropped before it left reached nobody.
    const dropped = await connections().inviteExternalForListing(buyer.auth, listing.id, ["satis@sigma.com.tr"], "MANUAL");
    expect(dropped.results.map((r) => r.status)).toEqual(["QUEUED"]);
    await prisma.externalListingInvite.updateMany({
      where: { listingId: listing.id, email: "satis@sigma.com.tr" },
      data: { state: "CANCELLED", cancelReason: "ALLOWLIST" },
    });

    // F5: the window reads the finished search again.
    const reread = await service.externalSearchAnswer(buyer.auth, searchId);

    expect(statuses(reread)).toEqual({
      ...atSearchTime,
      "Unlu Teknik Rulman": "ALREADY_INVITED",
      "Federal Elektrik": "ALREADY_INVITED",
      "Uye Rulman": "ALREADY_INVITED",
    });
    // Sending the same row again is what the window no longer offers; the invitation call agrees with the list.
    const again = await connections().inviteExternalForListing(buyer.auth, listing.id, [{ email: "info@unluteknik.com", country: "TR" }], "AI_FORM");
    expect(again.results.map((r) => r.status)).toEqual(["ALREADY_INVITED"]);
    expect(await prisma.externalListingInvite.count({ where: { listingId: listing.id, email: "info@unluteknik.com" } })).toBe(1);
    // A new search marks the same candidates the same way: one rule.
    const fresh = await searched(service, buyer.auth, listing.id);
    expect(statuses(fresh.view)).toEqual(statuses(reread));
  });

  it("the invitations of ANOTHER request of the buyer mark nothing in this request's result", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const open = (over = {}) =>
      makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        status: "OPEN",
        targetCountries: ["TR"],
        closesAt: new Date(Date.now() + 10 * 24 * 3_600_000),
        ...over,
      });
    const searchedFor = await open();
    const other = await open();
    const service = discovery("kimse@yok-uye.com.tr");

    const { searchId } = await searched(service, buyer.auth, searchedFor.id);
    await connections().inviteExternalForListing(buyer.auth, other.id, [{ email: "info@unluteknik.com", country: "TR" }], "AI_FORM");

    expect(statuses(await service.externalSearchAnswer(buyer.auth, searchId))["Unlu Teknik Rulman"]).toBe("SUGGESTED");
  });
});
