/**
 * E-MAIL INVITATIONS OF A REQUEST - read side (round 5, D3).
 *
 * Live finding: the buyer invited sales@... from the "find suppliers" window,
 * closed it, reloaded the request page - no trace of the invitation or of its
 * state (queued / sent / dropped). `external_listing_invites` rows existed, but
 * the only reader for the buyer was the candidate list of an automatic run.
 *
 * Contract (`GET company/connections/external-tender-invites?listingId=`):
 *  - every e-mail invitation of the request, all sources, newest first;
 *  - outcome in the vocabulary of the run's status band (`candidateInvite`):
 *    INVITED = e-mail sent, QUEUED + `sendAfter`, NOT_SENT + reason code;
 *  - `name` only from the discovery candidates of THAT request;
 *  - any member of the owner company (the route asks `buy:view`), no package
 *    tier; another company's request is 404.
 */
import { NotFoundException } from "@nestjs/common";
import { CompanyRole } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { ListingEmailInvitesService } from "../../src/modules/company-connections/services/listing-email-invites.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { holdInviteSendWindowOpen } from "./invite-send-window";

// These suites test other rules with the real clock; the send-time business window is covered in invite-send-window.spec.ts.
holdInviteSendWindowOpen();

const DAY = 24 * 3_600_000;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const reader = () => new ListingEmailInvitesService(prisma as never);

async function openListing(companyId: string, userId: string) {
  return makeListing(prisma, {
    companyId,
    createdById: userId,
    status: "OPEN",
    closesAt: new Date(Date.now() + 10 * DAY),
    publishedAt: new Date(),
  });
}

/** Queue row written directly (the state under test is the dispatcher's, not the write path's). */
async function queueRow(
  owner: { company: { id: string }; user: { id: string } },
  listingId: string,
  email: string,
  over: Record<string, unknown> = {},
) {
  const referral = await prisma.companyReferralInvite.upsert({
    where: { inviterCompanyId_email: { inviterCompanyId: owner.company.id, email } },
    create: { inviterCompanyId: owner.company.id, email, invitedById: owner.user.id },
    update: {},
  });
  return prisma.externalListingInvite.create({
    data: {
      listingId,
      inviterCompanyId: owner.company.id,
      referralInviteId: referral.id,
      email,
      locale: "tr",
      ...over,
    },
  });
}

async function runWithCandidates(
  companyId: string,
  listingId: string,
  candidates: Array<{ name: string; email: string }>,
  createdAt?: Date,
) {
  return prisma.supplierDiscoveryRun.create({
    data: {
      companyId,
      listingId,
      trigger: "PUBLISH",
      state: "DONE",
      ...(createdAt ? { createdAt } : {}),
      candidates: { create: candidates.map((c) => ({ ...c, ...(createdAt ? { createdAt } : {}) })) },
    },
  });
}

describe("ListingEmailInvitesService.forListing", () => {
  it("every e-mail invitation of the request, newest first, with the outcome vocabulary of the run band", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    const t = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    const sentAt = t(50);
    const sendAfter = new Date(Date.now() + 2 * DAY);

    const sent = await queueRow(owner, listing.id, "manual@firma.com", {
      source: "MANUAL",
      state: "SENT",
      sentAt,
      createdAt: t(60),
    });
    const queued = await queueRow(owner, listing.id, "einkauf@rohre.at", {
      source: "AI_FORM",
      state: "QUEUED",
      sendAfter,
      country: "AT",
      locale: "en",
      createdAt: t(50),
    });
    const frequency = await queueRow(owner, listing.id, "freq@firma.com", {
      source: "AI_AUTO",
      state: "CANCELLED",
      cancelReason: "FREQUENCY",
      createdAt: t(40),
    });
    const switchedOff = await queueRow(owner, listing.id, "off@firma.com", {
      source: "AI_AUTO",
      state: "CANCELLED",
      cancelReason: "AUTO_INVITE_OFF",
      createdAt: t(30),
    });
    const downgraded = await queueRow(owner, listing.id, "down@firma.com", {
      source: "MANUAL",
      state: "CANCELLED",
      cancelReason: "INVITER_DOWNGRADED",
      createdAt: t(20),
    });
    const failed = await queueRow(owner, listing.id, "fail@firma.com", { source: "MANUAL", state: "FAILED", createdAt: t(10) });

    // Names: only from the discovery of THIS request; the newest run wins.
    await runWithCandidates(owner.company.id, listing.id, [{ name: "Eski Ad GmbH", email: "einkauf@rohre.at" }], t(500));
    await runWithCandidates(owner.company.id, listing.id, [
      { name: "Rohre Austria GmbH", email: "einkauf@rohre.at" },
      { name: "Frekans Metal AŞ", email: "freq@firma.com" },
    ]);
    const otherListing = await openListing(owner.company.id, owner.user.id);
    await runWithCandidates(owner.company.id, otherListing.id, [{ name: "Başka Talebin Adayı", email: "manual@firma.com" }]);
    // Another request's invitation to the same address does not leak in.
    await queueRow(owner, otherListing.id, "manual@firma.com", { source: "MANUAL", state: "QUEUED" });

    const { items } = await reader().forListing(owner.auth, listing.id);
    const iso = (d: Date) => d.toISOString();
    expect(items).toEqual([
      {
        id: failed.id,
        email: "fail@firma.com",
        name: null,
        country: null,
        locale: "tr",
        source: "MANUAL",
        invite: "NOT_SENT",
        reason: "FAILED",
        sendAfter: null,
        sentAt: null,
        createdAt: iso(failed.createdAt),
      },
      {
        id: downgraded.id,
        email: "down@firma.com",
        name: null,
        country: null,
        locale: "tr",
        source: "MANUAL",
        invite: "NOT_SENT",
        reason: "NOT_ALLOWED",
        sendAfter: null,
        sentAt: null,
        createdAt: iso(downgraded.createdAt),
      },
      {
        id: switchedOff.id,
        email: "off@firma.com",
        name: null,
        country: null,
        locale: "tr",
        source: "AI_AUTO",
        invite: "NOT_SENT",
        reason: "AUTO_INVITE_OFF",
        sendAfter: null,
        sentAt: null,
        createdAt: iso(switchedOff.createdAt),
      },
      {
        id: frequency.id,
        email: "freq@firma.com",
        name: "Frekans Metal AŞ",
        country: null,
        locale: "tr",
        source: "AI_AUTO",
        invite: "NOT_SENT",
        reason: "FREQUENCY",
        sendAfter: null,
        sentAt: null,
        createdAt: iso(frequency.createdAt),
      },
      {
        id: queued.id,
        email: "einkauf@rohre.at",
        name: "Rohre Austria GmbH",
        country: "AT",
        locale: "en",
        source: "AI_FORM",
        invite: "QUEUED",
        reason: null,
        sendAfter: iso(sendAfter),
        sentAt: null,
        createdAt: iso(queued.createdAt),
      },
      {
        id: sent.id,
        email: "manual@firma.com",
        // A candidate of ANOTHER request with this address gives no name here.
        name: null,
        country: null,
        locale: "tr",
        source: "MANUAL",
        invite: "INVITED",
        reason: null,
        sendAfter: null,
        sentAt: iso(sentAt),
        createdAt: iso(sent.createdAt),
      },
    ]);
  });

  it("the live case end to end: invited from the window -> QUEUED on the page; after the dispatcher -> INVITED with sentAt", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD", name: "QA Alıcı Sanayi A.Ş." });
    const listing = await openListing(owner.company.id, owner.user.id);
    const email = {
      send: jest.fn(async (a: { to: { email: string }; templateData: { template: string }; context: { type: string; id: string } }) => {
        await prisma.emailLog.create({
          data: {
            template: a.templateData.template,
            toEmail: a.to.email,
            subject: "s",
            provider: "test",
            status: "SENT",
            contextType: a.context.type,
            contextId: a.context.id,
          },
        });
        return { emailLogId: "t", sent: true };
      }),
    };
    const config = { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
    const connections = new CompanyConnectionsService(
      prisma as never,
      prisma as never,
      { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
      email as never,
      config as never,
      { notify: jest.fn(), pushToCompany: jest.fn(), pushToUser: jest.fn() } as never,
      new AuditService(prisma as never),
    );
    expect((await reader().forListing(owner.auth, listing.id)).items).toEqual([]);

    const res = await connections.inviteExternalForListing(owner.auth, listing.id, ["sales@tubacex.com"], "AI_FORM");
    expect(res.results).toEqual([expect.objectContaining({ email: "sales@tubacex.com", status: "QUEUED" })]);
    const queued = (await reader().forListing(owner.auth, listing.id)).items;
    expect(queued).toEqual([
      expect.objectContaining({
        email: "sales@tubacex.com",
        source: "AI_FORM",
        invite: "QUEUED",
        reason: null,
        sendAfter: res.results[0]!.sendAfter,
        sentAt: null,
      }),
    ]);

    await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });
    const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, config as never, undefined as never);
    await dispatcher.dispatch();
    expect(email.send).toHaveBeenCalledTimes(1);
    const [after] = (await reader().forListing(owner.auth, listing.id)).items;
    expect(after).toMatchObject({ id: queued[0]!.id, email: "sales@tubacex.com", invite: "INVITED", reason: null, sendAfter: null });
    expect(after!.sentAt).toEqual(expect.any(String));
    expect(Date.now() - new Date(after!.sentAt!).getTime()).toBeLessThan(60_000);
  });

  it("another company's request and an unknown request are 404 - also for a Gold buyer", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const stranger = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    await queueRow(owner, listing.id, "gizli@firma.com", { state: "SENT", sentAt: new Date() });

    await expect(reader().forListing(stranger.auth, listing.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(reader().forListing(owner.auth, "yok-boyle-bir-talep")).rejects.toBeInstanceOf(NotFoundException);
    // An invited supplier of the request is not its owner either.
    await prisma.listingInvitation.create({
      data: { listingId: listing.id, invitedCompanyId: stranger.company.id, invitedById: owner.user.id },
    });
    await expect(reader().forListing(stranger.auth, listing.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("readable by a colleague who did not open the request, and by a company without a package", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    await queueRow(owner, listing.id, "tedarik@firma.com", { state: "SENT", sentAt: new Date() });

    // A manager: sees the buying side (`buy:view`) but cannot manage requests and did not open this one.
    const colleague = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    expect(colleague.permissions).toContain("buy:view");
    expect(colleague.permissions).not.toContain("buy:listing:manage");
    const colleagueAuth: AuthenticatedCompanyUser = {
      ...owner.auth,
      userId: colleague.id,
      email: colleague.email,
      roles: colleague.roles,
      permissions: colleague.permissions,
      isOwner: false,
    };
    expect((await reader().forListing(colleagueAuth, listing.id)).items.map((i) => i.email)).toEqual(["tedarik@firma.com"]);

    // Package lost after the invitation: the list is still readable (no tier gate).
    await prisma.company.update({ where: { id: owner.company.id }, data: { tier: "STANDART" } });
    expect((await reader().forListing({ ...owner.auth, tier: "STANDART" }, listing.id)).items).toHaveLength(1);
  });
});
