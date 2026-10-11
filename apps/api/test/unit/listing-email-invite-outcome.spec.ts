/**
 * E-mail invitations of a request - outcome vocabulary, route contract and
 * the import rule of the reader (round 5, D3). DB behaviour is in
 * `test/integration/listing-email-invites.spec.ts`.
 */
import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { QueuedInviteForecast } from "../../src/common/company/external-invite-policy";
import { candidateInvite } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";
import { CompanyConnectionsModule } from "../../src/modules/company-connections/company-connections.module";
import { CompanyConnectionsController } from "../../src/modules/company-connections/controllers/company-connections.controller";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import {
  ListingEmailInvitesService,
  emailInviteOutcome,
} from "../../src/modules/company-connections/services/listing-email-invites.service";

const SEND_AFTER = new Date("2030-01-01T09:00:00.000Z");
/** End of the address's 7-day hold moved to the send window - later than the stored time. */
const AFTER_HOLD = new Date("2030-01-07T06:00:00.000Z");
const leaves = (at: Date): QueuedInviteForecast => ({ leavesAt: at, dropReason: null });
const dropped = (dropReason: "FREQUENCY" | "PAUSED" | "CLOSES_FIRST"): QueuedInviteForecast => ({ leavesAt: null, dropReason });
/** A queued row carries the dispatcher's forecast (`withQueueForecast`); any other row carries none. */
const row = (
  state: string,
  cancelReason: string | null = null,
  forecast: QueuedInviteForecast | null = state === "QUEUED" ? leaves(SEND_AFTER) : null,
) => ({ state, cancelReason, sendAfter: SEND_AFTER, forecast });

describe("emailInviteOutcome - queue row -> what the buyer is told", () => {
  it.each([
    ["SENT", null, "INVITED", null, null],
    ["QUEUED", null, "QUEUED", null, "2030-01-01T09:00:00.000Z"],
    // The dispatcher's reasons pass through as they are.
    ["CANCELLED", "FREQUENCY", "NOT_SENT", "FREQUENCY", null],
    ["CANCELLED", "PAUSED", "NOT_SENT", "PAUSED", null],
    ["CANCELLED", "OPTED_OUT", "NOT_SENT", "OPTED_OUT", null],
    ["CANCELLED", "REGISTERED", "NOT_SENT", "REGISTERED", null],
    ["CANCELLED", "LISTING_CLOSED", "NOT_SENT", "LISTING_CLOSED", null],
    ["CANCELLED", "ALLOWLIST", "NOT_SENT", "ALLOWLIST", null],
    ["CANCELLED", "SUPPRESSED", "NOT_SENT", "SUPPRESSED", null],
    ["CANCELLED", "COUNTRY_BLOCKED", "NOT_SENT", "COUNTRY_BLOCKED", null],
    // Withdrawn by the buyer's own action / switch.
    ["CANCELLED", "REFERRAL_CANCELLED", "NOT_SENT", "CANCELLED", null],
    ["CANCELLED", "AUTO_INVITE_OFF", "NOT_SENT", "AUTO_INVITE_OFF", null],
    ["CANCELLED", "INVITER_DOWNGRADED", "NOT_SENT", "NOT_ALLOWED", null],
    ["CANCELLED", null, "NOT_SENT", "FAILED", null],
    ["FAILED", null, "NOT_SENT", "FAILED", null],
  ])("%s / %s -> %s (%s)", (state, cancelReason, invite, reason, sendAfter) => {
    expect(emailInviteOutcome(row(state, cancelReason))).toEqual({ invite, reason, sendAfter });
  });

  // AUTO-COUNT-1: the queue row alone does not say "queued" - the forecast the creator's message counts with decides.
  it.each([
    ["on the 7-day hold, still in time: the time it can really leave", leaves(AFTER_HOLD), "QUEUED", null, "2030-01-07T06:00:00.000Z"],
    ["the hold ends after the request closes", dropped("FREQUENCY"), "NOT_SENT", "FREQUENCY", null],
    ["three unanswered letters", dropped("PAUSED"), "NOT_SENT", "PAUSED", null],
    ["its turn comes after the request closes", dropped("CLOSES_FIRST"), "NOT_SENT", "CLOSES_FIRST", null],
  ])("QUEUED, %s -> %s (%s)", (_label, forecast, invite, reason, sendAfter) => {
    expect(emailInviteOutcome(row("QUEUED", null, forecast))).toEqual({ invite, reason, sendAfter });
  });

  it("is the status band's own answer for the same queue row (one vocabulary, not a second copy)", () => {
    const rows = [
      row("SENT"),
      row("QUEUED"),
      row("QUEUED", null, leaves(AFTER_HOLD)),
      ...(["FREQUENCY", "PAUSED", "CLOSES_FIRST"] as const).map((r) => row("QUEUED", null, dropped(r))),
      row("FAILED"),
      ...["FREQUENCY", "PAUSED", "OPTED_OUT", "REGISTERED", "LISTING_CLOSED", "ALLOWLIST", "AUTO_INVITE_OFF", "INVITER_DOWNGRADED", null].map(
        (r) => row("CANCELLED", r),
      ),
    ];
    for (const queue of rows) {
      for (const status of ["SUGGESTED", "INVITED"]) {
        const band = candidateInvite({ status, memberCompanyId: null, memberInvited: false, queue, active: false });
        expect(emailInviteOutcome(queue)).toEqual({ invite: band.invite, reason: band.inviteReason, sendAfter: band.sendAfter });
      }
    }
  });
});

describe("GET company/connections/external-tender-invites - route contract", () => {
  const handler = CompanyConnectionsController.prototype.externalTenderInvites;

  it("GET, `buy:view` alone (not the selling side, no manage permission), served by the reader service", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CompanyConnectionsController)).toBe("company/connections");
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("external-tender-invites");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(COMPANY_PERMISSION_KEY, handler)).toBe("buy:view");
    expect(Reflect.getMetadata("design:paramtypes", CompanyConnectionsController)).toEqual([
      CompanyConnectionsService,
      ListingEmailInvitesService,
    ]);
    // The reader is a provider of the controller's module (a missing provider
    // fails only when the application starts).
    expect(Reflect.getMetadata("providers", CompanyConnectionsModule)).toContain(ListingEmailInvitesService);
    expect(Reflect.getMetadata("controllers", CompanyConnectionsModule)).toContain(CompanyConnectionsController);
  });

  it("passes the signed-in user and the query's request id to the reader", async () => {
    const reader = { forListing: jest.fn().mockResolvedValue({ items: [] }) };
    const controller = new CompanyConnectionsController({} as never, reader as never);
    const user = { userId: "u1", companyId: "c1" } as never;
    await expect(controller.externalTenderInvites(user, { listingId: "l1" })).resolves.toEqual({ items: [] });
    expect(reader.forListing).toHaveBeenCalledWith(user, "l1");
  });
});

/**
 * The reader imports `candidateInvite` from `discovery-runs.service`, which
 * itself imports `CompanyConnectionsService` and the dispatcher. If anything
 * `discovery-runs.service` loads (directly or not) imported the reader, the
 * files would form a cycle: whichever loads first sees an undefined class in
 * the other's constructor metadata and the API fails at start ("Nest can't
 * resolve dependencies"). No test boots the whole application, so the rule is
 * checked on the import graph.
 */
describe("the reader stays outside the import closure of discovery-runs.service", () => {
  const SRC = path.join(__dirname, "../../src");
  const IMPORT_RE = /^(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']/gm;

  function closure(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = fs.readFileSync(file, "utf8");
      for (const m of source.matchAll(IMPORT_RE)) {
        if (/^(?:import|export)\s+type\s/.test(m[0])) continue;
        const base = path.resolve(path.dirname(file), m[1]!);
        const hit = [`${base}.ts`, path.join(base, "index.ts")].find((c) => fs.existsSync(c));
        if (hit) stack.push(hit);
      }
    }
    return seen;
  }

  it("discovery-runs.service reaches the connections service and the dispatcher, never the reader", () => {
    const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
    const files = new Set([...closure(path.join(SRC, "modules/ai/supplier-discovery/discovery-runs.service.ts"))].map(rel));
    // The walk works (it found the two known edges)...
    expect(files).toContain("modules/company-connections/services/company-connections.service.ts");
    expect(files).toContain("modules/company-connections/services/external-invite-dispatcher.service.ts");
    // ...and the reader, its controller and its module are not behind them.
    expect(files).not.toContain("modules/company-connections/services/listing-email-invites.service.ts");
    expect(files).not.toContain("modules/company-connections/controllers/company-connections.controller.ts");
    expect(files).not.toContain("modules/company-connections/company-connections.module.ts");
  });
});
