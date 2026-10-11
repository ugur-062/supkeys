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
import { nextBusinessWindow, timeZoneForCountry } from "../../src/common/time/country-time-zone";
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

const reader = () => new ListingEmailInvitesService(prisma as never, prisma as never);

async function openListing(companyId: string, userId: string, closesInDays = 10) {
  return makeListing(prisma, {
    companyId,
    createdById: userId,
    status: "OPEN",
    closesAt: new Date(Date.now() + closesInDays * DAY),
    publishedAt: new Date(),
  });
}

/** An invitation letter the address received from ANOTHER buyer (the dispatcher's history source). */
async function letterFromAnotherBuyer(email: string, daysAgo: number) {
  const queuedAt = new Date(Date.now() - daysAgo * DAY);
  await prisma.emailLog.create({
    data: {
      template: "tender_external_invite",
      toEmail: email,
      subject: "s",
      provider: "test",
      status: "SENT",
      contextType: "tender_external_invite",
      contextId: "another-buyer",
      queuedAt,
    },
  });
  return queuedAt;
}

/** Like the real EmailService: every letter writes an EmailLog row (the dispatcher's history source), at `clock.now`. */
function loggingEmail(clock: { now: Date }) {
  return {
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
          queuedAt: clock.now,
        },
      });
      return { emailLogId: "t", sent: true };
    }),
  };
}

const testConfig = () => ({ get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) });

function connectionsWith(email: unknown, config: unknown) {
  return new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    email as never,
    config as never,
    { notify: jest.fn(), pushToCompany: jest.fn(), pushToUser: jest.fn() } as never,
    new AuditService(prisma as never),
  );
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

  /**
   * Live check 2026-10-10, AUTO-COUNT-1. The section answered from the queue
   * row alone: an address that had received a letter from another buyer the
   * same week read "queued" with a planned time the dispatcher was never going
   * to honour (it defers the row to the end of the 7-day hold, or drops it when
   * the request closes first), while the creator's message did not count it.
   * The section now reads the same forecast as the message.
   */
  it("a queued row is read with the dispatcher's forecast: real time for an address on hold, NOT_SENT + reason when it cannot leave before closing - and the dispatcher then does exactly that", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const long = await openListing(owner.company.id, owner.user.id, 20);
    const short = await openListing(owner.company.id, owner.user.id, 3);
    const tomorrow = new Date(Date.now() + DAY);
    // Picked in the "find suppliers" window (`AI_FORM`): held and paused like a row of the automatic run.
    const queued = (listingId: string, email: string, over: Record<string, unknown> = {}) =>
      queueRow(owner, listingId, email, { source: "AI_FORM", state: "QUEUED", country: "TR", sendAfter: tomorrow, ...over });

    // Received a letter two days ago: on hold for five more days.
    const lastLetter = await letterFromAnotherBuyer("held@firma.com.tr", 2);
    await letterFromAnotherBuyer("typed@firma.com.tr", 2);
    // Three letters in 90 days, none of them answered: paused.
    for (const daysAgo of [20, 30, 40]) await letterFromAnotherBuyer("silent@firma.com.tr", daysAgo);

    await queued(long.id, "held@firma.com.tr");
    await queued(long.id, "fresh@firma.com.tr");
    await queued(long.id, "silent@firma.com.tr");
    await queued(short.id, "held@firma.com.tr");
    // The buyer typed this address: neither held nor paused.
    await queued(short.id, "typed@firma.com.tr", { source: "MANUAL" });
    // Next send window of this row is after the request closes.
    await queued(short.id, "late@firma.com.tr", { sendAfter: new Date(Date.now() + 4 * DAY) });

    const afterHold = nextBusinessWindow(new Date(lastLetter.getTime() + 7 * DAY), timeZoneForCountry("TR"));
    expect(afterHold.getTime()).toBeGreaterThan(tomorrow.getTime() + 3 * DAY);
    const read = async (listingId: string) =>
      Object.fromEntries(
        (await reader().forListing(owner.auth, listingId)).items.map((i) => [i.email, [i.invite, i.reason, i.sendAfter]]),
      );
    const expectedLong = {
      "held@firma.com.tr": ["QUEUED", null, afterHold.toISOString()],
      "fresh@firma.com.tr": ["QUEUED", null, tomorrow.toISOString()],
      "silent@firma.com.tr": ["NOT_SENT", "PAUSED", null],
    };
    expect(await read(long.id)).toEqual(expectedLong);
    expect(await read(short.id)).toEqual({
      "held@firma.com.tr": ["NOT_SENT", "FREQUENCY", null],
      "typed@firma.com.tr": ["QUEUED", null, tomorrow.toISOString()],
      "late@firma.com.tr": ["NOT_SENT", "CLOSES_FIRST", null],
    });

    // The rows' turn comes: the dispatcher writes what the page already said.
    await prisma.externalListingInvite.updateMany({
      where: { email: { in: ["held@firma.com.tr", "silent@firma.com.tr"] } },
      data: { sendAfter: new Date(Date.now() - 60_000) },
    });
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
    const report = await new ExternalInviteDispatcher(prisma as never, email as never, config as never, undefined as never).dispatch();
    expect([report.sent, report.deferred, report.cancelled]).toEqual([0, 1, 2]);
    expect(email.send).not.toHaveBeenCalled();
    const rows = await prisma.externalListingInvite.findMany({
      where: { email: { in: ["held@firma.com.tr", "silent@firma.com.tr"] } },
      select: { listingId: true, email: true, state: true, cancelReason: true, sendAfter: true },
    });
    const stored = (listingId: string, address: string) => rows.find((r) => r.listingId === listingId && r.email === address)!;
    expect(stored(long.id, "held@firma.com.tr")).toMatchObject({ state: "QUEUED", sendAfter: afterHold });
    expect(stored(short.id, "held@firma.com.tr")).toMatchObject({ state: "CANCELLED", cancelReason: "FREQUENCY" });
    expect(stored(long.id, "silent@firma.com.tr")).toMatchObject({ state: "CANCELLED", cancelReason: "PAUSED" });
    // ...and the page reads the same as before the dispatcher ran.
    expect(await read(long.id)).toEqual(expectedLong);
    expect((await read(short.id))["held@firma.com.tr"]).toEqual(["NOT_SENT", "FREQUENCY", null]);
  });

  it("the address history and the letters ahead in the queue are read once for all queued rows of the request, not once per row", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    for (let i = 0; i < 9; i++) {
      await queueRow(owner, listing.id, `satis${i}@firma${i}.com.tr`, { source: "AI_FORM", state: "QUEUED", country: "TR" });
    }
    const logReads = jest.spyOn(prisma.emailLog, "findMany");
    const clickReads = jest.spyOn(prisma.companyReferralInvite, "findMany");
    const queueReads = jest.spyOn(prisma.externalListingInvite, "findMany");
    try {
      expect((await reader().forListing(owner.auth, listing.id)).items).toHaveLength(9);
      expect(logReads).toHaveBeenCalledTimes(1);
      expect(clickReads).toHaveBeenCalledTimes(1);
      // The request's own rows + the same addresses on other requests.
      expect(queueReads).toHaveBeenCalledTimes(2);
    } finally {
      logReads.mockRestore();
      clickReads.mockRestore();
      queueReads.mockRestore();
    }
  });

  /**
   * Review of AUTO-COUNT-1 (F1): the same symptom with a different trigger.
   * Nothing has been SENT to the address yet - another request's letter waits
   * in the queue for it, twelve minutes ahead (every queued row gets its own
   * 0-45 minute spread). The dispatcher sends that one and then holds this row
   * for 7 days. The address history is still empty, so the section read
   * "queued" with the stored time, and the row was dropped when its turn came.
   */
  it("a letter ahead in the queue on ANOTHER request counts: the row behind it reads NOT_SENT (or the time after that letter's hold) - and the dispatcher then does exactly that", async () => {
    const first = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const second = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const one = await openListing(first.company.id, first.user.id, 7);
    const two = await openListing(second.company.id, second.user.id, 7);
    const long = await openListing(second.company.id, second.user.id, 20);
    const draft = await makeListing(prisma, { companyId: first.company.id, createdById: first.user.id, status: "DRAFT" });
    // Planned minutes: the first request's letter, then the others twelve minutes later.
    const ahead = new Date(Date.now() + 10 * 60_000);
    const behind = new Date(ahead.getTime() + 12 * 60_000);
    // Picked in the "find suppliers" window (`AI_FORM`): held like a row of the automatic run.
    const queued = (owner: typeof first, listingId: string, email: string, sendAfter: Date) =>
      queueRow(owner, listingId, email, { source: "AI_FORM", state: "QUEUED", country: "TR", sendAfter });
    await queued(first, one.id, "satis@kablo.com.tr", ahead);
    await queued(second, two.id, "satis@kablo.com.tr", behind);
    await queued(second, long.id, "satis@kablo.com.tr", behind);
    // An address nobody else has queued, and one whose only earlier letter sits on a DRAFT (the dispatcher does not read it).
    await queued(second, two.id, "tek@kablo.com.tr", behind);
    await queued(first, draft.id, "taslak@kablo.com.tr", ahead);
    await queued(second, two.id, "taslak@kablo.com.tr", behind);

    const afterHold = nextBusinessWindow(new Date(ahead.getTime() + 7 * DAY), timeZoneForCountry("TR"));
    const read = async (auth: AuthenticatedCompanyUser, listingId: string) =>
      Object.fromEntries((await reader().forListing(auth, listingId)).items.map((i) => [i.email, [i.invite, i.reason, i.sendAfter]]));
    // The letter ahead itself: nothing ahead of IT - the later rows do not hold it.
    expect(await read(first.auth, one.id)).toEqual({ "satis@kablo.com.tr": ["QUEUED", null, ahead.toISOString()] });
    const expectedTwo = {
      // Held for 7 days from the letter ahead; this request closes first.
      "satis@kablo.com.tr": ["NOT_SENT", "FREQUENCY", null],
      "tek@kablo.com.tr": ["QUEUED", null, behind.toISOString()],
      "taslak@kablo.com.tr": ["QUEUED", null, behind.toISOString()],
    };
    expect(await read(second.auth, two.id)).toEqual(expectedTwo);
    // Open long enough: queued, for the window after THAT letter's hold - not the stored time.
    const expectedLong = { "satis@kablo.com.tr": ["QUEUED", null, afterHold.toISOString()] };
    expect(await read(second.auth, long.id)).toEqual(expectedLong);

    // The dispatcher's minute of the first letter, then the minute of the rows behind it.
    const clock = { now: ahead };
    const email = loggingEmail(clock);
    const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, testConfig() as never, undefined as never);
    const tick = async (at: Date) => {
      clock.now = at;
      const report = await dispatcher.dispatch(at);
      return [report.sent, report.deferred, report.cancelled];
    };
    expect(await tick(ahead)).toEqual([1, 0, 0]);
    expect(email.send.mock.calls.map((c) => c[0].to.email)).toEqual(["satis@kablo.com.tr"]);
    // The letter has left: the pages behind it read the same as before.
    expect(await read(second.auth, two.id)).toEqual(expectedTwo);
    expect(await read(second.auth, long.id)).toEqual(expectedLong);

    expect(await tick(new Date(behind.getTime() + 60_000))).toEqual([2, 1, 1]);
    const rows = await prisma.externalListingInvite.findMany({
      where: { email: "satis@kablo.com.tr" },
      select: { listingId: true, state: true, cancelReason: true, sendAfter: true },
    });
    const stored = (listingId: string) => rows.find((r) => r.listingId === listingId)!;
    expect(stored(two.id)).toMatchObject({ state: "CANCELLED", cancelReason: "FREQUENCY" });
    expect(stored(long.id)).toMatchObject({ state: "QUEUED", sendAfter: afterHold });
    // ...and the pages still say what they said before anything was sent.
    expect(await read(second.auth, two.id)).toEqual({
      ...expectedTwo,
      "tek@kablo.com.tr": ["INVITED", null, null],
      "taslak@kablo.com.tr": ["INVITED", null, null],
    });
    expect(await read(second.auth, long.id)).toEqual(expectedLong);
  });

  /**
   * Review of AUTO-COUNT-1 (F3): the "find suppliers" window shows the ANSWER
   * of the invitation request; the section of the same page reads the queue row
   * with the dispatcher's forecast. Answering from the row alone, the window
   * said "queued, planned for Monday 09:13" for an address the section showed
   * as "not sent - it received another invitation this week".
   */
  it("the answer of the invitation request says what the section says for the same row: the real time, or the reason when the letter will not leave", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const short = await openListing(owner.company.id, owner.user.id, 7);
    const long = await openListing(owner.company.id, owner.user.id, 20);
    const typed = await openListing(owner.company.id, owner.user.id, 7);
    // Another buyer's letter reached the address five hours ago.
    const letter = await letterFromAnotherBuyer("held@firma.com.tr", 5 / 24);
    const afterHold = nextBusinessWindow(new Date(letter.getTime() + 7 * DAY), timeZoneForCountry("TR"));
    const connections = connectionsWith({ send: jest.fn() }, testConfig());
    const invite = (listingId: string, emails: string[], source: "MANUAL" | "AI_FORM") =>
      connections.inviteExternalForListing(owner.auth, listingId, emails.map((email) => ({ email, country: "TR" })), source);
    const section = async (listingId: string) => (await reader().forListing(owner.auth, listingId)).items;
    const storedTime = async (listingId: string, email: string) =>
      (await prisma.externalListingInvite.findFirstOrThrow({ where: { listingId, email } })).sendAfter.toISOString();

    // Closes in 7 days: the hold ends after the last moment a letter may leave.
    const a = await invite(short.id, ["held@firma.com.tr", "fresh@firma.com.tr"], "AI_FORM");
    expect(a.results).toEqual([
      { email: "held@firma.com.tr", status: "QUEUED", notSentReason: "FREQUENCY" },
      { email: "fresh@firma.com.tr", status: "QUEUED", sendAfter: await storedTime(short.id, "fresh@firma.com.tr") },
    ]);
    expect(Object.fromEntries((await section(short.id)).map((i) => [i.email, [i.invite, i.reason, i.sendAfter]]))).toEqual({
      "held@firma.com.tr": ["NOT_SENT", "FREQUENCY", null],
      "fresh@firma.com.tr": ["QUEUED", null, a.results[1]!.sendAfter],
    });

    // Closes in 20 days: queued, and the time is the window after the hold - not the stored one.
    const b = await invite(long.id, ["held@firma.com.tr"], "AI_FORM");
    expect(b.results).toEqual([{ email: "held@firma.com.tr", status: "QUEUED", sendAfter: afterHold.toISOString() }]);
    expect(await storedTime(long.id, "held@firma.com.tr")).not.toBe(afterHold.toISOString());
    expect((await section(long.id)).map((i) => [i.invite, i.sendAfter])).toEqual([["QUEUED", afterHold.toISOString()]]);

    // An address the buyer typed is not held: the answer is the stored time, as before.
    const c = await invite(typed.id, ["held@firma.com.tr"], "MANUAL");
    expect(c.results).toEqual([
      { email: "held@firma.com.tr", status: "QUEUED", sendAfter: await storedTime(typed.id, "held@firma.com.tr") },
    ]);
  });

  it("a forecast read that fails does not fail the invitation: the rows are queued and the answer carries the stored time", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id, 7);
    await letterFromAnotherBuyer("held@firma.com.tr", 5 / 24);
    const connections = connectionsWith({ send: jest.fn() }, testConfig());
    const logReads = jest.spyOn(prisma.emailLog, "findMany").mockRejectedValueOnce(new Error("read failed"));
    try {
      const res = await connections.inviteExternalForListing(owner.auth, listing.id, [{ email: "held@firma.com.tr", country: "TR" }], "AI_FORM");
      const row = await prisma.externalListingInvite.findFirstOrThrow({ where: { listingId: listing.id } });
      expect(row.state).toBe("QUEUED");
      expect(res.results).toEqual([{ email: "held@firma.com.tr", status: "QUEUED", sendAfter: row.sendAfter.toISOString() }]);
    } finally {
      logReads.mockRestore();
    }
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
