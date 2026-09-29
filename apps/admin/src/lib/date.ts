import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

type DateInput = Date | string | number | null | undefined;

function toValidDate(value: DateInput): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * date-fns `format` — geçersiz/boş girdide `fallback` ("—") döner, ASLA throw
 * etmez. Ham `format(new Date(bozuk), ...)` `RangeError` atıp satır/sayfa
 * render'ını çökertir; admin panelinde bu tolere edilemez.
 */
export function safeFormat(
  value: DateInput,
  pattern: string,
  fallback = "—",
): string {
  const d = toValidDate(value);
  return d ? format(d, pattern, { locale: tr }) : fallback;
}

/** date-fns `formatDistanceToNow` — geçersiz/boş girdide `fallback`. */
export function safeFormatDistance(
  value: DateInput,
  opts?: { addSuffix?: boolean },
  fallback = "—",
): string {
  const d = toValidDate(value);
  return d
    ? formatDistanceToNow(d, { locale: tr, addSuffix: opts?.addSuffix })
    : fallback;
}

/**
 * `<input type="datetime-local">` değeri/alt sınırı — YEREL saatle
 * ("yyyy-MM-dd'T'HH:mm"). UTC ISO'yu `slice(0, 16)` ile kesmek TR'de (UTC+3)
 * sınırı 3 saat geriye kaydırıyordu (derin denetim LU-12). Geçersiz girdide
 * şimdiki an kullanılır.
 */
export function toDateTimeLocal(value?: DateInput): string {
  return format(toValidDate(value) ?? new Date(), "yyyy-MM-dd'T'HH:mm");
}
