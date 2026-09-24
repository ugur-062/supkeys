import { closingUrgency as closingUrgencyTr, daysUntil } from "@/lib/tenders/seller-state";
import { UNITS, companyActivityLabel, countryName as countryNameTr, provinceDisplayName } from "@rothern/shared";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import type { PriceLabels } from "@/lib/public/product-price";
import type { SeoT } from "@/lib/seo/entities";
import { INTL_LOCALE } from "./format";
import { DELIVERY_TERM_LABELS, PAYMENT_CATEGORY_LABELS } from "@/lib/tenders/labels";
import { segmentTaglineKey } from "@/lib/public/segment-taglines";

/**
 * Alan sözlükleri — dil farkında (i18n Faz 1). Paylaşılan paketteki Türkçe
 * yardımcılar (`companyActivityLabel`, `scopeLabel`, `closingUrgency`) API ve
 * panel için tek kaynak olarak kalır; web'in dil bilen yüzeyleri bu hook'ları
 * kullanır. Ülke adı ISO kodlarında `Intl.DisplayNames`tan gelir (98 ülkeyi
 * üç dilde elle yazmadan), ISO dışı kod (XN/KKTC) paylaşılan Türkçe ada düşer.
 */

export function countryDisplayName(code: string, locale: Locale): string {
  if (locale !== DEFAULT_LOCALE && /^[A-Z]{2}$/.test(code) && code !== "XN") {
    try {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(code);
      if (name && name !== code) return name;
    } catch {
      // eski çalışma zamanı — Türkçe ada düş
    }
  }
  return countryNameTr(code);
}

/**
 * Şehir adı (serbest metin il adı) istenen dilde: İngilizcede Istanbul/Izmir,
 * Rusçada Kiril (Стамбул); Türkçede ve tanınmayan metinde ham değer. Kaynak
 * `@rothern/shared` `TR_PROVINCE_NAMES_I18N` (81 il).
 */
export function cityDisplayName(city: string | null | undefined, locale: Locale): string {
  return provinceDisplayName(city, locale);
}

export function useCityLabel(): (city: string | null | undefined) => string {
  const locale = useLocale() as Locale;
  return (city) => cityDisplayName(city, locale);
}

/**
 * Menü/rota etiketi (i18n Faz 2): `lib/company/portals.ts` etiketleri
 * `web.panel.nav.*` anahtarıdır; kabuk `tn(item.label)` ile çizer. Anahtar
 * dizisi tipsiz gelir (nav tanımı `label: string`) → `as never`.
 */
export function useNavLabel(): ((key: string) => string) & { has: (key: string) => boolean } {
  const t = useTranslations("web.panel.nav");
  return Object.assign((key: string) => t(key as never), { has: (key: string) => t.has(key as never) });
}

/** Rol etiketi (`web.domain.role.<KOD>`); bilinmeyen kod olduğu gibi. */
export function useRoleLabel(): (code: string) => string {
  const t = useTranslations("web.domain.role");
  return (code) => (t.has(code as never) ? t(code as never) : code);
}

/**
 * Göreli zaman ("az önce", "5 dk önce"; kısa biçim "5 dk") — bildirim ve mesaj
 * kutuları. 7 günden eskisi kısa tarih. Anahtarlar `web.domain.relativeTime.*`.
 */
export function useRelativeTime(style: "ago" | "short" = "ago"): (iso: string | null | undefined) => string {
  const t = useTranslations("web.domain.relativeTime");
  return (iso) => {
    if (!iso) return "";
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return t("justNow");
    if (min < 60) return t(style === "ago" ? "minutesAgo" : "minutes", { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t(style === "ago" ? "hoursAgo" : "hours", { n: hr });
    const day = Math.floor(hr / 24);
    if (day < 7) return t(style === "ago" ? "daysAgo" : "days", { n: day });
    return formatDate(iso, "short");
  };
}

export function useActivityLabel(): (code: string) => string {
  const t = useTranslations("web.domain.activity");
  return (code) => (t.has(code as never) ? t(code as never) : companyActivityLabel(code));
}

export function useScopeLabel(): (targetCountries: readonly string[], ownerCountry?: string | null) => string {
  const t = useTranslations("web.domain.scope");
  const locale = useLocale();
  return (targetCountries, ownerCountry) => {
    if (targetCountries.length === 0) return t("allCountries");
    const first = targetCountries[0]!;
    if (targetCountries.length === 1) {
      const country = countryDisplayName(first, locale);
      return ownerCountry && first === ownerCountry ? t("onlyCountry", { country }) : country;
    }
    if (targetCountries.length <= 2) return targetCountries.map((c) => countryDisplayName(c, locale)).join(", ");
    return t("plusMore", { country: countryDisplayName(first, locale), n: targetCountries.length - 1 });
  };
}

/** `closingUrgency` ile aynı eşikler/renk sınıfı; metin katalogdan. */
export function useClosingUrgency(): (
  listingStatus: string,
  closesAt: string | null,
) => { text: string; className: string; days: number } | null {
  const t = useTranslations("web.domain.closing");
  return (listingStatus, closesAt) => {
    const base = closingUrgencyTr(listingStatus, closesAt);
    const days = daysUntil(closesAt);
    if (!base || days === null) return null;
    const text = days > 0 ? t("daysLeft", { days }) : days === 0 ? t("endsToday") : t("expired");
    return { text, className: base.className, days };
  };
}

/** `productPrice` etiketleri — istemci. Sunucu karşılığı `priceLabelsFor` (i18n/server.ts). */
export function usePriceLabels(): PriceLabels {
  const t = useTranslations("web.marketplace.price");
  const locale = useLocale();
  return {
    locale: INTL_LOCALE[locale] ?? "tr-TR",
    onRequest: t("onRequest"),
    fromQty: (qty, unit) => t("fromQty", { qty, unit }),
  };
}

export function useDeliveryTermLabel(): (code: string) => string {
  const t = useTranslations("web.domain.deliveryTerm");
  return (code) => (t.has(code as never) ? t(code as never) : (DELIVERY_TERM_LABELS[code as keyof typeof DELIVERY_TERM_LABELS] ?? code));
}

export function usePaymentCategoryLabel(): (code: string) => string {
  const t = useTranslations("web.domain.paymentCategory");
  return (code) => (t.has(code as never) ? t(code as never) : (PAYMENT_CATEGORY_LABELS[code as keyof typeof PAYMENT_CATEGORY_LABELS] ?? code));
}

/** Kategori vitrini tanıtım kartının sloganı — anahtar `segmentTaglineKey`, metin katalogdan. */
export function useSegmentTagline(): (code: string | undefined) => string {
  const t = useTranslations("web.marketing.taglines");
  return (code) => t(segmentTaglineKey(code));
}

/**
 * `entities.ts` SEO üreticileri için çevirmen — İSTEMCİ. Sunucu karşılığı
 * `seoT(locale)` (i18n/server.ts). Üreticiler çevirmeni parametre alır ki
 * `server-only` katalog yükleyici istemci paketine girmesin.
 */
export function useSeoT(): SeoT {
  const t = useTranslations();
  return (key, values) => t(key as never, values as never);
}

/**
 * Ölçü birimi etiketi — koddan (`unitCode`) ya da Türkçe ad/simgeden çözülüp
 * katalogdan basılır (`web.domain.unit.<KOD>`); eşleşme yoksa özgün metin.
 * Ürün/talep verisinde birim Türkçe ad olarak saklanır ("adet", "gün"), EN/RU
 * sayfada "piece"/"day" gerekir (2026-09-23 tarama bulgusu).
 */
export function useUnitLabel(): (unit: string | null | undefined, code?: string | null) => string {
  const t = useTranslations("web.domain.unit");
  return (unit, code) => {
    const known = code ? UNITS.find((u) => u.code === code) : unit ? UNITS.find((u) => u.nameTr === unit || u.symbol === unit || u.code === unit) : undefined;
    if (known && t.has(known.code as never)) return t(known.code as never);
    return unit ?? "";
  };
}

