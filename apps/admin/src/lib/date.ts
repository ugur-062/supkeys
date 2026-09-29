import { addMinutes, format, formatDistanceToNow, startOfMinute } from "date-fns";
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

/**
 * `value`'dan (boş/geçersizse şimdiki andan) KESİN SONRAKİ ilk tam dakika,
 * datetime-local biçiminde. Backend uzatma/yeniden açmada `closesAt <= eski
 * kapanış` ve `closesAt <= şimdi` değerlerini reddeder. Alt sınır dakikaya
 * aşağı yuvarlanmış an olursa seçicideki en erken değer (ve saniyeli
 * kapanışın aynı dakikası) 400 alıyordu (derin denetim LU-12, gözden geçirme).
 */
export function nextDateTimeLocal(value?: DateInput): string {
  const base = toValidDate(value) ?? new Date();
  return format(addMinutes(startOfMinute(base), 1), "yyyy-MM-dd'T'HH:mm");
}

/**
 * `<input type="date">` / rapor aralığı değeri — YEREL takvim günü
 * ("yyyy-MM-dd"). `toISOString().slice(0, 10)` UTC gününü verir; TR'de
 * 00:00-03:00 arası "bugün" bir önceki gün sayılıyor, ayın 1'i gecesi "Bu Ay"
 * aralığı ters kurulup rapor boş dönüyordu (derin denetim LU-13). Geçersiz
 * girdide bugün kullanılır.
 */
export function toDateInput(value?: DateInput): string {
  return format(toValidDate(value) ?? new Date(), "yyyy-MM-dd");
}
