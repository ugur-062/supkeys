/**
 * COLD INVITATION - THE RECIPIENT'S BUSINESS HOURS ARE RE-CHECKED AT SEND TIME
 * (live re-check 2026-10-09, AUTO-HOURS-1).
 *
 * Promise on the screens and in the creator e-mail: an invitation to a
 * supplier the AI found leaves "in business hours of its own country" -
 * weekday 09:00-16:00 local. The window was applied only when the row was
 * queued. Seen live: seven letters queued at 15:55 local left at 16:07 (the
 * dispatcher waited for a translation in 2-minute steps); nine Turkish letters
 * left at 16:44 after the stack came back up. From the code: a row held by the
 * platform's daily cap was released at 00:00 UTC = 03:00 in Istanbul.
 *
 * Contract (single definition `coldInviteSendAt`, asked by the dispatcher):
 *  - an AI-sourced row (`AI_FORM`, `AI_AUTO`) whose turn comes outside the
 *    window is NOT sent; its `sendAfter` moves to the next window start, so
 *    the planned time the buyer sees is the time the letter leaves;
 *  - the translation wait and the retry after a failed send are planned
 *    inside the window too;
 *  - a row held by the daily cap is re-planned when its window closes, and is
 *    not sent at the 00:00 UTC release;
 *  - the reminder keeps the same window;
 *  - exempt as before: an address the buyer typed (`MANUAL`) and an address
 *    that opened an invitation link.
 *
 * Round 6 review of that change:
 *  - R6-1: a reminder period (6-48 hours before closing) that lies in the
 *    weekend has no window minute - the reminder leaves in the last window
 *    before it (Friday) instead of never (`reminderLeavesNow`);
 *  - R6-2: reminders that wait for their window do not use up the batch - every
 *    candidate is looked at, so a reminder that may leave now leaves now.
 *
 * EVERY CLOCK IS FIXED: rows, mail log lines and request dates are written
 * with explicit times, so the suite gives the same answer at any hour. This
 * file must NOT call `holdInviteSendWindowOpen()`.
 */
import { Prisma } from "@rothern/db";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { INVITE_WINDOW_JITTER_MINUTES } from "../../src/common/company/external-invite-policy";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const utc = (iso: string) => new Date(`${iso}:00.000Z`);

/** Friday 9 October 2026, 14:07 UTC - the minute the seven letters of the live finding left. */
const FRI_1407 = utc("2026-10-09T14:07");

type SendArg = {
  to: { email: string };
  locale: string;
  templateData: { template: string; data: Record<string, unknown> };
  context: { type: string; id: string };
};

/**
 * Writes the mail log line the real EmailService writes, stamped with the
 * TEST clock (the cap and the 7-day hold read `queuedAt`).
 */
function makeEmail(clock: { now: Date }, outcome: "sent" | "throws" = "sent") {
  return {
    send: jest.fn(async (a: SendArg) => {
      if (outcome === "throws") throw new Error("provider down");
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

function rig(opts: { config?: Record<string, string>; translations?: unknown; outcome?: "sent" | "throws" } = {}) {
  const clock = { now: FRI_1407 };
  const email = makeEmail(clock, opts.outcome);
  const config = { get: jest.fn((k: string) => opts.config?.[k] ?? (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
  const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, config as never, opts.translations as never);
  /** One dispatcher minute at the given moment. */
  const tick = (at: Date) => {
    clock.now = at;
    return dispatcher.dispatch(at);
  };
  const sentTo = () => email.send.mock.calls.map((c) => (c[0] as SendArg).to.email).sort();
  return { email, tick, sentTo };
}

type Buyer = Awaited<ReturnType<typeof makeCompanyWithUser>>;

async function request(owner: Buyer, closesAt: Date) {
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    // The automatic search is on: an `AI_AUTO` row of a request with the box off is dropped (`AUTO_INVITE_OFF`).
    aiDiscovery: true,
    closesAt,
  });
  await makeItem(prisma, listing.id, { name: "Civata M8", quantity: new Prisma.Decimal(100), unit: "adet", unitCode: "PCE" });
  return listing;
}

/** A queue row written directly: every time on it is the test's, not the machine's. */
async function queueRow(
  owner: Buyer,
  listingId: string,
  email: string,
  over: Partial<Prisma.ExternalListingInviteUncheckedCreateInput> & { clickedAt?: Date } = {},
) {
  const { clickedAt, ...row } = over;
  const referral = await prisma.companyReferralInvite.upsert({
    where: { inviterCompanyId_email: { inviterCompanyId: owner.company.id, email } },
    create: {
      inviterCompanyId: owner.company.id,
      email,
      invitedById: owner.user.id,
      listingId,
      locale: "en",
      ...(clickedAt ? { lastClickedAt: clickedAt } : {}),
    },
    update: {},
    select: { id: true },
  });
  return prisma.externalListingInvite.create({
    data: {
      listingId,
      inviterCompanyId: owner.company.id,
      referralInviteId: referral.id,
      email,
      locale: "en",
      source: "AI_AUTO",
      state: "QUEUED",
      ...row,
    },
  });
}

const rowOf = (email: string) => prisma.externalListingInvite.findFirstOrThrow({ where: { email } });

/** `sendAfter` is the window start plus the spread (0 .. 44 minutes). */
function expectPlannedAt(sendAfter: Date, windowStart: Date) {
  expect(sendAfter.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
  expect(sendAfter.getTime()).toBeLessThan(windowStart.getTime() + INVITE_WINDOW_JITTER_MINUTES * MIN);
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("AUTO-HOURS-1: a row whose turn comes outside the recipient's window is not sent, it is planned for the next window", () => {
  it("Friday 14:07 UTC, rows due since 13:55: Madrid / Istanbul / Dubai / Tokyo wait for Monday 09:00 local, London and Sao Paulo leave now; typed and engaged addresses are exempt", async () => {
    const r = rig();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, new Date(FRI_1407.getTime() + 20 * DAY));
    const due = { sendAfter: utc("2026-10-09T13:55"), createdAt: utc("2026-10-09T13:55") };
    await queueRow(owner, listing.id, "ventas@acero.es", { ...due, country: "ES" });
    await queueRow(owner, listing.id, "satis@celik.com.tr", { ...due, country: "TR" });
    await queueRow(owner, listing.id, "sales@steel.ae", { ...due, country: "AE" });
    await queueRow(owner, listing.id, "sales@kogyo.jp", { ...due, country: "JP" });
    await queueRow(owner, listing.id, "sales@steelworks.co.uk", { ...due, country: "GB" });
    await queueRow(owner, listing.id, "vendas@aco.com.br", { ...due, country: "BR" });
    // No country on the row and none in the address: Istanbul.
    await queueRow(owner, listing.id, "info@globalsteel.com", { ...due, country: null, source: "AI_FORM" });
    // Exempt: typed by the buyer; found by the AI but the address opened an invitation link.
    await queueRow(owner, listing.id, "tanidik@tedarikci.com.tr", { ...due, country: "TR", source: "MANUAL" });
    await queueRow(owner, listing.id, "ilgili@tedarikci.com.tr", {
      ...due,
      country: "TR",
      source: "AI_FORM",
      clickedAt: utc("2026-10-08T09:00"),
    });

    const report = await r.tick(FRI_1407);

    expect(r.sentTo()).toEqual(
      ["ilgili@tedarikci.com.tr", "sales@steelworks.co.uk", "tanidik@tedarikci.com.tr", "vendas@aco.com.br"].sort(),
    );
    expect([report.sent, report.deferred, report.cancelled]).toEqual([4, 5, 0]);
    // Not sent, still queued, and the planned time is Monday 09:00 in the recipient's country.
    const monday: Record<string, Date> = {
      "ventas@acero.es": utc("2026-10-12T07:00"),
      "satis@celik.com.tr": utc("2026-10-12T06:00"),
      "info@globalsteel.com": utc("2026-10-12T06:00"),
      "sales@steel.ae": utc("2026-10-12T05:00"),
      "sales@kogyo.jp": utc("2026-10-12T00:00"),
    };
    for (const [email, start] of Object.entries(monday)) {
      const row = await rowOf(email);
      expect([email, row.state, row.sentAt]).toEqual([email, "QUEUED", null]);
      expectPlannedAt(row.sendAfter, start);
    }

    // Nothing moves over the weekend.
    expect((await r.tick(utc("2026-10-10T10:00"))).sent).toBe(0);
    expect((await r.tick(utc("2026-10-11T10:00"))).sent).toBe(0);

    // Monday 07:50 UTC: 09:50 Madrid, 10:50 Istanbul, 11:50 Dubai are inside the
    // window. Tokyo's turn came at 09:00 local but nobody ran the queue until
    // 16:50 local (stack down) - it is planned again, for Tuesday 09:00 Tokyo.
    const mondayReport = await r.tick(utc("2026-10-12T07:50"));
    expect(mondayReport.sent).toBe(4);
    expect(r.sentTo()).not.toContain("sales@kogyo.jp");
    const tokyo = await rowOf("sales@kogyo.jp");
    expect(tokyo.state).toBe("QUEUED");
    expectPlannedAt(tokyo.sendAfter, utc("2026-10-13T00:00"));
    // Tuesday 00:50 UTC = 09:50 in Tokyo.
    expect((await r.tick(utc("2026-10-13T00:50"))).sent).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { state: "SENT" } })).toBe(9);
  });

  it("the letters of one address keep ONE planned time and still leave as a single digest", async () => {
    const r = rig();
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const closes = new Date(FRI_1407.getTime() + 20 * DAY);
    const la = await request(a, closes);
    const lb = await request(b, closes);
    const due = { sendAfter: utc("2026-10-09T13:55"), createdAt: utc("2026-10-09T13:55"), country: "TR", source: "AI_FORM" as const };
    await queueRow(a, la.id, "ortak@tedarikci.com.tr", due);
    await queueRow(b, lb.id, "ortak@tedarikci.com.tr", due);

    expect((await r.tick(FRI_1407)).sent).toBe(0);
    const planned = await prisma.externalListingInvite.findMany({ where: { email: "ortak@tedarikci.com.tr" } });
    expect(planned).toHaveLength(2);
    expect(planned[0]!.sendAfter.getTime()).toBe(planned[1]!.sendAfter.getTime());
    expectPlannedAt(planned[0]!.sendAfter, utc("2026-10-12T06:00"));

    expect((await r.tick(utc("2026-10-12T06:50"))).sent).toBe(1);
    expect(r.email.send).toHaveBeenCalledTimes(1);
    const sent = r.email.send.mock.calls[0]![0] as SendArg;
    expect(sent.templateData.template).toBe("tender_invite_digest");
    expect((sent.templateData.data.invites as unknown[]).length).toBe(2);
  });

  it("a request that closes before the next window: the row is planned truthfully, never sent at night, and drops when the request closes", async () => {
    const r = rig();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Closes on Saturday; the next window is Monday.
    const listing = await request(owner, utc("2026-10-10T12:00"));
    await queueRow(owner, listing.id, "satis@celik.com.tr", {
      sendAfter: utc("2026-10-09T13:55"),
      createdAt: utc("2026-10-09T13:55"),
      country: "TR",
    });

    expect((await r.tick(FRI_1407)).sent).toBe(0);
    expectPlannedAt((await rowOf("satis@celik.com.tr")).sendAfter, utc("2026-10-12T06:00"));
    // The closing job sets the request's state; the next minute drops the row.
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "CLOSED_NO_AWARD" } });
    const report = await r.tick(utc("2026-10-10T12:01"));
    expect([report.sent, report.cancelled]).toEqual([0, 1]);
    expect(await rowOf("satis@celik.com.tr")).toMatchObject({ state: "CANCELLED", cancelReason: "LISTING_CLOSED", sentAt: null });
    expect(r.email.send).not.toHaveBeenCalled();
  });
});

describe("AUTO-HOURS-1: the translation wait and the retry are planned inside the window", () => {
  /** Translation service that is switched on and never has the translation ready. */
  const pendingTranslation = () => ({
    enabled: true,
    ensureTranslated: jest.fn().mockResolvedValue(false),
    localizeListings: jest.fn(async (rows: unknown[]) => rows),
  });

  it("a 2-minute step taken at 15:59 Madrid ends after hours: the row is planned for Monday 09:00, not for 16:01", async () => {
    const r = rig({ translations: pendingTranslation() });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, new Date(FRI_1407.getTime() + 20 * DAY));
    const now = utc("2026-10-09T13:59"); // Friday 15:59 in Madrid, 16:59 in Istanbul
    const fresh = { sendAfter: utc("2026-10-09T13:57"), createdAt: utc("2026-10-09T13:55") };
    await queueRow(owner, listing.id, "ventas@acero.es", { ...fresh, country: "ES" });
    // Typed address: the wait stays a plain 2-minute step.
    await queueRow(owner, listing.id, "conocido@proveedor.es", { ...fresh, country: "ES", source: "MANUAL" });

    const report = await r.tick(now);

    expect([report.sent, report.deferred]).toEqual([0, 2]);
    expectPlannedAt((await rowOf("ventas@acero.es")).sendAfter, utc("2026-10-12T07:00"));
    expect((await rowOf("conocido@proveedor.es")).sendAfter).toEqual(new Date(now.getTime() + 2 * MIN));
  });

  it("inside the window the wait is still 2 minutes", async () => {
    const r = rig({ translations: pendingTranslation() });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, new Date(FRI_1407.getTime() + 20 * DAY));
    const now = utc("2026-10-09T10:00"); // Friday 12:00 in Madrid
    await queueRow(owner, listing.id, "ventas@acero.es", {
      sendAfter: utc("2026-10-09T09:58"),
      createdAt: utc("2026-10-09T09:56"),
      country: "ES",
    });

    expect((await r.tick(now)).deferred).toBe(1);
    expect((await rowOf("ventas@acero.es")).sendAfter).toEqual(new Date(now.getTime() + 2 * MIN));
  });

  it("a failed send at 15:45 Istanbul: the retry 30 minutes later would be after hours, so it is planned for the next morning", async () => {
    const r = rig({ outcome: "throws" });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, new Date(FRI_1407.getTime() + 20 * DAY));
    const now = utc("2026-10-08T12:45"); // Thursday 15:45 in Istanbul
    const due = { sendAfter: utc("2026-10-08T12:40"), createdAt: utc("2026-10-08T07:00"), country: "TR" };
    await queueRow(owner, listing.id, "satis@celik.com.tr", due);
    await queueRow(owner, listing.id, "tanidik@tedarikci.com.tr", { ...due, source: "MANUAL" });

    await r.tick(now);

    const ai = await rowOf("satis@celik.com.tr");
    expect([ai.state, ai.attempts]).toEqual(["QUEUED", 1]);
    expectPlannedAt(ai.sendAfter, utc("2026-10-09T06:00"));
    expect((await rowOf("tanidik@tedarikci.com.tr")).sendAfter).toEqual(new Date(now.getTime() + 30 * MIN));
  });
});

describe("AUTO-HOURS-1: the platform's daily cap", () => {
  const CAP_ONE = { COLD_INVITE_BASE_DAILY: "1" };

  /** One invitation letter already left on that UTC day: a cap of 1 is used up. */
  const usedCapOn = (at: Date) =>
    prisma.emailLog.create({
      data: {
        template: "tender_external_invite",
        toEmail: "baska@firma.com.tr",
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "tender_external_invite",
        contextId: "earlier",
        queuedAt: at,
      },
    });

  it("cap released at 00:00 UTC (03:00 in Istanbul): the waiting row is NOT sent at night, it leaves in that day's 09:00 window", async () => {
    const r = rig({ config: CAP_ONE });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, new Date(FRI_1407.getTime() + 20 * DAY));
    await usedCapOn(utc("2026-10-07T09:00")); // Wednesday
    const dueSince = utc("2026-10-07T09:30"); // Wednesday 12:30 in Istanbul
    await queueRow(owner, listing.id, "satis@celik.com.tr", { sendAfter: dueSince, createdAt: dueSince, country: "TR" });

    // Wednesday 12:40 Istanbul: cap used up, the window is open - the row keeps its place.
    let report = await r.tick(utc("2026-10-07T09:40"));
    expect([report.cap.cap, report.sent, report.deferred]).toEqual([1, 0, 0]);
    expect((await rowOf("satis@celik.com.tr")).sendAfter).toEqual(dueSince);

    // The queue did not run again until the cap was released: Thursday 00:05 UTC = 03:05 in Istanbul.
    report = await r.tick(utc("2026-10-08T00:05"));
    expect([report.sent, report.deferred]).toEqual([0, 1]);
    expect(r.email.send).not.toHaveBeenCalled();
    const row = await rowOf("satis@celik.com.tr");
    expect(row.state).toBe("QUEUED");
    expectPlannedAt(row.sendAfter, utc("2026-10-08T06:00"));

    // Thursday 09:50 in Istanbul.
    report = await r.tick(utc("2026-10-08T06:50"));
    expect(report.sent).toBe(1);
    expect(await rowOf("satis@celik.com.tr")).toMatchObject({ state: "SENT", sentAt: utc("2026-10-08T06:50") });
  });

  it("while the cap holds the row, the planned time shown to the buyer becomes true as soon as the window closes; a typed address keeps its place", async () => {
    const r = rig({ config: CAP_ONE });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, new Date(FRI_1407.getTime() + 20 * DAY));
    await usedCapOn(utc("2026-10-07T09:00"));
    const dueSince = utc("2026-10-07T09:30");
    await queueRow(owner, listing.id, "satis@celik.com.tr", { sendAfter: dueSince, createdAt: dueSince, country: "TR" });
    await queueRow(owner, listing.id, "tanidik@tedarikci.com.tr", {
      sendAfter: dueSince,
      createdAt: dueSince,
      country: "TR",
      source: "MANUAL",
    });

    // Wednesday 21:00 in Istanbul: still the same UTC day, the cap is still used up.
    const report = await r.tick(utc("2026-10-07T18:00"));

    expect([report.sent, report.deferred]).toEqual([0, 1]);
    expectPlannedAt((await rowOf("satis@celik.com.tr")).sendAfter, utc("2026-10-08T06:00"));
    expect((await rowOf("tanidik@tedarikci.com.tr")).sendAfter).toEqual(dueSince);
    // A second minute does not move the row again.
    const again = await r.tick(utc("2026-10-07T18:01"));
    expect(again.deferred).toBe(0);
  });
});

describe("AUTO-HOURS-1: the reminder keeps the same window", () => {
  it("Wednesday 21:00 Istanbul: the reminder of an AI-found address waits for the morning; a typed address and an address that opened its link get theirs", async () => {
    const r = rig();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Closes Thursday 21:00 Istanbul: Wednesday evening is 24 hours before, Thursday morning 11 hours before.
    const closes = utc("2026-10-08T18:00");
    const ai = await request(owner, closes);
    const typed = await request(owner, closes);
    const engaged = await request(owner, closes);
    const sentOn = { state: "SENT" as const, sentAt: utc("2026-10-05T08:00"), sendAfter: utc("2026-10-05T08:00"), createdAt: utc("2026-10-05T07:00") };
    await queueRow(owner, ai.id, "satis@celik.com.tr", { ...sentOn, country: "TR", source: "AI_AUTO" });
    await queueRow(owner, typed.id, "tanidik@tedarikci.com.tr", { ...sentOn, country: "TR", source: "MANUAL" });
    await queueRow(owner, engaged.id, "ilgili@tedarikci.com.tr", {
      ...sentOn,
      country: "TR",
      source: "AI_AUTO",
      clickedAt: utc("2026-10-06T09:00"),
    });

    let report = await r.tick(utc("2026-10-07T18:00"));
    expect(report.reminders).toBe(2);
    expect(r.sentTo()).toEqual(["ilgili@tedarikci.com.tr", "tanidik@tedarikci.com.tr"]);
    expect((await rowOf("satis@celik.com.tr")).reminderSentAt).toBeNull();

    // Thursday 10:00 in Istanbul.
    report = await r.tick(utc("2026-10-08T07:00"));
    expect(report.reminders).toBe(1);
    expect(r.sentTo()).toEqual(["ilgili@tedarikci.com.tr", "satis@celik.com.tr", "tanidik@tedarikci.com.tr"]);
    const reminder = r.email.send.mock.calls.at(-1)![0] as SendArg;
    expect(reminder.templateData.data).toMatchObject({ reminder: true });
    expect((await rowOf("satis@celik.com.tr")).reminderSentAt).toEqual(utc("2026-10-08T07:00"));
  });
});

describe("R6-1: a reminder period without a window minute - the reminder leaves in the last window before it", () => {
  it("request closes Monday 10:00 Istanbul (period Saturday 10:00 - Monday 04:00): the AI-found address gets its reminder on Friday 09:00, not on Thursday and not never; typed and engaged addresses keep Saturday 10:00; a request closing Tuesday keeps Monday", async () => {
    const r = rig();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Created Monday 5 October 10:00 with the 7-day chip.
    const monday = await request(owner, utc("2026-10-12T07:00"));
    // One day later: Monday's window (09:00-16:00) is inside its period.
    const tuesday = await request(owner, utc("2026-10-13T07:00"));
    const sentOn = { state: "SENT" as const, sentAt: utc("2026-10-05T08:00"), sendAfter: utc("2026-10-05T08:00"), createdAt: utc("2026-10-05T07:00") };
    await queueRow(owner, monday.id, "satis@celik.com.tr", { ...sentOn, country: "TR", source: "AI_AUTO" });
    await queueRow(owner, monday.id, "tanidik@tedarikci.com.tr", { ...sentOn, country: "TR", source: "MANUAL" });
    await queueRow(owner, monday.id, "ilgili@tedarikci.com.tr", {
      ...sentOn,
      country: "TR",
      source: "AI_AUTO",
      clickedAt: utc("2026-10-06T09:00"),
    });
    await queueRow(owner, tuesday.id, "satis@boru.com.tr", { ...sentOn, country: "TR", source: "AI_AUTO" });

    // Thursday 10:30 and 15:30 Istanbul: the window is open and the request is within the hours the
    // dispatcher reads, but Friday's window is still ahead - too early.
    expect((await r.tick(utc("2026-10-08T07:30"))).reminders).toBe(0);
    expect((await r.tick(utc("2026-10-08T12:30"))).reminders).toBe(0);
    // Friday 08:50 Istanbul: the window is not open yet.
    expect((await r.tick(utc("2026-10-09T05:50"))).reminders).toBe(0);
    expect(r.email.send).not.toHaveBeenCalled();

    // Friday 09:00 Istanbul, 73 hours before closing.
    expect((await r.tick(utc("2026-10-09T06:00"))).reminders).toBe(1);
    expect(r.sentTo()).toEqual(["satis@celik.com.tr"]);
    expect((r.email.send.mock.calls[0]![0] as SendArg).templateData.data).toMatchObject({ reminder: true });
    expect((await rowOf("satis@celik.com.tr")).reminderSentAt).toEqual(utc("2026-10-09T06:00"));

    // The rest of Friday and Saturday morning: nothing more - one reminder, and nobody else's turn.
    for (let t = utc("2026-10-09T06:30").getTime(); t < utc("2026-10-10T07:00").getTime(); t += 30 * MIN) {
      expect((await r.tick(new Date(t))).reminders).toBe(0);
    }
    // Saturday 10:00 Istanbul = 48 hours before closing: the addresses that have every minute of the period.
    expect((await r.tick(utc("2026-10-10T07:00"))).reminders).toBe(2);
    expect(r.sentTo()).toEqual(["ilgili@tedarikci.com.tr", "satis@celik.com.tr", "tanidik@tedarikci.com.tr"]);

    // The Tuesday request was never early: Sunday is inside its period but outside the window, Monday 09:00 is its minute.
    expect((await rowOf("satis@boru.com.tr")).reminderSentAt).toBeNull();
    expect((await r.tick(utc("2026-10-11T08:00"))).reminders).toBe(0);
    expect((await r.tick(utc("2026-10-12T06:00"))).reminders).toBe(1);
    expect((await rowOf("satis@boru.com.tr")).reminderSentAt).toEqual(utc("2026-10-12T06:00"));
    expect(r.email.send).toHaveBeenCalledTimes(4);
  });
});

describe("R6-2: reminders that wait for their window do not hold back the ones behind them", () => {
  const sentAt = (iso: string) => ({ state: "SENT" as const, sentAt: utc(iso), sendAfter: utc(iso), createdAt: utc(iso) });

  /** Invitation letters that already left on that UTC day (they count against the platform's daily cap). */
  const lettersSentOn = (at: Date, count: number) =>
    prisma.emailLog.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        template: "tender_external_invite",
        toEmail: `baska${i}@firma.com.tr`,
        subject: "s",
        provider: "test",
        status: "SENT" as const,
        contextType: "tender_external_invite",
        contextId: `earlier-${i}`,
        queuedAt: at,
      })),
    });

  it("budget 1 (cap 3, two letters already sent today): two AI reminders waiting for the morning, a typed address behind them - the typed one leaves at 21:00, the two in the morning", async () => {
    const r = rig({ config: { COLD_INVITE_MAX_DAILY: "3" } });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Closes Thursday 21:00 Istanbul: every tick below is inside the reminder period.
    const listing = await request(owner, utc("2026-10-08T18:00"));
    await queueRow(owner, listing.id, "satis@celik.com.tr", { ...sentAt("2026-10-05T05:00"), country: "TR" });
    await queueRow(owner, listing.id, "info@demir.com.tr", { ...sentAt("2026-10-05T05:01"), country: "TR" });
    await queueRow(owner, listing.id, "tanidik@tedarikci.com.tr", { ...sentAt("2026-10-05T06:00"), country: "TR", source: "MANUAL" });
    await lettersSentOn(utc("2026-10-07T09:00"), 2);

    // Wednesday 21:00 Istanbul.
    const evening = await r.tick(utc("2026-10-07T18:00"));
    expect([evening.cap.cap, evening.reminders]).toEqual([3, 1]);
    expect(r.sentTo()).toEqual(["tanidik@tedarikci.com.tr"]);
    // The cap is used up for the day; the waiting rows are untouched.
    expect((await r.tick(utc("2026-10-07T20:00"))).reminders).toBe(0);
    expect(await prisma.externalListingInvite.count({ where: { reminderSentAt: null } })).toBe(2);

    // Thursday 10:00 Istanbul: their window is open (and a new day's cap).
    expect((await r.tick(utc("2026-10-08T07:00"))).reminders).toBe(2);
    expect(r.sentTo()).toEqual(["info@demir.com.tr", "satis@celik.com.tr", "tanidik@tedarikci.com.tr"]);
  });

  it("more waiting reminders than one page: Tokyo's reminder behind 301 European ones leaves in Tokyo's morning; the budget still bounds a run", async () => {
    const r = rig();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await request(owner, utc("2026-10-08T22:00"));
    // 301 Spanish addresses invited in one minute (one `sentAt`: the page boundary falls inside a tie)...
    const spanish = Array.from({ length: 301 }, (_, i) => `ventas${i}@acero${i}.es`);
    await prisma.companyReferralInvite.createMany({
      data: spanish.map((email) => ({
        inviterCompanyId: owner.company.id,
        email,
        invitedById: owner.user.id,
        listingId: listing.id,
        locale: "en",
      })),
    });
    const referrals = await prisma.companyReferralInvite.findMany({
      where: { inviterCompanyId: owner.company.id },
      select: { id: true, email: true },
    });
    await prisma.externalListingInvite.createMany({
      data: referrals.map((ref) => ({
        listingId: listing.id,
        inviterCompanyId: owner.company.id,
        referralInviteId: ref.id,
        email: ref.email,
        locale: "en",
        country: "ES",
        source: "AI_AUTO" as const,
        ...sentAt("2026-10-05T08:00"),
      })),
    });
    // ...and two Japanese ones invited after them.
    await queueRow(owner, listing.id, "sales@kogyo.jp", { ...sentAt("2026-10-05T09:00"), country: "JP" });
    await queueRow(owner, listing.id, "info@seisaku.jp", { ...sentAt("2026-10-05T09:01"), country: "JP" });

    // Thursday 01:00 UTC: 10:00 in Tokyo, 03:00 in Madrid.
    const tokyoMorning = await r.tick(utc("2026-10-08T01:00"));
    expect(tokyoMorning.reminders).toBe(2);
    expect(r.sentTo()).toEqual(["info@seisaku.jp", "sales@kogyo.jp"]);
    expect(await prisma.externalListingInvite.count({ where: { country: "ES", reminderSentAt: { not: null } } })).toBe(0);

    // Thursday 09:00 UTC = 11:00 in Madrid: the European ones, oldest first, as many as the day's cap leaves.
    const madridMorning = await r.tick(utc("2026-10-08T09:00"));
    expect(madridMorning.reminders).toBe(madridMorning.cap.cap - 2);
    expect(await prisma.externalListingInvite.count({ where: { country: "ES", reminderSentAt: { not: null } } })).toBe(
      madridMorning.cap.cap - 2,
    );
  });
});

