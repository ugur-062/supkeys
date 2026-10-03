import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { GlobeAltIcon } from "@heroicons/react/20/solid";
import { countryDisplayName } from "@/i18n/domain";

/**
 * ÜLKE UYGUNLUK NOTU (2026-09-27) — talep yalnız belirli ülkelere açıksa
 * herkese açık talep sayfasında kayıt çağrısının ÜSTÜNDE: "Yalnız Türkiye
 * merkezli tedarikçiler teklif verebilir." Eskiden herkese "Teklif vermek için
 * kaydolun" deniyordu; Alman tedarikçi kaydolup panelde "bulunamadı" alıyordu
 * (panel artık 403 `COUNTRY_NOT_ELIGIBLE` ile aynı olguyu söylüyor).
 *
 * Tüm ülkelere açık talepte çizilmez. Liste KISALTILMAZ ("+3 ülke" değil):
 * ziyaretçi kendi ülkesinin listede olup olmadığını görmeli. Hedef ülkeler
 * talebin niteliğidir, sahibinin kimliği değil (anonimlik kuralı bozulmaz).
 */
export function ListingEligibilityNote({
  targetCountries,
}: {
  targetCountries: readonly string[] | null | undefined;
}) {
  const t = useTranslations("web.marketplace.listing");
  const locale = useLocale() as Locale;
  const fmt = useFormatter();
  const list = targetCountries ?? [];
  if (list.length === 0) return null;
  const countries = fmt.list(
    list.map((c) => countryDisplayName(c, locale)),
    { type: "conjunction" },
  );
  return (
    <p
      data-testid="listing-eligibility-note"
      className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-200"
    >
      <GlobeAltIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{t("onlyCountriesCanBid", { countries, n: list.length })}</span>
    </p>
  );
}
