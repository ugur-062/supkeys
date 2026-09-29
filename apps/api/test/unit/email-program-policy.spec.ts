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

  it("günde TEK özet: bugün özet gittiyse 18:00 sonrası kalem ertesi 18:00'i bekler (derin denetim MU-14)", () => {
    const tz = "Europe/Istanbul";
    const digestAt = new Date("2026-10-07T15:00:00Z"); // İstanbul 18:00 — bugünün özeti
    const lateItem = new Date("2026-10-07T15:40:00Z"); // İstanbul 18:40
    const lateEvening = new Date("2026-10-07T19:00:00Z"); // İstanbul 22:00
    expect(digestDue({ now: lateEvening, timeZone: tz, oldestItemAt: lateItem, lastDigestAt: digestAt })).toBe(false);
    // Ertesi sabah: o günün özeti KAÇMADI → "dünden kalan" sabah gönderimi yok.
    const nextMorning = new Date("2026-10-08T07:00:00Z");
    expect(digestDue({ now: nextMorning, timeZone: tz, oldestItemAt: lateItem, lastDigestAt: digestAt })).toBe(false);
    // Ertesi akşam 18:00'de gider.
    const nextEvening = new Date("2026-10-08T15:00:00Z");
    expect(digestDue({ now: nextEvening, timeZone: tz, oldestItemAt: lateItem, lastDigestAt: digestAt })).toBe(true);
    // Öğenin günü özetsiz geçtiyse (kaçan özet) sabah gider.
    const oldDigest = new Date("2026-10-05T15:00:00Z");
    expect(digestDue({ now: nextMorning, timeZone: tz, oldestItemAt: lateItem, lastDigestAt: oldDigest })).toBe(true);
    // 24 saati aşan kalem her durumda gider.
    expect(
      digestDue({ now: new Date(lateItem.getTime() + DAY), timeZone: tz, oldestItemAt: lateItem, lastDigestAt: new Date(lateItem.getTime() + DAY - 3_600_000) }),
    ).toBe(true);
  });

  it("sabah telafisi aynı günün 18:00 özetini engellemez; özet akşama geri döner (derin denetim LU-33)", () => {
    const tz = "Europe/Istanbul";
    // 07 Ekim akşam özeti kaçtı → 08 Ekim 10:00 telafi özeti gitti.
    const catchUp = new Date("2026-10-08T07:00:00Z"); // İstanbul 10:00
    const noonItem = new Date("2026-10-08T11:00:00Z"); // İstanbul 14:00
    // Öğlen gelen kalem akşama dek bekler...
    expect(digestDue({ now: new Date("2026-10-08T13:00:00Z"), timeZone: tz, oldestItemAt: noonItem, lastDigestAt: catchUp })).toBe(false);
    // ...ve 18:00'de gider (eskiden sabah damgası akşamı kapatıyordu).
    const evening = new Date("2026-10-08T15:00:00Z"); // İstanbul 18:00
    expect(digestDue({ now: evening, timeZone: tz, oldestItemAt: noonItem, lastDigestAt: catchUp })).toBe(true);
    // Akşam özeti gittikten sonra o gün ikincisi yine gitmez.
    const lateItem = new Date("2026-10-08T16:00:00Z");
    expect(digestDue({ now: new Date("2026-10-08T18:00:00Z"), timeZone: tz, oldestItemAt: lateItem, lastDigestAt: evening })).toBe(false);
    // Öğlen 24 saat tavanıyla giden özet de akşamı engellemez.
    const capDigest = new Date("2026-10-08T10:00:00Z"); // İstanbul 13:00
    expect(digestDue({ now: evening, timeZone: tz, oldestItemAt: noonItem, lastDigestAt: capDigest })).toBe(true);
  });
});

describe("karşılama serisi (davranışa bağlı)", () => {
  const base: LifecycleState = {
    onboardedAt: new Date("2026-10-01T09:00:00Z"),
    hasProfileText: false,
    productCount: 0,
    verification: "UNVERIFIED",
    recentMatches: 5,
    paid: false,
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

  it("gün 21 ikinci doğrulama hatırlatması (hâlâ doğrulanmamışa); gün 24 Silver adımı yalnız DOĞRULANMIŞ ücretsize", () => {
    const early = new Set(["profile", "first_product", "verify", "market"] as const);
    expect(nextLifecycleStep({ ...base, sent: early }, at(20))).toBeNull();
    expect(nextLifecycleStep({ ...base, sent: early }, at(21))).toBe("verify_again");
    // Doğrulanmamış: Silver adımı henüz gitmez (paket alımı doğrulama ister).
    const afterAgain = new Set([...early, "verify_again"] as const);
    expect(nextLifecycleStep({ ...base, sent: afterAgain }, at(25))).toBeNull();
    // Doğrulandı → Silver adımı; ücretliye hiç gitmez; incelemedekine de gitmez.
    const verified = { ...base, verification: "VERIFIED", sent: early };
    expect(nextLifecycleStep(verified, at(24))).toBe("silver");
    expect(nextLifecycleStep({ ...verified, paid: true }, at(24))).toBeNull();
    expect(nextLifecycleStep({ ...base, verification: "PENDING", sent: early }, at(25))).toBeNull();
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
