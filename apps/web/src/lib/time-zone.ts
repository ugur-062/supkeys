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
 * Ürün saat dilimindeki TAKVİM GÜNÜNÜ taşıyan YEREL `Date` (yerel öğle 12:00)
 * — date-fns `format` yerel saatle yazdığı için gün/ay/yıl metni buradan
 * biçimlenir. Yalnız gösterim için; hesaplamada kullanılmaz.
 *
 * Saat bilerek TAŞINMAZ (derin denetim 2026-09-29): İstanbul duvar saatini
 * yerel `new Date(y, m, d, h, mi)` ile kurmak, tarayıcı yaz saati uygulayan
 * bir dilimdeyse ileri alma boşluğunda (ör. Berlin, Mart'ın son pazarı
 * 02:00–02:59) saati bir saat kaydırıyordu. Öğle vakti hiçbir dilimde geçiş
 * boşluğuna düşmez; saat:dakika `wallClock` parçalarından yazılır
 * (`formatDate`).
 */
export function toAppCalendarDate(date: Date): Date {
  const w = wallClock(date);
  return new Date(w.year, w.month - 1, w.day, 12, 0, 0);
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

const zoneFmt = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, timeZoneName: "shortOffset" });

/**
 * Ürün saat diliminin kısa etiketi ("GMT+3") — Türkçe dışı dillerde saat
 * metninin yanına basılır (2026-09-27, kayıt tüm ülkelere açıldı): Tokyo'daki
 * alıcı "17:00" kapanışını kendi saati sanmasın. Intl'den türetilir (yaz
 * saati olsaydı da doğru); sunucu ve istemci aynı değeri üretir.
 */
export function appZoneLabel(date: Date = new Date()): string {
  return zoneFmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT+3";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Tarih-saat GİRDİSİ (`YYYY-MM-DDTHH:mm`) de ürün saat diliminde (2026-09-27).
 * Eskiden girdi tarayıcının saatiyle yorumlanıyor, gösterim İstanbul'la
 * yapılıyordu → Tokyo'daki alıcının seçtiği 17:00 ekranda 11:00 görünüyordu.
 * Türkiye'deki tarayıcıda davranış aynı.
 */
export function toAppWallClockInput(date: Date): string {
  const w = wallClock(date);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}T${pad2(w.hour)}:${pad2(w.minute)}`;
}

/**
 * `YYYY-MM-DDTHH:mm(:ss)` girdisini ürün saat diliminin duvar saati sayıp ana
 * çevirir. Saat dilimi taşıyan ISO değer (`…Z`, `+03:00`) olduğu gibi okunur.
 * Geçersizse `null`.
 */
export function parseAppWallClockInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  const asUtc = Date.UTC(y!, mo! - 1, d!, h!, mi!, s ?? 0);
  // Duvar saatini UTC sayıp o andaki dilim farkını düş; yaz saati geçişine
  // karşı bir kez daha düzelt (bugün İstanbul sabit +3).
  const offsetAt = (ms: number) => {
    const w = wallClock(new Date(ms));
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  const out = new Date(t);
  return Number.isFinite(out.getTime()) ? out : null;
}

/**
 * Tarih seçicisinden (`type="date"`, `YYYY-MM-DD`) gelen gün aralığını ürün
 * saat diliminin tam günleri olarak ISO'ya çevirir: başlangıç günün 00:00'ı,
 * bitiş günün son milisaniyesi (ertesi gün 00:00 − 1 ms). Eskiden başlangıç
 * `new Date("YYYY-MM-DD")` ile UTC gece yarısı (TR'de 03:00), bitiş tarayıcı
 * saatiyle okunuyordu → başlangıç gününün ilk 3 saati rapordan düşüyordu.
 * Geçersiz girdide `null`.
 */
export function appDayRangeIso(
  startDay: string,
  endDay: string,
): { rangeStart: string; rangeEnd: string } | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/;
  const s = day.exec(startDay.trim());
  const e = day.exec(endDay.trim());
  if (!s || !e) return null;
  const start = parseAppWallClockInput(`${s[1]}-${s[2]}-${s[3]}T00:00`);
  const next = new Date(Date.UTC(Number(e[1]), Number(e[2]) - 1, Number(e[3]) + 1));
  const nextDay = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  const endExclusive = parseAppWallClockInput(`${nextDay}T00:00`);
  if (!start || !endExclusive) return null;
  return {
    rangeStart: start.toISOString(),
    rangeEnd: new Date(endExclusive.getTime() - 1).toISOString(),
  };
}
