import { EmptyListings, ListingCard } from "./listing-card";
import { FacetGroup, FilterChip } from "./facets";
import { Pagination } from "./pagination";
import { SearchForm } from "./search-form";
import { Heading } from "@/components/catalyst/heading";
import {
  MARKETPLACE_ROUTES,
  type PublicListingType,
} from "@/lib/public/marketplace";
import {
  fetchFacets,
  fetchListings,
  type ListParams,
} from "@/lib/public/marketplace-api";
import Link from "next/link";

/**
 * TÜRKÇE URL ↔ İNGİLİZCE API sınırı.
 *
 * Ziyaretçinin gördüğü adres Türkçe (`?kategori=31000000&il=İstanbul&sayfa=2`),
 * API sözleşmesi İngilizce. Çeviri TEK yerde, burada; sayfalar ham
 * `searchParams` görmez. Bilinmeyen parametre sessizce düşer — ziyaretçinin
 * uydurduğu bir anahtar sorguya sızmasın.
 */
export interface MarketplaceSearchParams {
  q?: string;
  kategori?: string;
  il?: string;
  sayfa?: string;
  durum?: string;
}

export function toListParams(
  sp: MarketplaceSearchParams,
  type: PublicListingType,
): ListParams {
  const page = Number(sp.sayfa);
  return {
    type,
    q: sp.q?.trim() || undefined,
    category: /^\d{8}$/.test(sp.kategori ?? "") ? sp.kategori : undefined,
    city: sp.il?.trim() || undefined,
    state: sp.durum === "hepsi" ? "all" : undefined,
    page: Number.isFinite(page) && page > 1 ? Math.trunc(page) : undefined,
  };
}

interface Props {
  type: PublicListingType;
  title: string;
  lead: string;
  searchParams: MarketplaceSearchParams;
}

export async function ListingIndex({ type, title, lead, searchParams }: Props) {
  const params = toListParams(searchParams, type);
  const basePath =
    type === "ALIM" ? MARKETPLACE_ROUTES.demands : MARKETPLACE_ROUTES.offers;

  const [page, facets] = await Promise.all([
    fetchListings(params),
    fetchFacets(),
  ]);

  const activeCategory = params.category;
  const activeCity = params.city;
  const hasFilter = !!(params.q || activeCategory || activeCity);
  const showFacets =
    page.items.length > 0 ||
    hasFilter ||
    facets.categories.length + facets.cities.length >= 4;

  /** Süzgeç bağlantısı — mevcut süzgeçleri korur, sayfayı 1'e döndürür. */
  const filterHref = (patch: Partial<MarketplaceSearchParams>) => {
    const next: Record<string, string | undefined> = {
      q: searchParams.q,
      kategori: searchParams.kategori,
      il: searchParams.il,
      durum: searchParams.durum,
      ...patch,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <>
      {/* Application UI — Headings / Page headings. Açık zemin, ince alt
          çizgi; koyu banttan döndük (ürün kararı). Ayrım rengi değil YÜZEYİ
          değiştiriyor: beyaz başlık + gri gövde. */}
      <header className="border-b border-zinc-950/5 bg-white pt-28 pb-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Heading
            level={1}
            className="text-3xl font-semibold tracking-tight !text-zinc-950 sm:text-4xl"
          >
            {title}
          </Heading>
          <p className="mt-3 max-w-2xl text-base/7 text-zinc-500">{lead}</p>
          <div className="mt-7 max-w-3xl">
            <SearchForm
              action={basePath}
              defaultValue={searchParams.q}
              hidden={{ kategori: searchParams.kategori, il: searchParams.il }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 pt-8 pb-24 lg:px-8">
      {hasFilter ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Süzgeçler:</span>
          {params.q ? (
            <FilterChip href={filterHref({ q: undefined })} label={`"${params.q}"`} />
          ) : null}
          {activeCategory ? (
            <FilterChip
              href={filterHref({ kategori: undefined })}
              label={
                facets.categories.find((c) => c.id === activeCategory)?.name ??
                activeCategory
              }
            />
          ) : null}
          {activeCity ? (
            <FilterChip href={filterHref({ il: undefined })} label={activeCity} />
          ) : null}
          <Link
            href={basePath}
            className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
          >
            Tümünü temizle
          </Link>
        </div>
      ) : null}

      {/* Sonuç da süzgeç de yokken kenar çubuğu BASILMAZ: tek bir sektör
          satırı taşıyan boş bir sütun, sayfayı doldurmaz — yarım kalmış
          gösterir. O durumda boş-durum bandı tam genişlik alır. */}
      <div
        className={`mt-8 grid grid-cols-1 gap-10 ${
          showFacets ? "lg:grid-cols-[16rem_1fr]" : ""
        }`}
      >
        {showFacets ? (
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <FacetGroup
            heading="Sektör"
            items={facets.categories.slice(0, 12).map((c) => ({
              key: c.id,
              label: c.name,
              count: c.count,
              href: filterHref({ kategori: c.id }),
              active: activeCategory === c.id,
            }))}
          />
          <FacetGroup
            heading="Şehir"
            items={facets.cities.slice(0, 12).map((c) => ({
              key: c.city,
              label: c.city,
              count: c.count,
              href: filterHref({ il: c.city }),
              active: activeCity === c.city,
            }))}
          />
        </aside>
        ) : null}

        <div>
          {page.total > 0 ? (
            <p className="mb-4 text-sm text-zinc-500">
              {page.total.toLocaleString("tr-TR")} kayıt
            </p>
          ) : null}
          {page.items.length === 0 ? (
            <EmptyListings
              title={
                hasFilter
                  ? "Bu süzgeçlerle eşleşen kayıt yok."
                  : "Şu an burada yayımlanmış kayıt yok."
              }
              hint={
                hasFilter
                  ? "Süzgeçleri gevşetip yeniden deneyin."
                  : "Yeni kayıtlar yayımlandıkça burada görünür."
              }
              action={
                hasFilter
                  ? { label: "Süzgeçleri temizle", href: basePath }
                  : {
                      label:
                        type === "ALIM"
                          ? "Satılık ilanlara bak"
                          : "Alım taleplerine bak",
                      href:
                        type === "ALIM"
                          ? MARKETPLACE_ROUTES.offers
                          : MARKETPLACE_ROUTES.demands,
                    }
              }
            />
          ) : (
            /* Sütun sayısı içerik sayısıyla sınırlı: tek kayıt üçte birlik
               şeridin solunda öksüz kalmasın (anasayfadaki SectionGrid ile
               aynı kural). */
            <div
              className={`grid grid-cols-1 gap-5 ${
                page.items.length >= 3
                  ? "sm:grid-cols-2 xl:grid-cols-3"
                  : page.items.length === 2
                    ? "sm:grid-cols-2"
                    : "sm:max-w-sm"
              }`}
            >
              {page.items.map((l) => (
                <ListingCard key={l.number} listing={l} />
              ))}
            </div>
          )}
          <Pagination
            page={page.page}
            total={page.total}
            pageSize={page.pageSize}
            basePath={basePath}
            params={{
              q: searchParams.q,
              kategori: searchParams.kategori,
              il: searchParams.il,
              durum: searchParams.durum,
            }}
          />
        </div>
      </div>
      </div>
    </>
  );
}
