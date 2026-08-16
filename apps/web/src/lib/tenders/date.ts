import { formatDate as canonical } from "@/lib/format-date";

type DateInput = Date | string | number | null | undefined;

/**
 * B9 — İNCE KABUK: tüm çıktılar kanonik formatlayıcıya (lib/format-date.ts)
 * delege edilir; iki util'in formatları birbirinden KAYAMAZ. Yeni kod doğrudan
 * `formatDate(value, variant)` kullansın.
 */

/** Tarih (gün) — "5 Tem 2026". Geçersiz/boş girdide "—". */
export function formatDate(value: DateInput): string {
  return canonical(normalize(value), "short");
}

/** Tarih + saat — "5 Tem 2026 14:30". Geçersiz/boş girdide "—". */
export function formatDateTime(value: DateInput): string {
  return canonical(normalize(value), "datetime");
}

/** Yalnızca saat — "14:30". Geçersiz/boş girdide "—". */
export function formatTime(value: DateInput): string {
  const d = normalize(value);
  if (!d) return "—";
  const dd = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dd.getTime())) return "—";
  return `${String(dd.getHours()).padStart(2, "0")}:${String(dd.getMinutes()).padStart(2, "0")}`;
}

function normalize(value: DateInput): Date | string | null {
  if (value == null) return null;
  if (typeof value === "number") return new Date(value);
  return value;
}

/**
 * Bugünün YEREL takvim tarihi — "2026-07-10". `<input type="date" min>` için.
 * `new Date().toISOString().slice(0,10)` UTC tarihini verir; UTC+3'te yerel
 * gece yarısı ile UTC arasında gün kayıp min bir gün geride/ileride kalabilir.
 */
export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
