import {
  categoryMatchInstantAllowed,
  digestDue,
  inLifecycleWindow,
  isLocalMonday,
  lifecycleAllowed,
  localDayStart,
  nextLifecycleStep,
  weeklySummaryAllowed,
  type LifecycleState,
} from "../../src/common/email/email-program-policy";

/**
 * GÜNLÜK E-POSTA PROGRAMI sözleşmesi (2026-09-27, Faz 2): günde 3 anlık
 * kategori e-postası + akşam özeti, davranışa bağlı karşılama serisi,
 * ilgiye göre seyrelen haftalık özet, yerel saat pencereleri.
 */
const DAY = 24 * 3_600_000;

describe("kategori eşleşmesi: günde 3 anında, fazlası akşam özeti", () => {
  it("günlük hak ve 'hepsi anında' tercihi", () => {
    expect(categoryMatchInstantAllowed({ sentTodayLocal: 0, allInstant: false })).toBe(true);
    expect(categoryMatchInstantAllowed({ sentTodayLocal: 2, allInstant: false })).toBe(true);
    expect(categoryMatchInstantAllowed({ sentTodayLocal: 3, allInstant: false })).toBe(false);
    expect(categoryMatchInstantAllowed({ sentTodayLocal: 9, allInstant: true })).toBe(true);
  });

  it("yerel gün başı saat dilimine göre", () => {
    // İstanbul 2026-10-07 01:30 (UTC 06 Ekim 22:30) → gün başı 06 Ekim 21:00Z
    expect(localDayStart(new Date("2026-10-06T22:30:00Z"), "Europe/Istanbul").toISOString()).toBe(
      "2026-10-06T21:00:00.000Z",
    );
  });

  it("özet akşam 18:00'den sonra; dünden kalan öğe sabah da gider; 24 saati aşan her zaman", () => {
    const tz = "Europe/Istanbul";
    const morning = new Date("2026-10-07T07:00:00Z"); // İstanbul 10:00
    const evening = new Date("2026-10-07T15:30:00Z"); // İstanbul 18:30
    const todayItem = new Date("2026-10-07T06:00:00Z");
    expect(digestDue({ now: morning, timeZone: tz, oldestItemAt: todayItem })).toBe(false);
    expect(digestDue({ now: evening, timeZone: tz, oldestItemAt: todayItem })).toBe(true);
    expect(digestDue({ now: morning, timeZone: tz, oldestItemAt: new Date("2026-10-06T19:00:00Z") })).toBe(true);
    expect(digestDue({ now: morning, timeZone: tz, oldestItemAt: new Date(morning.getTime() - DAY) })).toBe(true);
  });
});

describe("karşılama serisi (davranışa bağlı)", () => {
  const base: LifecycleState = {
    onboardedAt: new Date("2026-10-01T09:00:00Z"),
    hasProfileText: false,
    productCount: 0,
    verification: "UNVERIFIED",
    recentMatches: 5,
    sent: new Set(),
  };
  const at = (d: number) => new Date(base.onboardedAt!.getTime() + d * DAY);

  it("gün 1 profil, gün 3 ilk ürün, gün 7 doğrulama, gün 14 pazar", () => {
    expect(nextLifecycleStep(base, at(0.5))).toBeNull();
    expect(nextLifecycleStep(base, at(1))).toBe("profile");
    expect(nextLifecycleStep({ ...base, sent: new Set(["profile"]) }, at(3))).toBe("first_product");
    expect(nextLifecycleStep({ ...base, sent: new Set(["profile", "first_product"]) }, at(7))).toBe("verify");
    expect(nextLifecycleStep({ ...base, sent: new Set(["profile", "first_product", "verify"]) }, at(14))).toBe("market");
  });

  it("tamamlanan adımın e-postası gitmez; pazar adımı eşleşme yoksa atlanır; onboarding yoksa seri yok", () => {
    const done = { ...base, hasProfileText: true, productCount: 4, verification: "PENDING" };
    expect(nextLifecycleStep(done, at(14))).toBe("market");
    expect(nextLifecycleStep({ ...done, recentMatches: 0 }, at(20))).toBeNull();
    expect(nextLifecycleStep({ ...base, onboardedAt: null }, at(20))).toBeNull();
  });

  it("uzun süre giriş yapmayana seri gitmez", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    expect(lifecycleAllowed(new Date(now.getTime() - 10 * DAY), new Date(0), now)).toBe(true);
    expect(lifecycleAllowed(new Date(now.getTime() - 200 * DAY), new Date(0), now)).toBe(false);
    expect(lifecycleAllowed(null, new Date(now.getTime() - 5 * DAY), now)).toBe(true);
  });
});

describe("haftalık özet seyrelmesi + yerel pencere", () => {
  const now = new Date("2026-10-05T07:30:00Z"); // Pazartesi, İstanbul 10:30
  it("aktif her hafta; 30+ gün iki haftada bir; 90+ dört haftada bir; 180+ hiç", () => {
    const ago = (d: number) => new Date(now.getTime() - d * DAY);
    expect(weeklySummaryAllowed(ago(3), now, 7)).toBe(true);
    expect(weeklySummaryAllowed(ago(40), now, 7)).toBe(false);
    expect(weeklySummaryAllowed(ago(40), now, 8)).toBe(true);
    expect(weeklySummaryAllowed(ago(100), now, 6)).toBe(false);
    expect(weeklySummaryAllowed(ago(100), now, 8)).toBe(true);
    expect(weeklySummaryAllowed(ago(200), now, 8)).toBe(false);
    expect(weeklySummaryAllowed(null, now, 8)).toBe(false);
  });

  it("yerel pazartesi 10:00 penceresi (İstanbul); Tokyo'da aynı an akşam", () => {
    expect(isLocalMonday(now, "Europe/Istanbul")).toBe(true);
    expect(inLifecycleWindow(now, "Europe/Istanbul")).toBe(true);
    expect(inLifecycleWindow(now, "Asia/Tokyo")).toBe(false);
  });
});
