import { describe, expect, it } from "vitest";
import { calendarDaysBetween, appZoneLabel, parseAppWallClockInput, toAppWallClock, toAppWallClockInput, wallClock } from "./time-zone";
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

  it("toAppWallClock yerel Date'e Türkiye duvar saatini taşır", () => {
    const d = toAppWallClock(new Date("2026-09-21T21:30:00Z"));
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 22, 0, 30]);
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
