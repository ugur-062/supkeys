import { closingUrgency as closingUrgencyTr, daysUntil } from "@/lib/tenders/seller-state";
import { countryName as countryNameTr, companyActivityLabel } from "@rothern/shared";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";

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
