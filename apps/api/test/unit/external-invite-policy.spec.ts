import {
  coldInviteDailyCap,
  inviteHoldUntil,
  invitePaused,
  registrationBlockedCountry,
  reminderDue,
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
});
