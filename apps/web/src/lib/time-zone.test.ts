import { describe, expect, it } from "vitest";
import { appDayRangeIso, calendarDaysBetween, appZoneLabel, parseAppWallClockInput, toAppCalendarDate, toAppWallClockInput, wallClock } from "./time-zone";
import { formatDate } from "./format-date";
import { formatTime } from "./tenders/date";
import { closesAtErrorKey } from "./tenders/closes-at";

/**
 * Sunucu (UTC) ile Türkiye'deki tarayıcı 21:00–24:00 UTC arasında farklı
 * takvim günündeydi → hidrasyon #418 (2026-09-22). Bu testler ortamın saat
 * diliminden BAĞIMSIZ sonuç üretildiğini kilitler.
 */
describe("time-zone", () => {
  it("duvar saati Europe/Istanbul: 21:30 UTC = ertesi gün 00:30", () => {
    const w = wallClock(new Date("2026-09-21T21:30:00Z"));
    expect([w.year, w.month, w.day, w.hour, w.minute]).toEqual([2026, 9, 22, 0, 30]);
  });

  it("takvim günü farkı gece yarısı sınırında Türkiye gününe göre", () => {
    const now = new Date("2026-09-21T21:09:00Z"); // 22 Eyl 00:09 TR
    const closes = new Date("2026-09-24T13:07:00Z"); // 24 Eyl 16:07 TR
    // UTC'de 3 gün (21→24), Türkiye'de 2 gün (22→24) — doğru olan ikincisi.
    expect(calendarDaysBetween(now, closes)).toBe(2);
    expect(calendarDaysBetween(closes, now)).toBe(-2);
  });

  it("aynı gün → 0; yerel saat dilimi ne olursa olsun", () => {
    expect(calendarDaysBetween(new Date("2026-09-22T05:00:00Z"), new Date("2026-09-22T20:59:00Z"))).toBe(0);
    // 21:00 UTC Türkiye'de ertesi gün.
    expect(calendarDaysBetween(new Date("2026-09-22T05:00:00Z"), new Date("2026-09-22T21:00:00Z"))).toBe(1);
  });

  it("toAppCalendarDate yerel Date'e Türkiye takvim gününü taşır", () => {
    const d = toAppCalendarDate(new Date("2026-09-21T21:30:00Z"));
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 9, 22]);
  });

  it("datetime: tarayıcının yaz saati boşluğu saati kaydırmaz (Berlin, 28 Mar 2027 02:30 TR)", () => {
    const prev = process.env.TZ;
    process.env.TZ = "Europe/Berlin";
    try {
      // 2027-03-27T23:30Z = İstanbul 28 Mart 02:30; Berlin'de 02:00–02:59 yok.
      expect(formatDate("2027-03-27T23:30:00Z", "datetime", "en")).toBe("28 Mar 2027 02:30 (GMT+3)");
      expect(formatDate("2027-03-27T23:30:00Z", "datetime", "tr")).toBe("28 Mar 2027 02:30");
    } finally {
      process.env.TZ = prev;
    }
  });
});

/**
 * Yurt dışı kullanıcı (2026-09-27): girdi de gösterim de İstanbul duvar saati;
 * Türkçe dışı dilde saat metni dilim etiketi taşır.
 */
describe("time-zone — girdi ve etiket", () => {
  it("girdi İstanbul duvar saati sayılır; tarayıcı Tokyo'da olsa da", () => {
    const prev = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try {
      expect(parseAppWallClockInput("2026-10-01T17:00")?.toISOString()).toBe("2026-10-01T14:00:00.000Z");
      expect(toAppWallClockInput(new Date("2026-10-01T14:00:00Z"))).toBe("2026-10-01T17:00");
    } finally {
      process.env.TZ = prev;
    }
  });

  it("dilim taşıyan ISO olduğu gibi okunur; geçersiz → null", () => {
    expect(parseAppWallClockInput("2026-10-01T14:00:00.000Z")?.toISOString()).toBe("2026-10-01T14:00:00.000Z");
    expect(parseAppWallClockInput("xx")).toBeNull();
    expect(parseAppWallClockInput("")).toBeNull();
    expect(closesAtErrorKey("xx")).toBe("invalid");
  });

  it("saat metni: TR etiketsiz, EN/RU '(GMT+3)'; yalnız tarih etiketsiz", () => {
    const at = new Date("2026-10-01T14:00:00Z");
    expect(appZoneLabel(at)).toBe("GMT+3");
    expect(formatDate(at, "datetime", "tr")).toBe("1 Eki 2026 17:00");
    expect(formatDate(at, "datetime", "en")).toBe("1 Oct 2026 17:00 (GMT+3)");
    expect(formatDate(at, "short", "en")).toBe("1 Oct 2026");
    expect(formatTime(at, "tr")).toBe("17:00");
    expect(formatTime(at, "ru")).toBe("17:00 (GMT+3)");
  });
});

describe("appDayRangeIso — rapor gün aralığı İstanbul tam günleri", () => {
  it("başlangıç günün 00:00'ı, bitiş günün son milisaniyesi (tarayıcı saatinden bağımsız)", () => {
    expect(appDayRangeIso("2026-09-01", "2026-09-30")).toEqual({
      rangeStart: "2026-08-31T21:00:00.000Z",
      rangeEnd: "2026-09-30T20:59:59.999Z",
    });
  });

  it("ay/yıl sonu devri doğru; 01:30 TR'de açılan kayıt aralığa girer", () => {
    const r = appDayRangeIso("2026-12-31", "2026-12-31")!;
    expect(r.rangeStart).toBe("2026-12-30T21:00:00.000Z");
    expect(r.rangeEnd).toBe("2026-12-31T20:59:59.999Z");
    const r2 = appDayRangeIso("2026-09-01", "2026-09-01")!;
    const at0130 = new Date("2026-08-31T22:30:00.000Z").toISOString();
    expect(at0130 >= r2.rangeStart && at0130 <= r2.rangeEnd).toBe(true);
  });

  it("geçersiz girdide null", () => {
    expect(appDayRangeIso("", "2026-09-30")).toBeNull();
    expect(appDayRangeIso("2026-09-01", "30.09.2026")).toBeNull();
  });
});
