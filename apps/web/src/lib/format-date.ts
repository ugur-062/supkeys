import { format, formatDistanceToNowStrict } from "date-fns";
import { enUS, ru, tr } from "date-fns/locale";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { appZoneLabel, toAppCalendarDate, wallClock } from "@/lib/time-zone";

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
 *
 * Türkçe dışı dillerde SAAT içeren metin dilim etiketi taşır ("17:00
 * (GMT+3)", 2026-09-27): yurt dışındaki kullanıcı kapanış saatini kendi
 * saati sanmasın. Yalnız tarih olan varyantlar etiketsiz.
 */
export type DateVariant = "long" | "short" | "datetime" | "relative";

/** date-fns yerelleri — anahtar @rothern/i18n `Locale`. */
const DATE_LOCALES = { tr, en: enUS, ru } as const;

export function formatDate(
  value: string | Date | null | undefined,
  variant: DateVariant,
  /**
   * Görüntüleme dili — ZORUNLU (2026-09-27): varsayılan Türkçe iken panelin
   * ~40 çağrısı dil vermiyor, İngilizce arayüzde "12 Eki 2026 17:00" (dilim
   * etiketsiz) basıyordu. Bileşende `useFormatDate()` (`@/i18n/domain`).
   */
  locale: Locale,
): string {
  const loc = DATE_LOCALES[locale] ?? tr;
  if (!value) return "—";
  const raw = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(raw.getTime())) return "—";
  if (variant === "relative") return formatDistanceToNowStrict(raw, { addSuffix: true, locale: loc });
  // Gün metni yerel öğle Date'inden, saat duvar saati parçalarından —
  // tarayıcının yaz saati boşluğu saati kaydıramaz (`toAppCalendarDate`).
  const d = toAppCalendarDate(raw);
  switch (variant) {
    case "long":
      return format(d, "d MMMM yyyy", { locale: loc });
    case "datetime": {
      const w = wallClock(raw);
      const hhmm = `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
      return `${format(d, "d MMM yyyy", { locale: loc })} ${hhmm}${zoneSuffix(locale, raw)}`;
    }
    default:
      return format(d, "d MMM yyyy", { locale: loc });
  }
}

/** Türkçe dışı dillerde saat metnine eklenen dilim etiketi (" (GMT+3)"); TR'de boş. */
export function zoneSuffix(locale: Locale | string | undefined, at?: Date): string {
  return !locale || locale === DEFAULT_LOCALE ? "" : ` (${appZoneLabel(at)})`;
}
