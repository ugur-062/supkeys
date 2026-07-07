import { format } from "date-fns";
import { tr } from "date-fns/locale";

type DateInput = Date | string | number | null | undefined;

/** Tarih (gün) — "5 Tem 2026". Geçersiz/boş girdide "—". */
export function formatDate(value: DateInput): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy", { locale: tr });
}

/** Tarih + saat — "5 Tem 2026 14:30". Geçersiz/boş girdide "—". */
export function formatDateTime(value: DateInput): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy HH:mm", { locale: tr });
}

/** Yalnızca saat — "14:30". Geçersiz/boş girdide "—". */
export function formatTime(value: DateInput): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "HH:mm", { locale: tr });
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
