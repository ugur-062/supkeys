import { describe, expect, it } from "vitest";
import { calendarDaysBetween, toAppWallClock, wallClock } from "./time-zone";

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
