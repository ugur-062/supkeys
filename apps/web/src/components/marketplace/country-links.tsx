import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { countryProductPath } from "@rothern/shared";
import { countryDisplayName } from "@/i18n/domain";
import { Link } from "@/i18n/navigation";

/**
 * ÜLKE BAĞLANTI ŞERİDİ (2026-09-27) — ülke sayfalarına iç bağlantı (şehir
 * şeridiyle aynı gerekçe: sitemap keşif sağlar, iç bağlantı otorite aktarır).
 * Yalnız ürünü olan ülkeler; tek ülke varsa (henüz yalnız Türkiye) çizilmez.
 */
export function CountryLinks({
  countries,
  activeCountry,
}: {
  countries: { country: string; count: number }[] | undefined;
  activeCountry?: string;
}) {
  const t = useTranslations("web.marketplace.cityLinks");
  const locale = useLocale() as Locale;
  const list = (countries ?? []).filter((c) => c.count > 0 && c.country !== activeCountry).slice(0, 24);
  if (list.length === 0 || (list.length === 1 && !activeCountry)) return null;
  return (
    <section className="mx-auto mt-2 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
      <h2 className="text-sm font-semibold text-zinc-900">{t("countries")}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <li key={c.country}>
            <Link
              href={countryProductPath(c.country)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-zinc-700 ring-1 ring-zinc-950/10 ring-inset transition hover:text-zinc-950 hover:ring-zinc-950/20"
            >
              {countryDisplayName(c.country, locale)}
              <span className="text-xs text-zinc-500 tabular-nums">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
