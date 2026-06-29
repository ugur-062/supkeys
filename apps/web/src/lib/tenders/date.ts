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
