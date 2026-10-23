import { DEFAULT_TIME_ZONE, zonedParts, zonedTimeToUtc } from "./country-time-zone";

/**
 * Uygulama takvimi — gün/ay/çeyrek/yıl sınırları Europe/Istanbul DUVAR
 * SAATİYLE (CLAUDE.md: gün/ay İstanbul). Sunucuda TZ tanımlı değil (UTC);
 * `new Date(y, m, 1)` ile kurulan sınır İstanbul'da 03:00'e denk geliyor,
 * 1 Ekim 01:00 (TR) kaydı Eylül'e yazılıyordu (derin denetim LU-07).
 */
const TZ = DEFAULT_TIME_ZONE;

export interface AppMonth {
  /** Ayın ilk günü 00:00 (İstanbul) — UTC anı. */
  start: Date;
  /** Sonraki ayın ilk günü 00:00 (İstanbul) — HARİÇ üst sınır. */
  end: Date;
  /** "YYYY-MM" (İstanbul takvimi). */
  key: string;
  /** Ay adı biçimlemek için her dilimde aynı aya düşen an (ayın 15'i, UTC öğlen). */
  labelDate: Date;
}

function monthAt(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** `now`ın İstanbul ayından `offset` ay kaydırılmış takvim ayı. */
export function appMonth(now: Date, offset = 0): AppMonth {
  const p = zonedParts(now, TZ);
  const idx = p.year * 12 + (p.month - 1) + offset;
  const cur = monthAt(idx);
  const next = monthAt(idx + 1);
  return {
    start: zonedTimeToUtc(cur.year, cur.month, 1, 0, 0, TZ),
    end: zonedTimeToUtc(next.year, next.month, 1, 0, 0, TZ),
    key: `${cur.year}-${String(cur.month).padStart(2, "0")}`,
    labelDate: new Date(Date.UTC(cur.year, cur.month - 1, 15, 12)),
  };
}

/** İçinde bulunulan çeyreğin başlangıcı (İstanbul). */
export function appQuarterStart(now: Date): Date {
  const p = zonedParts(now, TZ);
  const qMonth = Math.floor((p.month - 1) / 3) * 3 + 1;
  return zonedTimeToUtc(p.year, qMonth, 1, 0, 0, TZ);
}

/** İçinde bulunulan yılın başlangıcı (İstanbul). */
export function appYearStart(now: Date): Date {
  return zonedTimeToUtc(zonedParts(now, TZ).year, 1, 1, 0, 0, TZ);
}

/** "YYYY-MM-DD" (İstanbul takvim günü) → o günün 00:00'ı; biçim/tarih geçersizse null. */
export function appDayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return zonedTimeToUtc(y, mo, d, 0, 0, TZ);
}

/** `ymd` gününün ertesi günü 00:00 (İstanbul) — HARİÇ üst sınır. */
export function appNextDayStart(ymd: string): Date | null {
  const start = appDayStart(ymd);
  if (!start) return null;
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, TZ);
}

/** İstanbul takvim günü (gün numarası) ve o günü her dilimde gösteren an. */
export function appDay(date: Date): { day: number; labelDate: Date } {
  const p = zonedParts(date, TZ);
  return { day: p.day, labelDate: new Date(Date.UTC(p.year, p.month - 1, p.day, 12)) };
}

/**
 * "YYYY-MM-DD" — anın İstanbul takvim günü. `toISOString().slice(0, 10)` UTC
 * günü verir; TR 00:00-03:00 arası önceki güne düşerdi (derin denetim LU-17).
 */
export function appDayKey(date: Date): string {
  const p = zonedParts(date, TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
