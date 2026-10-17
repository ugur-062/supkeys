/**
 * ONE ADDRESS, SEVERAL REQUESTS, ONE E-MAIL (closing check 2026-10-10, DISC-N1).
 *
 * Policy (`external-invite-policy.ts`, rule 2): waiting invitations to one
 * address are not lost, they go out TOGETHER in the next e-mail; the
 * dispatcher has a digest of up to five requests for that. Seen live: every
 * AI-sourced queue row got its own minute of the 0-45 minute spread, so two
 * requests of one buyer that queued the same supplier for Monday 09:32 and
 * 09:33 were two dispatcher runs - the first letter left, the second was held
 * 7 days and dropped (`FREQUENCY`) because its request closed first: 3 of the
 * 14 queued letters of the two requests.
 *
 * Contract (single rule `inviteQueueSendAt`, applied where a time is PLANNED,
 * not in the dispatcher's send path):
 *  - an AI-sourced row planned for a send window takes exactly the time of the
 *    letter its address already has there (any request, any buyer; only rows
 *    the dispatcher will read) - both come due in one run = one e-mail;
 *  - the forecast of both rows says "queued" with that one time;
 *  - another address keeps its own spread; a typed address is due at once;
 *  - no time before the row's own send window can result - and none after it
 *    (review R8-1: the 45-minute range can end after 16:00 local);
 *  - only a letter that can still leave is joined (review R8-4: not one whose
 *    request closes before its planned time);
 *  - one read for all addresses of a call;
 *  - the resume of dropped automatic invitations does not split them again;
 *  - an e-mail lists five requests: the sixth row of one planned time is told
 *    "not sent" from the start, and which rows leave is the queue's order
 *    (planned time, age, id), in the forecast and in the dispatcher alike
 *    (review R8-3).
 *
 * EVERY CLOCK IS FIXED: the queueing call reads `new Date()`, so `Date` is
 * replaced for that call (timers stay real - Prisma works); the dispatcher and
 * the mail log take the test's moment. This file must NOT call
 * `holdInviteSendWindowOpen()`: the letters leave through the real send window.
 */
import { Prisma } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import {
  ExternalInviteDispatcher,
  queuedInviteForecasts,
} from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { ListingEmailInvitesService } from "../../src/modules/company-connections/services/listing-email-invites.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

const MIN = 60_000;
const utc = (iso: string) => new Date(`${iso}:00.000Z`);

/** Saturday 10 October 2026, 13:00 in Istanbul: nothing can leave before Monday 09:00 (06:00 UTC). */
const SAT_1000 = utc("2026-10-10T10:00");
const SAT_1007 = utc("2026-10-10T10:07");
const MON_0900 = utc("2026-10-12T06:00");
const MON_0932 = utc("2026-10-12T06:32");
const MON_0933 = utc("2026-10-12T06:33");
/** Both requests close a week after they were published (the default closing of the live case). */
const CLOSES = utc("2026-10-17T10:00");

type SendArg = {
  to: { email: string };
  templateData: { template: string; data: { invites?: unknown[] } };
  context: { type: string; id: string };
};

/** Everything but `Date` stays real: Prisma needs its timers. */
const REAL_TIMERS = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
] as const;

/** Runs `work` with the wall clock standing at `moment` (the queueing call and the page read ask `new Date()`). */
async function at<T>(moment: Date, work: () => Promise<T>): Promise<T> {
  jest.useFakeTimers({ now: moment.getTime(), doNotFake: [...REAL_TIMERS] });
  try {
    return await work();
  } finally {
    jest.useRealTimers();
  }
}

/** The spread the next planned rows would get on their own (minutes after the window start). */
function spread(...minutes: number[]) {
  const random = jest.spyOn(Math, "random");
  random.mockReset();
  minutes.forEach((m, i) => {
    const value = (m + 0.5) / 45;
    if (i === minutes.length - 1) random.mockReturnValue(value);
    else random.mockReturnValueOnce(value);
  });
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

/** The real dispatcher; its mail writes the log line the real EmailService writes, stamped with the test clock. */
function dispatcherRig(env: Record<string, string> = {}) {
  const clock = { now: SAT_1000 };
  const email = {
    send: jest.fn(async (a: SendArg) => {
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
  const config = { get: jest.fn((k: string) => env[k] ?? (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
  const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, config as never, undefined as never);
  /** One dispatcher minute: [e-mails sent, rows deferred, rows cancelled]. */
  const tick = async (moment: Date) => {
    clock.now = moment;
    const report = await dispatcher.dispatch(moment);
    return [report.sent, report.deferred, report.cancelled];
  };
  /** Every e-mail sent so far: address + how many requests it lists. */
  const letters = () =>
    email.send.mock.calls
      .map((c) => c[0] as SendArg)
      .map((a) => `${a.to.email} ${a.templateData.template} ${a.templateData.data.invites?.length ?? 1}`)
      .sort();
  return { dispatcher, tick, letters };
}

type Buyer = Awaited<ReturnType<typeof makeCompanyWithUser>>;

/** A published request with the automatic search on (an `AI_AUTO` row of a request with the box off is dropped). */
async function request(
  owner: Buyer,
  over: {
    status?: "DRAFT" | "OPEN" | "CLOSED_NO_AWARD";
    visibility?: "PUBLIC" | "PRIVATE";
    aiDiscovery?: boolean;
    closesAt?: Date;
  } = {},
) {
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    aiDiscovery: true,
    closesAt: CLOSES,
    ...over,
  });
  await makeItem(prisma, listing.id, { name: "Rulman 6204", quantity: new Prisma.Decimal(50), unit: "adet", unitCode: "PCE" });
  return listing;
}

/** A queue row written directly, with the test's times. */
async function queueRow(
  owner: Buyer,
  listingId: string,
  email: string,
  over: Partial<Prisma.ExternalListingInviteUncheckedCreateInput> = {},
) {
  const referral = await prisma.companyReferralInvite.upsert({
    where: { inviterCompanyId_email: { inviterCompanyId: owner.company.id, email } },
    create: { inviterCompanyId: owner.company.id, email, invitedById: owner.user.id, listingId, locale: "tr" },
    update: {},
    select: { id: true },
  });
  return prisma.externalListingInvite.create({
    data: {
      listingId,
      inviterCompanyId: owner.company.id,
      referralInviteId: referral.id,
      email,
      locale: "tr",
      country: "TR",
      source: "AI_AUTO",
      state: "QUEUED",
      createdAt: SAT_1000,
      ...over,
    },
  });
}

const tr = (...emails: string[]) => emails.map((email) => ({ email, country: "TR" }));

/** Stored rows as `request-address state reason planned-time`. */
async function stored(where: Prisma.ExternalListingInviteWhereInput = {}) {
  const rows = await prisma.externalListingInvite.findMany({
    where,
    select: { listingId: true, email: true, state: true, cancelReason: true, sendAfter: true },
  });
  return (listingId: string, email: string) => {
    const row = rows.find((r) => r.listingId === listingId && r.email === email);
    if (!row) throw new Error(`no queue row for ${email}`);
    return row;
  };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("DISC-N1: a row planned for a send window joins the letter its address already has there", () => {
  it("the live case: two requests queue the same suppliers seven minutes apart -> one planned time, 'queued' on both pages, ONE digest e-mail per address, nothing held or dropped", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const r836 = await request(buyer);
    const r846 = await request(buyer);
    const service = connections();
    const [federal, sigma, alone, hes] = ["satis@federal.com.tr", "info@sigma.com.tr", "satis@yalniz.com.tr", "info@hes.com.tr"];

    // The automatic round of each request; the rows of the second would be spread one minute behind the first.
    spread(32);
    const first = await at(SAT_1000, () => service.inviteExternalForListing(buyer.auth, r836.id, tr(federal, sigma, alone), "AI_AUTO"));
    spread(33);
    const second = await at(SAT_1007, () => service.inviteExternalForListing(buyer.auth, r846.id, tr(federal, sigma, hes), "AI_AUTO"));

    const queued = (email: string, sendAfter: Date) => ({ email, status: "QUEUED", sendAfter: sendAfter.toISOString() });
    expect(first.results).toEqual([queued(federal, MON_0932), queued(sigma, MON_0932), queued(alone, MON_0932)]);
    // The shared addresses take the waiting letter's time - no `notSentReason`; the new address keeps its own spread.
    expect(second.results).toEqual([queued(federal, MON_0932), queued(sigma, MON_0932), queued(hes, MON_0933)]);
    const row = await stored();
    for (const email of [federal, sigma]) {
      expect(row(r846.id, email).sendAfter).toEqual(row(r836.id, email).sendAfter);
      expect(row(r846.id, email).sendAfter).toEqual(MON_0932);
    }
    expect(row(r846.id, hes).sendAfter).toEqual(MON_0933);

    // The forecast behind every screen: both rows "queued", one time.
    for (const listing of [r836, r846]) {
      const rows = await prisma.externalListingInvite.findMany({
        where: { listingId: listing.id, email: { in: [federal, sigma] } },
        select: { email: true, source: true, country: true, sendAfter: true },
      });
      const forecasts = await queuedInviteForecasts(prisma as never, rows, listing, SAT_1007);
      expect(Object.fromEntries(forecasts)).toEqual({
        [federal]: { leavesAt: MON_0932, dropReason: null },
        [sigma]: { leavesAt: MON_0932, dropReason: null },
      });
    }
    const section = async (listingId: string) =>
      Object.fromEntries(
        (await at(SAT_1007, () => new ListingEmailInvitesService(prisma as never, prisma as never).forListing(buyer.auth, listingId))).items.map(
          (i) => [i.email, [i.invite, i.reason, i.sendAfter]],
        ),
      );
    expect(await section(r836.id)).toEqual({
      [federal]: ["QUEUED", null, MON_0932.toISOString()],
      [sigma]: ["QUEUED", null, MON_0932.toISOString()],
      [alone]: ["QUEUED", null, MON_0932.toISOString()],
    });
    expect(await section(r846.id)).toEqual({
      [federal]: ["QUEUED", null, MON_0932.toISOString()],
      [sigma]: ["QUEUED", null, MON_0932.toISOString()],
      [hes]: ["QUEUED", null, MON_0933.toISOString()],
    });

    // Monday: the real dispatcher, minute by minute.
    const d = dispatcherRig();
    expect(await d.tick(new Date(MON_0932.getTime() - MIN))).toEqual([0, 0, 0]);
    expect(await d.tick(MON_0932)).toEqual([3, 0, 0]);
    expect(d.letters()).toEqual([
      `${sigma} tender_invite_digest 2`,
      `${federal} tender_invite_digest 2`,
      `${alone} tender_external_invite 1`,
    ].sort());
    expect(await d.tick(MON_0933)).toEqual([1, 0, 0]);
    expect(await d.tick(new Date(MON_0933.getTime() + MIN))).toEqual([0, 0, 0]);
    // Six rows, four e-mails, every row sent - none held for 7 days, none dropped.
    expect(d.letters()).toHaveLength(4);
    expect(await prisma.externalListingInvite.groupBy({ by: ["state"], _count: true })).toEqual([{ state: "SENT", _count: 6 }]);
  });

  it("any buyer's request, picked in the window too: the letter another buyer queued is joined and both buyers' requests are in one e-mail", async () => {
    const one = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const two = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const theirs = await request(one);
    const mine = await request(two);
    const waitingAt = utc("2026-10-12T06:17");
    await queueRow(one, theirs.id, "satis@ortak.com.tr", { sendAfter: waitingAt });

    spread(40);
    const res = await at(SAT_1007, () => connections().inviteExternalForListing(two.auth, mine.id, tr("satis@ortak.com.tr"), "AI_FORM"));

    expect(res.results).toEqual([{ email: "satis@ortak.com.tr", status: "QUEUED", sendAfter: waitingAt.toISOString() }]);
    const d = dispatcherRig();
    expect(await d.tick(waitingAt)).toEqual([1, 0, 0]);
    expect(d.letters()).toEqual(["satis@ortak.com.tr tender_invite_digest 2"]);
  });

  it("never before the row's own send window, and only a letter the dispatcher will read: an earlier, a later and an unread letter are not joined", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const other = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const mine = await request(buyer);
    const inRange = utc("2026-10-12T06:10");
    // Earlier than Monday 09:00 in Istanbul: a typed letter that is due now, and a letter planned for Tokyo's Monday morning.
    await queueRow(other, (await request(other)).id, "erken@firma.com.tr", { source: "MANUAL", sendAfter: SAT_1000 });
    await queueRow(other, (await request(other)).id, "erken@firma.com.tr", { country: "JP", sendAfter: utc("2026-10-12T00:20") });
    // Later than the spread: a letter on its 7-day hold, planned for Tuesday.
    await queueRow(other, (await request(other)).id, "gec@firma.com.tr", { sendAfter: utc("2026-10-13T06:10") });
    // In the range, but not a row the dispatcher reads: a draft, a closed request, an automatic letter of a request
    // whose search box was switched off, a letter whose invitation link was cancelled, a letter that was already sent.
    await queueRow(other, (await request(other, { status: "DRAFT" })).id, "taslak@firma.com.tr", { sendAfter: inRange });
    await queueRow(other, (await request(other, { status: "CLOSED_NO_AWARD" })).id, "kapandi@firma.com.tr", { sendAfter: inRange });
    await queueRow(other, (await request(other, { aiDiscovery: false })).id, "kutu@firma.com.tr", { sendAfter: inRange });
    const cancelled = await queueRow(other, (await request(other)).id, "iptal@firma.com.tr", { sendAfter: inRange });
    await prisma.companyReferralInvite.update({ where: { id: cancelled.referralInviteId }, data: { status: "CANCELLED" } });
    await queueRow(other, (await request(other)).id, "gitti@firma.com.tr", { state: "SENT", sentAt: SAT_1000, sendAfter: inRange });

    const emails = ["erken", "gec", "taslak", "kapandi", "kutu", "iptal", "gitti"].map((n) => `${n}@firma.com.tr`);
    spread(33);
    await at(SAT_1007, () => connections().inviteExternalForListing(buyer.auth, mine.id, tr(...emails), "AI_AUTO"));

    const rows = await prisma.externalListingInvite.findMany({ where: { listingId: mine.id }, select: { email: true, sendAfter: true } });
    expect(rows).toHaveLength(emails.length);
    // Every row has its own spread: Monday 09:33 - and none is planned before the window opens.
    for (const r of rows) {
      expect([r.email, r.sendAfter.toISOString()]).toEqual([r.email, MON_0933.toISOString()]);
      expect(r.sendAfter.getTime()).toBeGreaterThanOrEqual(MON_0900.getTime());
    }
  });

  /**
   * Review R8-1. The range a row may join in is 45 minutes long; queued in the
   * last 45 minutes of its window it reaches past 16:00 local. Joined to a
   * letter that waits there, the row was answered "queued, 16:20", was found
   * outside its window at that minute, moved to Monday and dropped there
   * (`FREQUENCY`) by the hold of the very letter it had joined.
   */
  it("never after the row's own send window either: in the window's last 45 minutes a typed letter's retry and another country's letter that wait after 16:00 local are not joined - the row is due now and leaves at once", async () => {
    const one = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const two = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const mine = await request(two);
    const FRI_1550 = utc("2026-10-09T12:50");
    const FRI_1551 = utc("2026-10-09T12:51");
    const queuedEarlier = utc("2026-10-09T08:00");
    // Buyer one typed this address; the send failed and is retried at 16:20 in Istanbul (a typed letter keeps no window).
    const retry = utc("2026-10-09T13:20");
    await queueRow(one, (await request(one)).id, "satis@ortak.com.tr", {
      source: "MANUAL",
      attempts: 1,
      sendAfter: retry,
      createdAt: queuedEarlier,
    });
    // Another search stored this address with a Polish label: 15:10 in Warsaw is 16:10 in Istanbul.
    const warsaw = utc("2026-10-09T13:10");
    await queueRow(one, (await request(one)).id, "biuro@ortak-polska.com", { country: "PL", sendAfter: warsaw, createdAt: queuedEarlier });

    spread(20);
    const emails = ["satis@ortak.com.tr", "biuro@ortak-polska.com"];
    const res = await at(FRI_1550, () => connections().inviteExternalForListing(two.auth, mine.id, tr(...emails), "AI_FORM"));

    // Friday 15:50 is a minute of the window: planned for now, not for 16:20 / 16:10.
    expect(res.results).toEqual(emails.map((email) => ({ email, status: "QUEUED", sendAfter: FRI_1550.toISOString() })));
    const queued = await stored({ listingId: mine.id });
    for (const email of emails) expect(queued(mine.id, email).sendAfter).toEqual(FRI_1550);

    const d = dispatcherRig();
    expect(await d.tick(FRI_1551)).toEqual([2, 0, 0]);
    const sent = await stored({ listingId: mine.id });
    for (const email of emails) expect(sent(mine.id, email)).toMatchObject({ state: "SENT", cancelReason: null });
    // The letters that were waiting keep their own rules: Warsaw's meets the hold of the letter that has just left
    // and waits for it, the typed one leaves on its retry. Nothing is dropped.
    expect(await d.tick(warsaw)).toEqual([0, 1, 0]);
    expect(await d.tick(retry)).toEqual([1, 0, 0]);
    expect(d.letters()).toEqual([
      "biuro@ortak-polska.com tender_external_invite 1",
      "satis@ortak.com.tr tender_external_invite 1",
      "satis@ortak.com.tr tender_external_invite 1",
    ]);
    expect(await prisma.externalListingInvite.count({ where: { state: { in: ["CANCELLED", "FAILED"] } } })).toBe(0);
  });

  /**
   * Review R8-4. The earliest waiting letter is the one joined - "the one
   * certain to leave on time". A letter whose request closes before its
   * planned time is certain NOT to leave (`LISTING_CLOSED`): joined to it, the
   * new row left alone and the later letter it should have joined was held 7
   * days and dropped.
   */
  it("only a letter that can still leave is joined: one whose request closes before its planned time is passed over for the next - which then leaves in the same e-mail", async () => {
    const one = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const two = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const email = "satis@kapanan.com.tr";
    const MON_0905 = utc("2026-10-12T06:05");
    const MON_0910 = utc("2026-10-12T06:10");
    const MON_0930 = utc("2026-10-12T06:30");
    const closesFirst = await request(one, { closesAt: MON_0905 });
    const stays = await request(one);
    const mine = await request(two);
    await queueRow(one, closesFirst.id, email, { sendAfter: MON_0910 });
    await queueRow(one, stays.id, email, { sendAfter: MON_0930 });

    spread(40);
    const res = await at(SAT_1007, () => connections().inviteExternalForListing(two.auth, mine.id, tr(email), "AI_FORM"));

    expect(res.results).toEqual([{ email, status: "QUEUED", sendAfter: MON_0930.toISOString() }]);
    expect((await stored())(mine.id, email).sendAfter).toEqual(MON_0930);

    // Monday 09:05: the first request closes; its letter is dropped when its turn comes.
    await prisma.listing.update({ where: { id: closesFirst.id }, data: { status: "CLOSED_NO_AWARD" } });
    const d = dispatcherRig();
    expect(await d.tick(MON_0910)).toEqual([0, 0, 1]);
    expect(await d.tick(MON_0930)).toEqual([1, 0, 0]);
    expect(d.letters()).toEqual([`${email} tender_invite_digest 2`]);
    const row = await stored();
    expect(row(closesFirst.id, email)).toMatchObject({ state: "CANCELLED", cancelReason: "LISTING_CLOSED" });
    expect(row(stays.id, email).state).toBe("SENT");
    expect(row(mine.id, email).state).toBe("SENT");
  });

  it("an address the buyer typed keeps its rule: due at once, also when a letter waits for it", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const earlier = await request(buyer);
    const typed = await request(buyer);
    await queueRow(buyer, earlier.id, "tanidik@firma.com.tr", { sendAfter: MON_0932 });

    const res = await at(SAT_1007, () => connections().inviteExternalForListing(buyer.auth, typed.id, ["tanidik@firma.com.tr"], "MANUAL"));

    expect(res.results).toEqual([{ email: "tanidik@firma.com.tr", status: "QUEUED", sendAfter: SAT_1007.toISOString() }]);
    expect((await stored())(typed.id, "tanidik@firma.com.tr").sendAfter).toEqual(SAT_1007);
  });

  it("the waiting letters are read once for all addresses of the call (none for typed addresses); a read that fails does not fail the invitation", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const earlier = await request(buyer);
    const emails = Array.from({ length: 6 }, (_, i) => `satis${i}@firma${i}.com.tr`);
    for (const email of emails) await queueRow(buyer, earlier.id, email, { sendAfter: MON_0932 });
    const service = connections();
    const realRead = prisma.externalListingInvite.findMany.bind(prisma.externalListingInvite);
    const reads = jest.spyOn(prisma.externalListingInvite, "findMany");
    /** The reads that ask for letters not yet due = the waiting-letter read. */
    const waitingReads = () =>
      reads.mock.calls.filter((c) => !!(c[0] as { where?: { sendAfter?: unknown } } | undefined)?.where?.sendAfter).length;

    spread(33);
    const ai = await request(buyer);
    const res = await at(SAT_1007, () => service.inviteExternalForListing(buyer.auth, ai.id, tr(...emails), "AI_AUTO"));
    expect(res.results.map((r) => r.sendAfter)).toEqual(emails.map(() => MON_0932.toISOString()));
    expect(waitingReads()).toBe(1);
    // The request's own rows + the waiting letters + the forecast's letters ahead: three reads for six addresses.
    expect(reads).toHaveBeenCalledTimes(3);

    reads.mockClear();
    const typed = await request(buyer);
    await at(SAT_1007, () => service.inviteExternalForListing(buyer.auth, typed.id, emails, "MANUAL"));
    expect(waitingReads()).toBe(0);
    expect(reads).toHaveBeenCalledTimes(2);

    // The read fails: the rows are queued with their own spread, as before the rule.
    reads.mockClear();
    reads.mockImplementation(((args: { where?: { sendAfter?: unknown } }) =>
      args?.where?.sendAfter ? Promise.reject(new Error("read failed")) : realRead(args as never)) as never);
    const failed = await request(buyer);
    const out = await at(SAT_1007, () => service.inviteExternalForListing(buyer.auth, failed.id, tr(emails[0]!), "AI_AUTO"));
    expect(out.results.map((r) => r.status)).toEqual(["QUEUED"]);
    expect((await stored())(failed.id, emails[0]!)).toMatchObject({ state: "QUEUED", sendAfter: MON_0933 });
  });

  it("a dropped automatic invitation the buyer sends from the window is planned like a new row: it joins the waiting letter", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const earlier = await request(buyer);
    const revived = await request(buyer, { visibility: "PRIVATE" });
    await queueRow(buyer, earlier.id, "satis@donen.com.tr", { sendAfter: MON_0932 });
    await queueRow(buyer, revived.id, "satis@donen.com.tr", {
      state: "CANCELLED",
      cancelReason: "AUTO_INVITE_OFF",
      sendAfter: utc("2026-10-09T06:20"),
    });

    spread(33);
    const res = await at(SAT_1007, () => connections().inviteExternalForListing(buyer.auth, revived.id, tr("satis@donen.com.tr"), "AI_FORM"));

    expect(res.results).toEqual([{ email: "satis@donen.com.tr", status: "QUEUED", sendAfter: MON_0932.toISOString() }]);
    expect((await stored())(revived.id, "satis@donen.com.tr")).toMatchObject({ state: "QUEUED", cancelReason: null, sendAfter: MON_0932 });
  });
});

describe("DISC-N1: the dispatcher's own re-planning does not split the rows of one address again", () => {
  it("rows of one address held by the daily cap past their window move to ONE time (one spread per address) and leave as one e-mail", async () => {
    const one = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const two = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Joined at queue time: one planned minute, Friday 15:40 in Istanbul.
    const joined = utc("2026-10-09T12:40");
    await queueRow(one, (await request(one)).id, "satis@tavan.com.tr", { sendAfter: joined, createdAt: joined });
    await queueRow(two, (await request(two)).id, "satis@tavan.com.tr", { sendAfter: joined, createdAt: joined });

    // The platform's daily cap is used up (here: set to 0); the window closes at 16:00.
    const capped = dispatcherRig({ COLD_INVITE_MAX_DAILY: "0" });
    spread(7, 29);
    expect(await capped.tick(utc("2026-10-09T13:05"))).toEqual([0, 2, 0]);

    const rows = await prisma.externalListingInvite.findMany({ select: { sendAfter: true, state: true } });
    expect(rows.map((r) => r.state)).toEqual(["QUEUED", "QUEUED"]);
    expect(rows[1]!.sendAfter).toEqual(rows[0]!.sendAfter);
    expect(rows[0]!.sendAfter.getTime()).toBeGreaterThanOrEqual(MON_0900.getTime());
    jest.restoreAllMocks();
    const d = dispatcherRig();
    expect(await d.tick(utc("2026-10-12T06:45"))).toEqual([1, 0, 0]);
    expect(d.letters()).toEqual(["satis@tavan.com.tr tender_invite_digest 2"]);
  });

  it("two dropped automatic invitations of one address come back with ONE planned time, a third joins the letter that waits - and each address gets one e-mail", async () => {
    const one = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const two = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const a = await request(one);
    const b = await request(two);
    const c = await request(two);
    // Dropped while the search box was off; their turn (one shared time) has passed since.
    const dropped = { state: "CANCELLED" as const, cancelReason: "AUTO_INVITE_OFF", sendAfter: utc("2026-10-09T06:20") };
    await queueRow(one, a.id, "satis@ikili.com.tr", dropped);
    await queueRow(two, b.id, "satis@ikili.com.tr", dropped);
    await queueRow(one, a.id, "satis@bekleyen.com.tr", dropped);
    // Another request's letter waits for the second address on Monday.
    await queueRow(two, c.id, "satis@bekleyen.com.tr", { sendAfter: MON_0932 });
    // A dropped row whose turn has NOT passed keeps its own time.
    await queueRow(two, b.id, "satis@sonra.com.tr", { ...dropped, sendAfter: utc("2026-10-13T06:05") });

    const d = dispatcherRig();
    // Every re-planned row would get another minute of the spread.
    spread(4, 40, 22, 11);
    const report = await d.dispatcher.dispatch(SAT_1000);

    expect([report.resumed, report.sent, report.cancelled]).toEqual([4, 0, 0]);
    const row = await stored();
    const pair = [row(a.id, "satis@ikili.com.tr"), row(b.id, "satis@ikili.com.tr")];
    expect(pair.map((r) => r.state)).toEqual(["QUEUED", "QUEUED"]);
    expect(pair[1]!.sendAfter).toEqual(pair[0]!.sendAfter);
    // Monday 09:00-09:45 in Istanbul, not earlier.
    expect(pair[0]!.sendAfter.getTime()).toBeGreaterThanOrEqual(MON_0900.getTime());
    expect(pair[0]!.sendAfter.getTime()).toBeLessThan(MON_0900.getTime() + 45 * MIN);
    expect(row(a.id, "satis@bekleyen.com.tr").sendAfter).toEqual(MON_0932);
    expect(row(b.id, "satis@sonra.com.tr").sendAfter).toEqual(utc("2026-10-13T06:05"));

    jest.restoreAllMocks();
    expect(await d.tick(utc("2026-10-12T06:45"))).toEqual([2, 0, 0]);
    expect(d.letters()).toEqual(["satis@bekleyen.com.tr tender_invite_digest 2", "satis@ikili.com.tr tender_invite_digest 2"]);
    expect(await prisma.externalListingInvite.count({ where: { state: "CANCELLED" } })).toBe(0);
  });
});

/**
 * Review R8-3. Rows that join each other share one planned time, and an e-mail
 * lists five requests (`INVITE_DIGEST_MAX`). The dispatcher sent five of them -
 * ties in an order nobody chose - and read the rest a minute later, under the
 * hold of the e-mail that had just left: dropped (`FREQUENCY`) while the
 * answer, the band, the section and the creator's count had all said "queued,
 * Monday 09:22". The order is now complete (planned time, age, id) and the
 * forecast counts in it.
 */
describe("R8-3: more rows of one address at one planned time than one e-mail lists", () => {
  const email = "satis@populer.com.tr";
  const MON_0922 = utc("2026-10-12T06:22");
  const MON_0923 = utc("2026-10-12T06:23");
  /** Queued on Friday evening, `minute` minutes after 21:00 in Istanbul. */
  const friday = (minute: number) => new Date(utc("2026-10-09T18:00").getTime() + minute * MIN);
  /** What every surface reads for the address on one request. */
  const forecastOf = async (listing: { id: string; closesAt: Date | null }) => {
    const rows = await prisma.externalListingInvite.findMany({
      where: { listingId: listing.id, email },
      select: { email: true, source: true, country: true, sendAfter: true },
    });
    const forecast = (await queuedInviteForecasts(prisma as never, rows, listing, SAT_1007)).get(email)!;
    return forecast.leavesAt ? forecast.leavesAt.toISOString() : forecast.dropReason;
  };

  it("the sixth request that queues the address is told at once that its letter will not leave - and the dispatcher does exactly that: one e-mail with five requests, the sixth dropped", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Five requests queued the address on Friday evening; their rows joined at one planned time.
    const five: Array<Awaited<ReturnType<typeof request>>> = [];
    for (let i = 0; i < 5; i++) {
      const listing = await request(buyer);
      await queueRow(buyer, listing.id, email, { sendAfter: MON_0922, createdAt: friday(i) });
      five.push(listing);
    }
    const sixth = await request(buyer);

    spread(40);
    const res = await at(SAT_1007, () => connections().inviteExternalForListing(buyer.auth, sixth.id, tr(email), "AI_AUTO"));

    // The row is in the queue at the shared time - and the answer says what will become of it.
    expect(res.results).toEqual([{ email, status: "QUEUED", notSentReason: "FREQUENCY" }]);
    expect((await stored())(sixth.id, email)).toMatchObject({ state: "QUEUED", sendAfter: MON_0922 });
    // The same on the request page; the five that fit keep their time.
    const section = await at(SAT_1007, () => new ListingEmailInvitesService(prisma as never, prisma as never).forListing(buyer.auth, sixth.id));
    expect(section.items.map((i) => [i.email, i.invite, i.reason, i.sendAfter])).toEqual([[email, "NOT_SENT", "FREQUENCY", null]]);
    expect(await forecastOf(sixth)).toBe("FREQUENCY");
    for (const listing of five) expect(await forecastOf(listing)).toBe(MON_0922.toISOString());

    // Monday: the real dispatcher.
    const d = dispatcherRig();
    expect(await d.tick(new Date(MON_0922.getTime() - MIN))).toEqual([0, 0, 0]);
    expect(await d.tick(MON_0922)).toEqual([1, 0, 0]);
    expect(d.letters()).toEqual([`${email} tender_invite_digest 5`]);
    const afterRun = await stored();
    for (const listing of five) expect(afterRun(listing.id, email).state).toBe("SENT");
    expect(afterRun(sixth.id, email).state).toBe("QUEUED");
    // A minute later the sixth row meets the hold of that e-mail; its request closes before the hold ends.
    expect(await d.tick(MON_0923)).toEqual([0, 0, 1]);
    expect((await stored())(sixth.id, email)).toMatchObject({ state: "CANCELLED", cancelReason: "FREQUENCY" });
    expect(d.letters()).toHaveLength(1);
  });

  it("which five leave is the queue's order, not chance - planned time, then age, then id: the forecast names the row that stays behind before the run, whatever order the rows were written in", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Written newest first; the two newest were queued in the same millisecond (the id decides between them).
    const written = [
      { id: "r8queueorderb", minute: 9 },
      { id: "r8queueordera", minute: 9 },
      { id: "r8queueorderf", minute: 3 },
      { id: "r8queueordere", minute: 1 },
      { id: "r8queueorderd", minute: 2 },
      { id: "r8queueorderc", minute: 0 },
    ];
    const listings: Array<Awaited<ReturnType<typeof request>>> = [];
    for (const w of written) {
      const listing = await request(buyer);
      await queueRow(buyer, listing.id, email, { id: w.id, sendAfter: MON_0922, createdAt: friday(w.minute) });
      listings.push(listing);
    }
    const [behind, ...leaving] = listings;

    expect(await forecastOf(behind!)).toBe("FREQUENCY");
    for (const listing of leaving) expect(await forecastOf(listing)).toBe(MON_0922.toISOString());

    const d = dispatcherRig();
    expect(await d.tick(MON_0922)).toEqual([1, 0, 0]);
    expect(d.letters()).toEqual([`${email} tender_invite_digest 5`]);
    const afterRun = await stored();
    for (const listing of leaving) expect(afterRun(listing.id, email).state).toBe("SENT");
    expect(afterRun(behind!.id, email).state).toBe("QUEUED");
    expect(await d.tick(MON_0923)).toEqual([0, 0, 1]);
    expect((await stored())(behind!.id, email)).toMatchObject({ state: "CANCELLED", cancelReason: "FREQUENCY" });
  });
});
