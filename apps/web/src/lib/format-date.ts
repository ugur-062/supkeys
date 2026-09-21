import { format, formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import { toAppWallClock } from "@/lib/time-zone";

/**
 * P1 (frontend denetimi §8.2) — TEK tarih formatlayıcı. Varyantlar:
 *  - "long":     2 Ağustos 2026
 *  - "short":    2 Ağu 2026
 *  - "datetime": 2 Ağu 2026 18:47
 *  - "relative": 3 gün önce (akış listeleri: bildirimler, mesajlar)
 * dd.mm.yyyy YALNIZ <input> değerlerinde kalır; UI metinleri buradan geçer.
 *
 * SAAT DİLİMİ (2026-09-22): tarih/saat metni ÜRÜN saat dilimiyle
 * (`Europe/Istanbul`, `lib/time-zone.ts`) yazılır — sunucu UTC'de basıp
 * istemci +3'te basınca gece yarısı çevresinde gün değişiyor ve herkese
 * açık sayfalarda hidrasyon uyuşmazlığı doğuyordu. "relative" mesafe
 * hesabıdır, saat diliminden etkilenmez.
 */
export type DateVariant = "long" | "short" | "datetime" | "relative";

export function formatDate(
  value: string | Date | null | undefined,
  variant: DateVariant = "short",
): string {
  if (!value) return "—";
  const raw = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(raw.getTime())) return "—";
  const d = variant === "relative" ? raw : toAppWallClock(raw);
  switch (variant) {
    case "long":
      return format(d, "d MMMM yyyy", { locale: tr });
    case "datetime":
      return format(d, "d MMM yyyy HH:mm", { locale: tr });
    case "relative":
      return formatDistanceToNowStrict(d, { addSuffix: true, locale: tr });
    default:
      return format(d, "d MMM yyyy", { locale: tr });
  }
}
