"use client";

import { useTranslations } from "next-intl";
import { CompanyCard } from "@/components/marketplace/company-card";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";

/**
 * "DOĞRULANMIŞ TEDARİKÇİLER" (satınalma) — Europages'in tedarikçi odağı:
 * 4 firma kartı (logo · Doğrulanmış · şehir · faaliyet · 3 ürün küçük resmi).
 * Panel dizin ucu (`company/directory/search`, doğrulanmış ∧ ürünlü); kart
 * herkese açık dizindekiyle AYNI bileşen, hedef panel profili (rothernId).
 * Sıralama dizinin kendi sırası — "yeni" iddiası yok (tarih sırası ucu yok).
 */
export const FEATURED_COMPANIES_LIMIT = 4;

export function FeaturedCompaniesBlock() {
  const t = useTranslations("web.panel.shell.featuredCompaniesBlock");
  const dir = useCompanySearch({ verified: true, hasProducts: true }, true);
  const items = (dir.data?.items ?? []).filter((c) => c.connectionStatus !== "self").slice(0, FEATURED_COMPANIES_LIMIT);
  if (!dir.isLoading && items.length === 0) return null;
  return (
    <section aria-label={t("dogrulanmisTedarikciler")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{t("dogrulanmisTedarikciler")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("kimligiDogrulanmisVitriniDoluFirmalar")}</p>
        </div>
        <Link href="/company/satinalma/tedarikcilerim" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          {t("tumFirmalar")}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      {dir.isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: FEATURED_COMPANIES_LIMIT }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((c) => (
            <CompanyCard key={c.slug} company={c} href={c.rothernId ? `/company/firma/${c.rothernId}` : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}
