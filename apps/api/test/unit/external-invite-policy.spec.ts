import {
  coldInviteDailyCap,
  coldInviteSendAt,
  inviteHoldUntil,
  invitePaused,
  inviteQueueSendAt,
  inviteReachesAddress,
  queuedInviteForecast,
  registrationBlockedCountry,
  reminderDue,
  reminderLeavesNow,
  REMINDER_EARLY_HOURS,
} from "../../src/common/company/external-invite-policy";
import {
  countryFromEmailDomain,
  nextBusinessWindow,
  timeZoneForCountry,
  zonedParts,
  zonedTimeToUtc,
} from "../../src/common/time/country-time-zone";

/**
 * KAYITSIZ ADRESE DAVET POLİTİKASI sözleşmesi (2026-09-27, Faz 0b):
 * ölçüme bağlı günlük tavan, adres başına 7 gün, ilgi gevşetir, elle yazılan
 * beklemez, 3 yanıtsızda duraklama, tek hatırlatma, alıcının mesai saati.
 */
const DAY = 24 * 3_600_000;
const NOW = new Date("2026-10-07T10:00:00Z"); // Çarşamba

describe("coldInviteDailyCap", () => {
  it("0 = durdurma anahtarı: taban ya da tavan 0 ise günlük tavan 0 (yayın denetimi 2026-09-28)", () => {
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { max: 0 }).cap).toBe(0);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { base: 0 }).cap).toBe(0);
  });

  const quiet = { sent7d: 0, complaints7d: 0, hardBounces7d: 0, sentYesterday: 0 };
  it("ilk hafta taban; sorunsuz her hafta iki katı; tavan max", () => {
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW).cap).toBe(150);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: new Date(NOW.getTime() - 8 * DAY) }, NOW).cap).toBe(300);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: new Date(NOW.getTime() - 22 * DAY) }, NOW).cap).toBe(1200);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: new Date(NOW.getTime() - 400 * DAY) }, NOW).cap).toBe(5000);
  });

  it("ısınma hacme bağlı: tavan en fazla son 7 günün en yoğun gününün 2 katı, tabanın altına inmez (B5-14)", () => {
    const old = new Date(NOW.getTime() - 60 * DAY); // takvime göre 5000'e ulaşmış
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old, peakDay7d: 40 }, NOW).cap).toBe(150);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old, peakDay7d: 400 }, NOW).cap).toBe(800);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old, peakDay7d: 4000 }, NOW).cap).toBe(5000);
    // Takvim hâlâ sınırlar: ilk hafta 150, yoğun gün ne olursa olsun.
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null, peakDay7d: 150 }, NOW).cap).toBe(150);
  });

  it("şikâyet oranı %0,1'i aşarsa FREN: dünün yarısı", () => {
    const r = coldInviteDailyCap(
      { firstSentAt: new Date(NOW.getTime() - 30 * DAY), sent7d: 2000, complaints7d: 5, hardBounces7d: 0, sentYesterday: 900 },
      NOW,
    );
    expect(r).toEqual({ cap: 450, braked: "complaints" });
  });

  it("geri dönme %2'yi aşarsa fren; az örnekte mutlak eşik", () => {
    expect(
      coldInviteDailyCap({ firstSentAt: null, sent7d: 500, complaints7d: 0, hardBounces7d: 20, sentYesterday: 100 }, NOW).braked,
    ).toBe("bounces");
    expect(coldInviteDailyCap({ firstSentAt: null, sent7d: 40, complaints7d: 1, hardBounces7d: 0, sentYesterday: 40 }, NOW).braked).toBeNull();
    expect(coldInviteDailyCap({ firstSentAt: null, sent7d: 40, complaints7d: 2, hardBounces7d: 0, sentYesterday: 40 }, NOW).braked).toBe(
      "complaints",
    );
  });

  // Round 5, D15 / AI-OPS-1: the stack ran with COLD_INVITE_MAX_DAILY=50 and the
  // dispatcher logged cap=150 - the maximum was raised to the base.
  it("a configured maximum below the base caps the day: 50 means 50, not the 150 base", () => {
    const old = new Date(NOW.getTime() - 60 * DAY); // 5000 by calendar
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { max: 50 }).cap).toBe(50);
    // Neither the calendar nor the volume warm-up lifts it above the maximum.
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old }, NOW, { max: 50 }).cap).toBe(50);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old, peakDay7d: 4000 }, NOW, { max: 50 }).cap).toBe(50);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old, peakDay7d: 10 }, NOW, { max: 50 }).cap).toBe(50);
    // An explicit base above the maximum loses too.
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { base: 150, max: 149 }).cap).toBe(149);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { base: 300, max: 1 }).cap).toBe(1);
  });

  it("the brake never exceeds a maximum below the base, and halves from the capped base", () => {
    const old = new Date(NOW.getTime() - 60 * DAY);
    expect(
      coldInviteDailyCap({ firstSentAt: old, sent7d: 2000, complaints7d: 5, hardBounces7d: 0, sentYesterday: 900 }, NOW, { max: 50 }),
    ).toEqual({ cap: 50, braked: "complaints" });
    expect(
      coldInviteDailyCap({ firstSentAt: old, sent7d: 40, complaints7d: 2, hardBounces7d: 0, sentYesterday: 10 }, NOW, { max: 50 }),
    ).toEqual({ cap: 25, braked: "complaints" });
  });

  it("unchanged around the fix: 0 stops, undefined = defaults, a maximum above the base is the warm-up ceiling", () => {
    const old = new Date(NOW.getTime() - 60 * DAY);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { max: 0 }).cap).toBe(0);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, {}).cap).toBe(150);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { base: undefined, max: undefined }).cap).toBe(150);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: null }, NOW, { max: 400 }).cap).toBe(150);
    expect(coldInviteDailyCap({ ...quiet, firstSentAt: old }, NOW, { max: 400 }).cap).toBe(400);
  });
});

describe("adres başına kurallar", () => {
  const last = new Date(NOW.getTime() - 2 * DAY);
  it("AI kaynaklı davet 7 gün bekler; elle yazılan ve ilgi gösteren beklemez", () => {
    expect(inviteHoldUntil({ source: "AI_FORM", engaged: false, lastInviteEmailAt: last, now: NOW })?.getTime()).toBe(
      last.getTime() + 7 * DAY,
    );
    expect(inviteHoldUntil({ source: "MANUAL", engaged: false, lastInviteEmailAt: last, now: NOW })).toBeNull();
    expect(inviteHoldUntil({ source: "AI_AUTO", engaged: true, lastInviteEmailAt: last, now: NOW })).toBeNull();
    expect(
      inviteHoldUntil({ source: "AI_AUTO", engaged: false, lastInviteEmailAt: new Date(NOW.getTime() - 8 * DAY), now: NOW }),
    ).toBeNull();
  });

  it("3 yanıtsız e-postadan sonra duraklar (ilgi ya da elle yazma hariç)", () => {
    expect(invitePaused({ engaged: false, unengagedSends90d: 3, source: "AI_FORM" })).toBe(true);
    expect(invitePaused({ engaged: false, unengagedSends90d: 2, source: "AI_FORM" })).toBe(false);
    expect(invitePaused({ engaged: true, unengagedSends90d: 5, source: "AI_FORM" })).toBe(false);
    expect(invitePaused({ engaged: false, unengagedSends90d: 5, source: "MANUAL" })).toBe(false);
  });

  it("hatırlatma: kapanışa 6-48 saat ve ilk davetten en az 1 gün sonra, bir kez", () => {
    const sentAt = new Date(NOW.getTime() - 3 * DAY);
    const base = { sentAt, reminderSentAt: null, now: NOW };
    expect(reminderDue({ ...base, closesAt: new Date(NOW.getTime() + 30 * 3_600_000) })).toBe(true);
    expect(reminderDue({ ...base, closesAt: new Date(NOW.getTime() + 3 * DAY) })).toBe(false);
    expect(reminderDue({ ...base, closesAt: new Date(NOW.getTime() + 2 * 3_600_000) })).toBe(false);
    expect(reminderDue({ ...base, reminderSentAt: NOW, closesAt: new Date(NOW.getTime() + 30 * 3_600_000) })).toBe(false);
    expect(
      reminderDue({ sentAt: new Date(NOW.getTime() - 3_600_000), reminderSentAt: null, now: NOW, closesAt: new Date(NOW.getTime() + 30 * 3_600_000) }),
    ).toBe(false);
  });
});

describe("alıcının mesai saati", () => {
  it("ülke → saat dilimi; bilinmeyen İstanbul", () => {
    expect(timeZoneForCountry("de")).toBe("Europe/Berlin");
    expect(timeZoneForCountry("XX")).toBe("Europe/Istanbul");
    expect(timeZoneForCountry(null)).toBe("Europe/Istanbul");
  });

  it("e-posta uzantısından ülke; genel uzantılar sayılmaz", () => {
    expect(countryFromEmailDomain("satis@firma.de")).toBe("DE");
    expect(countryFromEmailDomain("sales@firm.co.uk")).toBe("GB");
    expect(countryFromEmailDomain("hi@startup.io")).toBeNull();
    expect(countryFromEmailDomain("a@firma.com")).toBeNull();
  });

  it("pencere içindeyse aynı an; akşamsa ertesi gün 09:00; cuma akşamı → pazartesi 09:00 (yerel)", () => {
    const within = new Date("2026-10-07T10:00:00Z"); // Berlin 12:00 Çarşamba
    expect(nextBusinessWindow(within, "Europe/Berlin")).toBe(within);

    const evening = new Date("2026-10-07T18:30:00Z"); // Berlin 20:30
    const p = zonedParts(nextBusinessWindow(evening, "Europe/Berlin"), "Europe/Berlin");
    expect([p.day, p.hour, p.minute]).toEqual([8, 9, 0]);

    const friday = new Date("2026-10-09T17:00:00Z"); // Berlin Cuma 19:00
    const m = zonedParts(nextBusinessWindow(friday, "Europe/Berlin"), "Europe/Berlin");
    expect([m.weekday, m.day, m.hour]).toEqual([1, 12, 9]);

    const tokyoNight = new Date("2026-10-07T15:00:00Z"); // Tokyo 00:00 Perşembe
    const t = zonedParts(nextBusinessWindow(tokyoNight, "Asia/Tokyo"), "Asia/Tokyo");
    expect([t.day, t.hour]).toEqual([8, 9]);
  });

  it("yaz saati geçişinde yerel saat UTC'ye doğru çevrilir", () => {
    // Berlin 2026-10-26 Pazartesi (yaz saati bitti, UTC+1): 09:00 yerel = 08:00Z
    expect(zonedTimeToUtc(2026, 10, 26, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-10-26T08:00:00.000Z");
    // Yaz saatinde (UTC+2): 09:00 yerel = 07:00Z
    expect(zonedTimeToUtc(2026, 10, 20, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });
});

describe("kayda kapalı ülke (X24)", () => {
  it("ipuçlarından HERHANGİ biri REGISTRATION_BLOCKED ise kapanır; uzantı da tanınır", () => {
    expect(registrationBlockedCountry("US")).toBe(true);
    expect(registrationBlockedCountry(" ir ")).toBe(true);
    expect(registrationBlockedCountry("DE", countryFromEmailDomain("sales@pipes.us"))).toBe(true);
    expect(countryFromEmailDomain("info@tehransteel.ir")).toBe("IR");
    expect(registrationBlockedCountry(null, countryFromEmailDomain("a@firma.com"))).toBe(false);
    expect(registrationBlockedCountry("CA", "DE", null)).toBe(false);
  });

  it(".as uzantısı genel ek sayılır (Norveç/Danimarka AS şirketleri); AS etiketi yine kapanır", () => {
    expect(countryFromEmailDomain("post@firma.as")).toBeNull();
    expect(registrationBlockedCountry("NO", countryFromEmailDomain("post@firma.as"))).toBe(false);
    expect(registrationBlockedCountry("AS")).toBe(true);
    expect(timeZoneForCountry("AS")).toBe("Pacific/Pago_Pago");
  });
});

/**
 * Round 5 review, R5-04: a queue row exists for every invitation, whatever
 * became of it. Only a row that was sent or still waits says "this company is
 * invited" - a failed / dropped one must not lock the company's other mailboxes.
 */
describe("inviteReachesAddress", () => {
  it("sent or still queued reaches the address; failed or cancelled before it left does not", () => {
    expect(inviteReachesAddress({ state: "QUEUED" })).toBe(true);
    expect(inviteReachesAddress({ state: "SENT", sentAt: NOW })).toBe(true);
    expect(inviteReachesAddress({ state: "FAILED", sentAt: null })).toBe(false);
    expect(inviteReachesAddress({ state: "CANCELLED", sentAt: null })).toBe(false);
  });

  it("a row that was sent stays reached whatever its state says later", () => {
    expect(inviteReachesAddress({ state: "CANCELLED", sentAt: NOW })).toBe(true);
  });
});

/**
 * Live check 2026-10-10, AUTO-COUNT-1: the creator's message counted the queued
 * letters with the dispatcher's rule, the two screens read the queue row alone
 * (9 "queued" on screen, 6 in the message, three planned times that were never
 * going to be honoured). One pure forecast now answers both questions - "will
 * it leave before the request closes" and "when".
 */
describe("queuedInviteForecast", () => {
  // The tester's request: published Fri 9 Oct 2026 22:12 Istanbul, closes a week later.
  const now = new Date("2026-10-09T19:20:00Z");
  const closesAt = new Date("2026-10-16T19:12:00Z");
  // Planned when it was queued: Monday 09:32 Istanbul.
  const row = { source: "AI_AUTO" as const, country: "TR", sendAfter: new Date("2026-10-12T06:32:00Z") };
  const history = (lastInviteEmailAt: string | null, extra: { sends90d?: number; engaged?: boolean } = {}) => ({
    lastInviteEmailAt: lastInviteEmailAt ? new Date(lastInviteEmailAt) : null,
    sends90d: lastInviteEmailAt ? 1 : 0,
    engaged: false,
    ...extra,
  });
  const read = (...args: Parameters<typeof queuedInviteForecast>) => {
    const f = queuedInviteForecast(...args);
    return f.leavesAt ? f.leavesAt.toISOString() : f.dropReason;
  };

  it("an address without a recent letter leaves at its stored time", () => {
    expect(read(row, undefined, closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
    expect(read(row, history(null), closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
    // The last letter is more than seven days old.
    expect(read(row, history("2026-10-01T08:00:00Z"), closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
  });

  it("the live case: a letter from another request the same afternoon - the hold ends Friday 16:58, the next window is Monday, the request closes Friday night: FREQUENCY, no planned time", () => {
    expect(queuedInviteForecast(row, history("2026-10-09T13:58:00Z"), closesAt, now)).toEqual({
      leavesAt: null,
      dropReason: "FREQUENCY",
    });
  });

  it("on hold but still in time: the planned time is the window after the hold, not the stored one", () => {
    // Same letter, a request that closes two weeks later: Monday 19 Oct 09:00 Istanbul.
    expect(read(row, history("2026-10-09T13:58:00Z"), new Date("2026-10-30T19:12:00Z"), now)).toBe("2026-10-19T06:00:00.000Z");
    // The hold ends inside a window (Thursday 11:00 Istanbul): that very moment.
    expect(read(row, history("2026-10-08T08:00:00Z"), closesAt, now)).toBe("2026-10-15T08:00:00.000Z");
    // No closing date: the hold only moves the time.
    expect(read(row, history("2026-10-09T13:58:00Z"), null, now)).toBe("2026-10-19T06:00:00.000Z");
  });

  it("the 12 hours before closing: a window that opens later than that is too late", () => {
    const held = history("2026-10-08T08:00:00Z"); // hold ends Thu 15 Oct 08:00 UTC
    expect(read(row, held, new Date("2026-10-15T20:00:00Z"), now)).toBe("2026-10-15T08:00:00.000Z");
    expect(read(row, held, new Date("2026-10-15T19:59:00Z"), now)).toBe("FREQUENCY");
  });

  it("a hold that ends before the row's turn changes nothing: the dispatcher meets no hold when the row comes due", () => {
    // Hold ends Monday 08:00 Istanbul, the row is planned for 09:32 the same morning.
    const held = history("2026-10-05T05:00:00Z");
    expect(read(row, held, closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
    // ...also when the request closes that afternoon (the window after the hold is inside the last 12 hours).
    expect(read(row, held, new Date("2026-10-12T15:00:00Z"), now)).toBe("2026-10-12T06:32:00.000Z");
  });

  it("a row that is already due is measured now", () => {
    const due = { ...row, sendAfter: new Date("2026-10-09T10:00:00Z") };
    expect(read(due, history("2026-10-09T13:58:00Z"), new Date("2026-10-30T19:12:00Z"), now)).toBe("2026-10-19T06:00:00.000Z");
    expect(read(due, history(null), closesAt, now)).toBe("2026-10-09T10:00:00.000Z");
  });

  it("three unanswered letters in 90 days: PAUSED; a row whose turn comes after closing: CLOSES_FIRST", () => {
    expect(read(row, history("2026-09-01T08:00:00Z", { sends90d: 3 }), closesAt, now)).toBe("PAUSED");
    expect(read(row, history(null), new Date("2026-10-12T06:32:00Z"), now)).toBe("CLOSES_FIRST");
    expect(read(row, history(null), new Date("2026-10-12T06:33:00Z"), now)).toBe("2026-10-12T06:32:00.000Z");
  });

  it("exempt as in the dispatcher: an address that opened an invitation link, and an address the buyer typed", () => {
    const busy = history("2026-10-09T13:58:00Z", { sends90d: 5 });
    expect(read(row, { ...busy, engaged: true }, closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
    expect(read({ ...row, source: "MANUAL" }, busy, closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
  });

  it("the recipient's own country decides the window after the hold", () => {
    // Hold ends Fri 16 Oct 13:58 UTC: 15:58 in Madrid (inside the window), 16:58 in Istanbul (after hours).
    const held = history("2026-10-09T13:58:00Z");
    const later = new Date("2026-10-30T19:12:00Z");
    expect(read({ ...row, country: "ES" }, held, later, now)).toBe("2026-10-16T13:58:00.000Z");
    expect(read({ ...row, country: null }, held, later, now)).toBe("2026-10-19T06:00:00.000Z");
  });

  /**
   * Review of AUTO-COUNT-1: the same trap with a different trigger. The other
   * request's letter has not LEFT yet - it waits in the queue for the same
   * address, a few minutes ahead (every row gets its own 0-45 minute spread).
   * The dispatcher sends that one first and then holds this row for 7 days;
   * the history is still empty, so the forecast said "queued, Monday 09:32".
   */
  describe("a letter ahead in the queue for the same address (another request, any buyer)", () => {
    const later = new Date("2026-10-30T19:12:00Z");
    /** A queued letter of the same address on another request (closing far away unless said). */
    const other = (sendAfter: string, extra: { source?: "MANUAL" | "AI_FORM" | "AI_AUTO"; closesAt?: string | null } = {}) => ({
      source: extra.source ?? ("AI_AUTO" as const),
      country: "TR",
      sendAfter: new Date(sendAfter),
      closesAt: extra.closesAt === null ? null : new Date(extra.closesAt ?? "2026-10-30T19:12:00Z"),
    });
    const ahead = other("2026-10-12T06:20:00Z"); // Monday 09:20 Istanbul, twelve minutes before this row

    it("this request closes inside the hold that letter starts: FREQUENCY, no planned time", () => {
      expect(queuedInviteForecast(row, undefined, closesAt, now, [ahead])).toEqual({ leavesAt: null, dropReason: "FREQUENCY" });
      // Without the queue the same row reads "queued" - the defect.
      expect(read(row, undefined, closesAt, now)).toBe("2026-10-12T06:32:00.000Z");
    });

    it("this request stays open long enough: the planned time is seven days after THAT letter, not the stored one", () => {
      expect(read(row, undefined, later, now, [ahead])).toBe("2026-10-19T06:20:00.000Z");
      expect(read(row, undefined, null, now, [ahead])).toBe("2026-10-19T06:20:00.000Z");
    });

    it("a letter planned for the same moment or later holds nobody: same moment = one e-mail, later = this row leaves first", () => {
      expect(read(row, undefined, closesAt, now, [other("2026-10-12T06:32:00Z")])).toBe("2026-10-12T06:32:00.000Z");
      expect(read(row, undefined, closesAt, now, [other("2026-10-12T06:44:00Z")])).toBe("2026-10-12T06:32:00.000Z");
    });

    it("the FIRST of several letters counts; a letter that will not leave itself counts for nothing", () => {
      // Two ahead: the hold starts with the earlier one.
      expect(read(row, undefined, later, now, [other("2026-10-12T06:25:00Z"), other("2026-10-12T06:05:00Z")])).toBe(
        "2026-10-19T06:05:00.000Z",
      );
      // Its own request closes before its turn: it is dropped, this row is free.
      expect(read(row, undefined, closesAt, now, [other("2026-10-12T06:20:00Z", { closesAt: "2026-10-12T06:00:00Z" })])).toBe(
        "2026-10-12T06:32:00.000Z",
      );
    });

    it("rows that are already due leave in the same run: neither holds the other; a due letter holds a row planned for later from NOW", () => {
      const due = { ...row, sendAfter: new Date("2026-10-09T10:00:00Z") };
      expect(read(due, undefined, closesAt, now, [other("2026-10-09T09:00:00Z")])).toBe("2026-10-09T10:00:00.000Z");
      // The due letter leaves now (Fri 19:20 UTC): seven days later is after hours, the next window is Monday 19 Oct.
      expect(read(row, undefined, later, now, [other("2026-10-09T09:00:00Z")])).toBe("2026-10-19T06:00:00.000Z");
    });

    it("an address already on hold: both letters wait for the same window and leave as one e-mail - the other row adds nothing", () => {
      const held = history("2026-10-09T13:58:00Z");
      expect(read(row, held, later, now, [ahead])).toBe("2026-10-19T06:00:00.000Z");
      // ...unless the other one was typed by its buyer: it leaves on time and its hold replaces the older one.
      expect(read(row, held, later, now, [other("2026-10-12T06:20:00Z", { source: "MANUAL" })])).toBe("2026-10-19T06:20:00.000Z");
    });

    it("that letter is one more unanswered letter: the third in 90 days pauses this row", () => {
      expect(read(row, history("2026-09-01T08:00:00Z", { sends90d: 2 }), later, now, [ahead])).toBe("PAUSED");
      expect(read(row, history("2026-09-01T08:00:00Z", { sends90d: 1 }), later, now, [ahead])).toBe("2026-10-19T06:20:00.000Z");
    });

    it("exempt as in the dispatcher: an address that opened an invitation link, and a row the buyer typed", () => {
      expect(read(row, history(null, { engaged: true }), closesAt, now, [ahead])).toBe("2026-10-12T06:32:00.000Z");
      expect(read({ ...row, source: "MANUAL" }, undefined, closesAt, now, [ahead])).toBe("2026-10-12T06:32:00.000Z");
    });

    /**
     * Review R8-3: rows now JOIN the letter that waits in their window, so more
     * rows of one address than the e-mail lists (5 requests) can share one
     * planned time. The dispatcher sends the first five in its order (planned
     * time, age, id) and reads the rest a minute later - under the hold of the
     * e-mail that has just left. "An equal time holds nobody" said "queued,
     * Monday 09:32" for the sixth row too.
     */
    describe("more letters of one planned time than one e-mail lists", () => {
      const SAME = "2026-10-12T06:32:00Z";
      /** Queued on Friday evening, `minute` minutes after 21:00 in Istanbul. */
      const queuedAt = (minute: number) => new Date(Date.UTC(2026, 9, 9, 18, 0) + minute * 60_000);
      /** `n` letters of other requests planned for this row's minute, queued one minute apart. */
      const sameTime = (n: number, extra: Parameters<typeof other>[1] = {}) =>
        Array.from({ length: n }, (_, i) => ({ ...other(SAME, extra), createdAt: queuedAt(i), id: `row-${i}` }));
      const own = (minute: number, id = "row-own") => ({ ...row, createdAt: queuedAt(minute), id });

      it("the sixth row is held by the e-mail of its own turn: FREQUENCY when its request closes inside that hold, else the window after it", () => {
        expect(queuedInviteForecast(own(9), undefined, closesAt, now, sameTime(5))).toEqual({ leavesAt: null, dropReason: "FREQUENCY" });
        expect(read(own(9), undefined, later, now, sameTime(5))).toBe("2026-10-19T06:32:00.000Z");
        expect(read(own(9), undefined, null, now, sameTime(8))).toBe("2026-10-19T06:32:00.000Z");
        // Five rows fit: the fifth leaves with the other four.
        expect(read(own(9), undefined, closesAt, now, sameTime(4))).toBe("2026-10-12T06:32:00.000Z");
      });

      it("the order is the dispatcher's - planned time, then age, then id: the five OLDEST rows leave, whichever request asks", () => {
        // Six rows in all; this one is older than three of the others.
        expect(read(own(1.5), undefined, closesAt, now, sameTime(5))).toBe("2026-10-12T06:32:00.000Z");
        // Eight others, this row is the fifth oldest / the sixth oldest.
        expect(read(own(3.5), undefined, closesAt, now, sameTime(8))).toBe("2026-10-12T06:32:00.000Z");
        expect(read(own(4.5), undefined, closesAt, now, sameTime(8))).toBe("FREQUENCY");
        // Queued in the same millisecond as the fifth: the id decides.
        expect(read(own(4, "row-3z"), undefined, closesAt, now, sameTime(5))).toBe("2026-10-12T06:32:00.000Z");
        expect(read(own(4, "row-4z"), undefined, closesAt, now, sameTime(5))).toBe("FREQUENCY");
        // Rows that are already due are read by their STORED time first: five with an earlier time fill the e-mail.
        const due = (stored: string, minute: number) => ({ ...own(minute), sendAfter: new Date(stored) });
        const dueOthers = (stored: string) => sameTime(5).map((o) => ({ ...o, sendAfter: new Date(stored) }));
        expect(read(due("2026-10-09T10:00:00Z", 0), undefined, later, now, dueOthers("2026-10-09T09:00:00Z"))).toBe("2026-10-19T06:00:00.000Z");
        expect(read(due("2026-10-09T10:00:00Z", 9), undefined, later, now, dueOthers("2026-10-09T10:30:00Z"))).toBe("2026-10-09T10:00:00.000Z");
      });

      it("only letters of the SAME turn that will leave fill the e-mail; without a known place nothing is said about the order", () => {
        // Later letters are another e-mail; letters whose request closes first are dropped before the turn.
        expect(read(own(9), undefined, closesAt, now, sameTime(5).map((o) => ({ ...o, sendAfter: new Date("2026-10-12T06:40:00Z") })))).toBe(
          "2026-10-12T06:32:00.000Z",
        );
        expect(read(own(9), undefined, closesAt, now, sameTime(5, { closesAt: "2026-10-12T06:00:00Z" }))).toBe("2026-10-12T06:32:00.000Z");
        expect(read(own(9), undefined, closesAt, now, [...sameTime(4), ...sameTime(1, { closesAt: "2026-10-12T06:00:00Z" })])).toBe(
          "2026-10-12T06:32:00.000Z",
        );
        // The row's place, or the others', is not known: an equal time holds nobody (as before).
        expect(read(row, undefined, closesAt, now, sameTime(5))).toBe("2026-10-12T06:32:00.000Z");
        expect(read(own(9), undefined, closesAt, now, sameTime(5).map(() => other(SAME)))).toBe("2026-10-12T06:32:00.000Z");
        // A letter that leaves EARLIER still decides first: the hold starts with it, not with the full e-mail.
        expect(read(own(9), undefined, later, now, [...sameTime(5), other("2026-10-12T06:05:00Z")])).toBe("2026-10-19T06:05:00.000Z");
      });

      it("the full e-mail is one more unanswered letter (the third pauses the row); a typed row and an interested address are read again a minute later and leave", () => {
        expect(read(own(9), history("2026-09-01T08:00:00Z", { sends90d: 2 }), later, now, sameTime(5))).toBe("PAUSED");
        expect(read(own(9), history("2026-09-01T08:00:00Z", { sends90d: 1 }), later, now, sameTime(5))).toBe("2026-10-19T06:32:00.000Z");
        expect(read({ ...own(9), source: "MANUAL" }, undefined, closesAt, now, sameTime(5))).toBe("2026-10-12T06:32:00.000Z");
        expect(read(own(9), history(null, { engaged: true }), closesAt, now, sameTime(5))).toBe("2026-10-12T06:32:00.000Z");
        // Typed letters of other requests take their places in the e-mail like any other.
        expect(read(own(9), undefined, closesAt, now, sameTime(5, { source: "MANUAL" }))).toBe("FREQUENCY");
      });
    });
  });
});

/**
 * Live re-check 2026-10-09, AUTO-HOURS-1: the window is asked again at SEND
 * time. One definition answers "may this letter leave at `at`, and if not,
 * when": weekday 09:00-16:00 in the recipient's country for an address the AI
 * found; a typed address and an address that opened an invitation link are
 * exempt.
 */
describe("coldInviteSendAt", () => {
  const iso = (d: Date) => d.toISOString();
  const ai = (country: string | null, at: string, extra: { jitterMinutes?: number; engaged?: boolean } = {}) =>
    iso(coldInviteSendAt({ source: "AI_AUTO", engaged: false, country, at: new Date(at), ...extra }));

  it("the letters of the live finding: Friday 14:07 UTC is after hours in Madrid, Rome, Paris, Warsaw, Prague and Istanbul", () => {
    const at = "2026-10-09T14:07:00.000Z"; // Friday, 16:07 in ES/IT/FR/PL/CZ, 17:07 in TR
    for (const country of ["ES", "IT", "FR", "PL", "CZ"]) {
      // Monday 09:00 local (UTC+2 in October).
      expect(ai(country, at)).toBe("2026-10-12T07:00:00.000Z");
    }
    expect(ai("TR", at)).toBe("2026-10-12T06:00:00.000Z");
    // Unknown country falls back to Istanbul.
    expect(ai(null, at)).toBe("2026-10-12T06:00:00.000Z");
  });

  it("the same moment is inside the window further west and already Friday night in the east", () => {
    const at = "2026-10-09T14:07:00.000Z";
    expect(ai("GB", at)).toBe(at); // 15:07 in London
    expect(ai("BR", at)).toBe(at); // 11:07 in Sao Paulo
    expect(ai("AE", at)).toBe("2026-10-12T05:00:00.000Z"); // 18:07 in Dubai
    expect(ai("JP", at)).toBe("2026-10-12T00:00:00.000Z"); // 23:07 in Tokyo
    expect(ai("IN", at)).toBe("2026-10-12T03:30:00.000Z"); // 19:37 in Kolkata (UTC+5:30)
  });

  it("the daily cap is released at 00:00 UTC: 03:00 in Istanbul is not sent, the same day's 09:00 is the plan", () => {
    expect(ai("TR", "2026-10-08T00:00:30.000Z")).toBe("2026-10-08T06:00:00.000Z");
    // Tokyo is in its window at that moment (09:00 local).
    expect(ai("JP", "2026-10-08T00:00:30.000Z")).toBe("2026-10-08T00:00:30.000Z");
  });

  it("window edges: 09:00 is in, 15:59 is in, 16:00 is out; Saturday and Sunday are out", () => {
    expect(ai("TR", "2026-10-07T06:00:00.000Z")).toBe("2026-10-07T06:00:00.000Z");
    expect(ai("TR", "2026-10-07T05:59:00.000Z")).toBe("2026-10-07T06:00:00.000Z");
    expect(ai("TR", "2026-10-07T12:59:00.000Z")).toBe("2026-10-07T12:59:00.000Z");
    expect(ai("TR", "2026-10-07T13:00:00.000Z")).toBe("2026-10-08T06:00:00.000Z");
    expect(ai("TR", "2026-10-10T09:00:00.000Z")).toBe("2026-10-12T06:00:00.000Z");
    expect(ai("TR", "2026-10-11T09:00:00.000Z")).toBe("2026-10-12T06:00:00.000Z");
  });

  it("jitter spreads only a re-planned letter; a letter inside the window keeps its moment", () => {
    expect(ai("TR", "2026-10-09T14:07:00.000Z", { jitterMinutes: 30 })).toBe("2026-10-12T06:30:00.000Z");
    expect(ai("TR", "2026-10-07T10:00:00.000Z", { jitterMinutes: 30 })).toBe("2026-10-07T10:00:00.000Z");
  });

  it("exempt: an address the buyer typed, and an address that opened an invitation link", () => {
    const at = new Date("2026-10-10T23:30:00.000Z"); // Sunday 02:30 in Istanbul
    expect(coldInviteSendAt({ source: "MANUAL", engaged: false, country: "TR", at })).toBe(at);
    expect(coldInviteSendAt({ source: "AI_FORM", engaged: true, country: "TR", at })).toBe(at);
    expect(iso(coldInviteSendAt({ source: "AI_FORM", engaged: false, country: "TR", at }))).toBe("2026-10-12T06:00:00.000Z");
  });
});

/**
 * Closing check 2026-10-10, DISC-N1: every AI-sourced row got its own minute of
 * the 0-45 minute spread, so two requests that queued one address for Monday
 * 09:32 and 09:33 were two dispatcher runs - the second letter was held 7 days
 * and dropped instead of leaving in the same e-mail. A new row now takes
 * exactly the time of the letter its address already has in that window.
 */
describe("inviteQueueSendAt", () => {
  const iso = (d: Date) => d.toISOString();
  const SATURDAY = "2026-10-10T10:00:00.000Z"; // 13:00 in Istanbul: the next window opens Monday 06:00 UTC
  const plan = (
    waiting: string[] | undefined,
    over: { source?: "MANUAL" | "AI_FORM" | "AI_AUTO"; country?: string | null; at?: string; jitterMinutes?: number } = {},
  ) =>
    iso(
      inviteQueueSendAt({
        source: over.source ?? "AI_AUTO",
        country: over.country === undefined ? "TR" : over.country,
        at: new Date(over.at ?? SATURDAY),
        jitterMinutes: over.jitterMinutes ?? 33,
        waiting: waiting?.map((w) => new Date(w)),
      }),
    );

  it("no letter waits for the address: the next window start plus the row's own spread, as before", () => {
    expect(plan(undefined)).toBe("2026-10-12T06:33:00.000Z");
    expect(plan([])).toBe("2026-10-12T06:33:00.000Z");
    expect(plan([], { jitterMinutes: 0 })).toBe("2026-10-12T06:00:00.000Z");
    // Inside the window the row is due at once (the spread only applies to a window start).
    expect(plan([], { at: "2026-10-07T10:00:00.000Z" })).toBe("2026-10-07T10:00:00.000Z");
  });

  it("a letter waits in the row's window: the row takes EXACTLY its time, whatever its own spread would have been", () => {
    for (const jitterMinutes of [0, 33, 44]) {
      expect(plan(["2026-10-12T06:32:00.000Z"], { jitterMinutes })).toBe("2026-10-12T06:32:00.000Z");
    }
    // Milliseconds included: both rows must come due in the same dispatcher run.
    expect(plan(["2026-10-12T06:32:17.123Z"])).toBe("2026-10-12T06:32:17.123Z");
    // Both sources the AI found; the edges of the range (window start, end of the spread) are in.
    expect(plan(["2026-10-12T06:00:00.000Z"], { source: "AI_FORM" })).toBe("2026-10-12T06:00:00.000Z");
    expect(plan(["2026-10-12T06:45:00.000Z"])).toBe("2026-10-12T06:45:00.000Z");
  });

  it("several letters in the range: the first one to leave is joined", () => {
    expect(plan(["2026-10-12T06:40:00.000Z", "2026-10-12T06:25:00.000Z", "2026-10-12T06:34:00.000Z"])).toBe(
      "2026-10-12T06:25:00.000Z",
    );
  });

  it("a letter outside the range is not joined: never a time before the row's own window, never one its spread could not give", () => {
    // Earlier than the window start: already due, the weekend, another country's earlier window (Tokyo opens Monday 00:00 UTC).
    expect(plan(["2026-10-10T09:59:00.000Z"])).toBe("2026-10-12T06:33:00.000Z");
    expect(plan(["2026-10-11T12:00:00.000Z"])).toBe("2026-10-12T06:33:00.000Z");
    expect(plan(["2026-10-12T00:20:00.000Z"])).toBe("2026-10-12T06:33:00.000Z");
    expect(plan(["2026-10-12T05:59:59.999Z"])).toBe("2026-10-12T06:33:00.000Z");
    // Later than the spread: a letter on its 7-day hold, Tuesday's window.
    expect(plan(["2026-10-12T06:45:00.001Z"])).toBe("2026-10-12T06:33:00.000Z");
    expect(plan(["2026-10-13T06:10:00.000Z"])).toBe("2026-10-12T06:33:00.000Z");
    // The window is the ROW's country's: the same waiting letter is in Istanbul's range and before Madrid's (07:00 UTC).
    expect(plan(["2026-10-12T06:32:00.000Z"], { country: "ES" })).toBe("2026-10-12T07:33:00.000Z");
    expect(plan(["2026-10-12T06:32:00.000Z"], { country: null })).toBe("2026-10-12T06:32:00.000Z");
  });

  it("inside the window the row is due now - unless a letter of the address comes due within the spread (translation wait, retry): then both leave together", () => {
    const at = "2026-10-07T10:00:00.000Z"; // Wednesday 13:00 in Istanbul
    expect(plan(["2026-10-07T10:02:00.000Z"], { at })).toBe("2026-10-07T10:02:00.000Z");
    expect(plan(["2026-10-07T10:30:00.000Z"], { at })).toBe("2026-10-07T10:30:00.000Z");
    // Already due (the dispatcher reads both in its next run) or further away than the spread: now.
    expect(plan(["2026-10-07T09:59:30.000Z"], { at })).toBe(at);
    expect(plan(["2026-10-07T10:46:00.000Z"], { at })).toBe(at);
  });

  /**
   * Review R8-1: the range is 45 minutes long, so in the last 45 minutes of
   * the window it ends after 16:00 local. A letter of the address that waits
   * THERE (a typed letter's retry, another country's window, a claim lease) was
   * joined: the row was answered "queued, 16:20", found outside its window at
   * that minute, moved to Monday and dropped by the hold of the other letter.
   */
  it("never a time outside the row's own send window: in the window's last 45 minutes a letter that waits after 16:00 local is not joined", () => {
    const at = "2026-10-09T12:50:00.000Z"; // Friday 15:50 in Istanbul
    const inWindow = (time: string, country: string | null = "TR") =>
      nextBusinessWindow(new Date(time), timeZoneForCountry(country)).toISOString() === time;
    // The typed letter's retry at 16:20: the row is due now, as before the rule.
    expect(plan(["2026-10-09T13:20:00.000Z"], { source: "AI_FORM", at })).toBe(at);
    expect(inWindow(plan(["2026-10-09T13:20:00.000Z"], { source: "AI_FORM", at }))).toBe(true);
    // A letter planned for Warsaw's afternoon (15:10 there, 16:10 in Istanbul), queued at 15:40 in Istanbul.
    expect(plan(["2026-10-09T13:10:00.000Z"], { at: "2026-10-09T12:40:00.000Z" })).toBe("2026-10-09T12:40:00.000Z");
    // ...the same letter is joined by a row of ITS country: 15:10 is inside Warsaw's window.
    expect(plan(["2026-10-09T13:10:00.000Z"], { at: "2026-10-09T12:40:00.000Z", country: "PL" })).toBe("2026-10-09T13:10:00.000Z");
    // The window's edges: 15:59:59 is joined, 16:00:00 is not - and a later letter does not hide an earlier one inside the window.
    expect(plan(["2026-10-09T12:59:59.999Z"], { at })).toBe("2026-10-09T12:59:59.999Z");
    expect(plan(["2026-10-09T13:00:00.000Z"], { at })).toBe(at);
    expect(plan(["2026-10-09T13:20:00.000Z", "2026-10-09T12:56:00.000Z", "2026-10-09T13:00:00.000Z"], { at })).toBe(
      "2026-10-09T12:56:00.000Z",
    );
    // Whatever waits for the address, the planned time is a minute of the row's own window.
    for (const minute of [0, 5, 9, 10, 20, 35]) {
      const waiting = [new Date(Date.UTC(2026, 9, 9, 13, minute)).toISOString()];
      for (const queuedAt of ["2026-10-09T12:16:00.000Z", "2026-10-09T12:40:00.000Z", at, "2026-10-09T12:59:00.000Z"]) {
        expect(inWindow(plan(waiting, { at: queuedAt }))).toBe(true);
      }
    }
  });

  it("an address the buyer typed does not wait and joins nothing", () => {
    expect(plan(["2026-10-12T06:32:00.000Z"], { source: "MANUAL" })).toBe(SATURDAY);
    expect(plan(["2026-10-07T10:02:00.000Z"], { source: "MANUAL", at: "2026-10-07T10:00:00.000Z" })).toBe("2026-10-07T10:00:00.000Z");
  });

  it("two rows that joined read 'queued' with one time in the forecast: an equal time holds nobody", () => {
    const now = new Date(SATURDAY);
    const first = new Date(plan([]));
    const second = new Date(plan([iso(first)], { jitterMinutes: 5 }));
    const closesAt = new Date("2026-10-17T10:00:00.000Z");
    const letter = (sendAfter: Date) => ({ source: "AI_AUTO" as const, country: "TR", sendAfter });
    expect(queuedInviteForecast(letter(second), undefined, closesAt, now, [{ ...letter(first), closesAt }])).toEqual({
      leavesAt: first,
      dropReason: null,
    });
    expect(queuedInviteForecast(letter(first), undefined, closesAt, now, [{ ...letter(second), closesAt }])).toEqual({
      leavesAt: first,
      dropReason: null,
    });
    // The rows as they used to be planned (own spread, five minutes behind): held 7 days, the request closes first.
    const apart = new Date(plan([], { jitterMinutes: 38 }));
    expect(queuedInviteForecast(letter(apart), undefined, closesAt, now, [{ ...letter(first), closesAt }])).toEqual({
      leavesAt: null,
      dropReason: "FREQUENCY",
    });
  });
});

/**
 * Round 6 review, R6-1: the reminder waits for the recipient's window, but the
 * reminder period stayed 6-48 hours before closing. A request that closes
 * between Sunday 16:00 and Monday 15:00 (recipient time) has that whole period
 * in the weekend: the reminder of an address the AI found never left. It now
 * leaves in the last window before the period (that Friday).
 */
describe("reminderLeavesNow", () => {
  const HOUR = 3_600_000;
  const MIN = 60_000;
  const aiIn = (country: string | null) => (at: Date) => coldInviteSendAt({ source: "AI_AUTO", engaged: false, country, at });
  const typed = (at: Date) => coldInviteSendAt({ source: "MANUAL", engaged: false, country: "TR", at });
  const engaged = (at: Date) => coldInviteSendAt({ source: "AI_AUTO", engaged: true, country: "TR", at });
  const leaves = (closes: string, now: string, sendAt = aiIn("TR"), sentAt = "2026-10-01T08:00:00Z") =>
    reminderLeavesNow({ closesAt: new Date(closes), sentAt: new Date(sentAt), reminderSentAt: null, now: new Date(now), sendAt });

  // Istanbul is UTC+3. Monday 12 October 2026, 10:00 Istanbul:
  const MON_10 = "2026-10-12T07:00:00Z";

  it("inside the reminder period: in a minute of the window, not outside it; a typed and an engaged address at any minute", () => {
    const closes = "2026-10-08T18:00:00Z"; // Thursday 21:00 Istanbul
    expect(leaves(closes, "2026-10-07T18:00:00Z")).toBe(false); // Wednesday 21:00
    expect(leaves(closes, "2026-10-07T18:00:00Z", typed)).toBe(true);
    expect(leaves(closes, "2026-10-07T18:00:00Z", engaged)).toBe(true);
    expect(leaves(closes, "2026-10-08T07:00:00Z")).toBe(true); // Thursday 10:00
    // The period's edges are the ones of `reminderDue`: 48 hours and 6 hours before closing, both in.
    expect(leaves(closes, "2026-10-06T17:59:00Z", typed)).toBe(false);
    expect(leaves(closes, "2026-10-06T18:00:00Z", typed)).toBe(true);
    expect(leaves(closes, "2026-10-08T12:00:00Z")).toBe(true);
    expect(leaves(closes, "2026-10-08T12:01:00Z")).toBe(false);
  });

  it("request closes Monday 10:00: the period (Saturday 10:00 - Monday 04:00) has no window minute, so the reminder leaves on Friday 09:00-16:00 - not on Thursday, not at the weekend", () => {
    expect(leaves(MON_10, "2026-10-08T07:30:00Z")).toBe(false); // Thursday 10:30: Friday's window is still ahead
    expect(leaves(MON_10, "2026-10-08T12:59:00Z")).toBe(false); // Thursday 15:59
    expect(leaves(MON_10, "2026-10-09T05:59:00Z")).toBe(false); // Friday 08:59
    expect(leaves(MON_10, "2026-10-09T06:00:00Z")).toBe(true); // Friday 09:00
    expect(leaves(MON_10, "2026-10-09T12:59:00Z")).toBe(true); // Friday 15:59
    expect(leaves(MON_10, "2026-10-09T13:00:00Z")).toBe(false); // Friday 16:00
    expect(leaves(MON_10, "2026-10-10T07:00:00Z")).toBe(false); // Saturday 10:00, the period begins
    expect(leaves(MON_10, "2026-10-11T09:00:00Z")).toBe(false); // Sunday
    // An address that has every minute of its period gets nothing early.
    expect(leaves(MON_10, "2026-10-09T06:00:00Z", typed)).toBe(false);
    expect(leaves(MON_10, "2026-10-09T06:00:00Z", engaged)).toBe(false);
    expect(leaves(MON_10, "2026-10-10T07:00:00Z", typed)).toBe(true);
    // The window is the RECIPIENT's: Friday 09:00 in Tokyo is 03:00 in Istanbul.
    expect(leaves(MON_10, "2026-10-09T00:00:00Z", aiIn("JP"))).toBe(false); // Tokyo's period holds Monday 09:00-10:00 local
    expect(leaves("2026-10-12T01:00:00Z", "2026-10-09T00:00:00Z", aiIn("JP"))).toBe(true); // closes Monday 10:00 Tokyo
  });

  it("a period that holds a window minute is never left early", () => {
    const TUE_10 = "2026-10-13T07:00:00Z"; // period Sunday 10:00 - Tuesday 04:00: Monday's window is inside
    expect(leaves(TUE_10, "2026-10-09T06:00:00Z")).toBe(false);
    expect(leaves(TUE_10, "2026-10-09T12:59:00Z")).toBe(false);
    expect(leaves(TUE_10, "2026-10-12T05:59:00Z")).toBe(false);
    expect(leaves(TUE_10, "2026-10-12T06:00:00Z")).toBe(true);
  });

  it("edges of the gap: closing Sunday 16:00 ... Monday 14:59 falls back to Friday; Sunday 15:59 and Monday 15:00 still have a minute of their own", () => {
    const FRI_1500 = "2026-10-09T12:00:00Z";
    // Sunday 16:00: the period starts exactly when Friday's window ends.
    expect(leaves("2026-10-11T13:00:00Z", FRI_1500)).toBe(true);
    expect(leaves("2026-10-11T13:00:00Z", "2026-10-08T12:00:00Z")).toBe(false); // Thursday 15:00
    // Sunday 15:59: Friday 15:59 is inside the period - 15:00 is too early, 15:59 is the minute.
    expect(leaves("2026-10-11T12:59:00Z", FRI_1500)).toBe(false);
    expect(leaves("2026-10-11T12:59:00Z", "2026-10-09T12:59:00Z")).toBe(true);
    // Monday 14:59: the period ends 08:59, a minute before the window opens.
    expect(leaves("2026-10-12T11:59:00Z", FRI_1500)).toBe(true);
    // Monday 15:00: 09:00 is the period's last minute.
    expect(leaves("2026-10-12T12:00:00Z", FRI_1500)).toBe(false);
    expect(leaves("2026-10-12T12:00:00Z", "2026-10-12T06:00:00Z")).toBe(true);
  });

  it("the early reminder keeps the other rules: a day after the invitation, once, only for a request with a closing date", () => {
    const friday = "2026-10-09T06:00:00Z";
    // Invited Thursday 15:00: Friday 09:00 is 18 hours later, Friday 15:00 is a day later.
    expect(leaves(MON_10, friday, aiIn("TR"), "2026-10-08T12:00:00Z")).toBe(false);
    expect(leaves(MON_10, "2026-10-09T12:00:00Z", aiIn("TR"), "2026-10-08T12:00:00Z")).toBe(true);
    const base = { sentAt: new Date("2026-10-01T08:00:00Z"), now: new Date(friday), sendAt: aiIn("TR") };
    expect(reminderLeavesNow({ ...base, closesAt: new Date(MON_10), reminderSentAt: new Date("2026-10-08T07:00:00Z") })).toBe(false);
    expect(reminderLeavesNow({ ...base, closesAt: null, reminderSentAt: null })).toBe(false);
    expect(reminderLeavesNow({ ...base, closesAt: new Date(MON_10), sentAt: null, reminderSentAt: null })).toBe(false);
  });

  it("every closing hour of a week has a minute for the reminder (23 of 168 had none), in Istanbul, Tokyo, London and Sao Paulo", () => {
    const weekStart = Date.parse("2026-10-12T00:00:00Z");
    const sentAt = new Date("2026-09-20T08:00:00Z");
    for (const country of ["TR", "JP", "GB", "BR"]) {
      // The same instants are asked for many closing hours: one window answer per instant.
      const asked = new Map<number, Date>();
      const window = aiIn(country);
      const sendAt = (at: Date) => {
        const hit = asked.get(at.getTime()) ?? window(at);
        asked.set(at.getTime(), hit);
        return hit;
      };
      let withoutPeriodMinute = 0;
      for (let h = 0; h < 168; h++) {
        const closesAt = new Date(weekStart + h * HOUR);
        let first: number | null = null;
        let inPeriod = false;
        // The dispatcher's minute, every half hour over the last five days.
        for (let t = closesAt.getTime() - 120 * HOUR; t <= closesAt.getTime(); t += 30 * MIN) {
          const now = new Date(t);
          if (reminderDue({ closesAt, sentAt, reminderSentAt: null, now }) && sendAt(now).getTime() === t) inPeriod = true;
          if (first === null && reminderLeavesNow({ closesAt, sentAt, reminderSentAt: null, now, sendAt })) first = t;
        }
        if (!inPeriod) withoutPeriodMinute++;
        if (first === null) throw new Error(`no reminder minute for a request closing ${closesAt.toISOString()} (${country})`);
        const hoursBefore = (closesAt.getTime() - first) / HOUR;
        // Always in a minute of the window; early only when the period has none, and then within the hours the dispatcher reads.
        expect(sendAt(new Date(first)).getTime()).toBe(first);
        expect(hoursBefore).toBeGreaterThanOrEqual(6);
        if (inPeriod) expect(hoursBefore).toBeLessThanOrEqual(48);
        else {
          expect(hoursBefore).toBeGreaterThan(48);
          expect(hoursBefore).toBeLessThanOrEqual(78);
          expect(hoursBefore).toBeLessThan(REMINDER_EARLY_HOURS);
        }
      }
      expect([country, withoutPeriodMinute]).toEqual([country, 23]);
    }
  });
});

