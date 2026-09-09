import { CompanyCard } from "@/components/marketplace/company-card";
import { CompanyActiveChips, CompanyFilters, CompanySortBar } from "@/components/marketplace/company-filters";
import { FilterResults, MobileFilterButton, ResultCount } from "@/components/marketplace/filter-shell";
import { CompanyFilterShell } from "@/components/marketplace/list-filter-shells";
import { PublicEmptyState } from "@/components/marketplace/public-empty-state";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { PublicListPage } from "@/components/marketplace/public-list-page";
import { PublicSearchTabs } from "@/components/marketplace/public-search-tabs";
import { crossCounts } from "@/lib/public/cross-counts";
import { Pagination } from "@/components/ui/pagination";
import {
  activeCompanyFilterCount,
  buildCompanyFilterQuery,
  parseCompanyFilters,
  toDirectoryParams,
} from "@/lib/public/company-filter-params";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { fetchPublicDirectory, fetchPublicDirectoryFacets } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { signupHref } from "@/lib/public/visibility";
import { resolveSiteUrl } from "@/lib/site-url";
import { JsonLd } from "@/components/seo/json-ld";
import { graph, itemListNode } from "@/lib/seo/jsonld";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * FİRMA DİZİNİ — HERKESE AÇIK (görünürlük v2, 2026-09-04 kullanıcı kararı).
 * Süzgeç v4 (PROMPT 4, 2026-09-06): ürün dizinindeki kabuk — URL durumu,
 * geçiş, mobil çekmece, bağlamsal facet, 7 yuvalı sayfalama. Şema tek kaynak
 * `lib/public/company-filter-params.ts`. Listelenme koşulu API'de: profil
 * kapısı + (≥1 yayında ürün VEYA tamlık ≥ %60). Rothern ID ve iletişim üyeye.
 *
 * Public rota → `PUBLIC_ROUTE_PREFIXES`te, ISR, nonce'suz CSP, sitemap'te.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${MARKETPLACE_LABELS.companies} — doğrulanmış alıcı ve tedarikçi firmalar`,
  description:
    "Rothern'deki alıcı ve tedarikçi firmalar: faaliyet tipi, şehir ve kategoriye göre süzün; ürünlerini ve profillerini inceleyin.",
  alternates: { canonical: `${resolveSiteUrl()}${MARKETPLACE_ROUTES.companies}` },
  openGraph: {
    title: `${MARKETPLACE_LABELS.companies} — Rothern`,
    url: `${resolveSiteUrl()}${MARKETPLACE_ROUTES.companies}`,
    type: "website",
  },
};

export default async function Page({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  if (!MARKETPLACE_LIVE) notFound();
  const state = parseCompanyFilters(await searchParams);
  const params = toDirectoryParams(state);
  // Karşı yüzey sayaçları YALNIZ arama varken: aramasız gezinen kullanıcı
  // için "Ürünler 57" gürültü, ayrıca her sayfa yükünde iki ek istek olurdu.
  const [result, facets, otherCounts] = await Promise.all([
    fetchPublicDirectory(params),
    fetchPublicDirectoryFacets({
      q: params.q, city: params.city, category: params.category, activity: params.activity,
      verified: params.verified, hasProducts: params.hasProducts, gold: params.gold,
    }),
    crossCounts(state.q, "companies"),
  ]);
  const base = MARKETPLACE_ROUTES.companies;
  const hasFilter = activeCompanyFilterCount(state) > 0 || !!state.q;

  /* ITEMLIST — dizinin ne listelediğini söyler; firma adları herkese açık
     (ilan sahibinin tersine, profil opt-in bir vitrindir). */
  const listLd = graph([
    itemListNode({
      name: MARKETPLACE_LABELS.companies,
      path: base,
      totalItems: result.total,
      startPosition: (result.page - 1) * result.pageSize + 1,
      items: result.items
        .filter((c) => !!c.slug)
        .map((c) => ({ name: c.name, path: `/firma/${c.slug}` })),
    }),
  ]);

  return (
    <PublicLayout className={MARKET_GROUND}>
      <JsonLd data={listLd} />
      <CompanyFilterShell total={result.total} drawer={<CompanyFilters facets={facets} idPrefix="m" />}>
        <PublicListPage
          tabs={
            <PublicSearchTabs
              active="companies"
              q={state.q}
              counts={{ ...otherCounts, companies: result.total }}
            />
          }
          title={MARKETPLACE_LABELS.companies}
          lead="Rothern'deki alıcı ve tedarikçi firmalar. Faaliyet tipi, şehir ve kategoriye göre süzün; profil ve ürünleri inceleyin. İletişim için ücretsiz hesap."
          search={{
            action: base,
            defaultValue: state.q,
            placeholder: "Firma adı, sektör veya hizmet",
            hidden: {
              sehir: state.cities.join(",") || undefined,
              faaliyet: state.activities.join(",") || undefined,
              kategori: state.categories.join(",") || undefined,
              dogrulanmis: state.verified ? "1" : undefined,
              urunlu: state.hasProducts ? "1" : undefined,
              gold: state.gold ? "1" : undefined,
              sirala: state.sort,
            },
          }}
          chips={[]}
          clearHref={base}
          chipsNode={<CompanyActiveChips facets={facets} />}
          sidebar={<CompanyFilters facets={facets} idPrefix="d" />}
          summary={
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <MobileFilterButton />
                <ResultCount noun="firma" />
              </span>
              <CompanySortBar />
            </span>
          }
        >
          <FilterResults>
            {result.items.length === 0 ? (
              <PublicEmptyState
                noun={hasFilter ? "Bu kriterlerle firma" : "Firma"}
                clearHref={hasFilter ? base : undefined}
                extra={{ label: "Firmanı listele", href: signupHref("vitrin") }}
              />
            ) : (
              /* DİZİN = değerlendirme ekranı → GENİŞ satır (spec §8.3).
                 Üç sütunlu ızgarada Hakkında ve ürün şeridi sıkışıyordu;
                 "bu firma ne satıyor" sorusu kartın en zayıf yeriydi.
                 Izgara kartı (`tile`) anasayfa şeridinde ve panelde sürüyor. */
              <div className="flex flex-col gap-3">
                {result.items.map((c) => (
                  <CompanyCard
                    key={c.slug}
                    company={c}
                    variant="wide"
                    cta={{ label: "Bilgi iste", href: signupHref("teklif", `/firma/${c.slug}`) }}
                  />
                ))}
              </div>
            )}
          </FilterResults>
          <Pagination
            page={result.page}
            total={result.total}
            pageSize={result.pageSize}
            className="mt-10 border-t border-zinc-950/5 pt-6"
            hrefBuilder={(p) => `${base}${buildCompanyFilterQuery({ ...state, page: p })}`}
          />
        </PublicListPage>
      </CompanyFilterShell>
    </PublicLayout>
  );
}
