/**
 * ÜRÜN SAAT DİLİMİ — TEK KAYNAK (2026-09-22).
 *
 * Kök neden: takvim günü ve tarih metinleri `new Date()` + yerel saat
 * dilimiyle hesaplanıyordu. Sunucu (Vercel fra1, UTC) ile Türkiye'deki
 * tarayıcı (UTC+3) 21:00–24:00 UTC arasında FARKLI takvim günündeydi →
 * "3 gün kaldı" (sunucu) / "2 gün kaldı" (istemci) → her gece 00:00–03:00
 * arasında React #418 hidrasyon hatası (staging'de ölçüldü, 2026-09-22).
 *
 * Kural: kullanıcıya gösterilen takvim günü ve tarih HER ZAMAN
 * `Europe/Istanbul` duvar saatiyle hesaplanır; sunucu ve istemci aynı
 * sonucu üretir. (Ürün tek pazar — Türkiye; çok bölge gelirse burası
 * firmanın saat dilimine çekilir, çağrı yerleri değişmez.)
 */
export const APP_TIME_ZONE = "Europe/Istanbul";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Bir anın ürün saat dilimindeki duvar saati parçaları. */
export function wallClock(date: Date): WallClock {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/**
 * Ürün saat diliminin duvar saatini taşıyan YEREL `Date` — date-fns `format`
 * yerel saatle yazdığı için, biçimlendirmeden önce buradan geçirilir.
 * Yalnız gösterim için; hesaplamada kullanılmaz.
 */
export function toAppWallClock(date: Date): Date {
  const w = wallClock(date);
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** Ürün saat diliminde takvim günü indeksi (1970-01-01'den bu yana gün). */
export function calendarDayIndex(date: Date): number {
  const w = wallClock(date);
  return Math.floor(Date.UTC(w.year, w.month - 1, w.day) / 86_400_000);
}

/** İki an arasındaki TAKVİM günü farkı (ürün saat dilimi); `to - from`. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return calendarDayIndex(to) - calendarDayIndex(from);
}
