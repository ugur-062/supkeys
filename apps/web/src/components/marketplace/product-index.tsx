import { EmptyListings } from "./listing-card";
import { FacetGroup, FilterChip } from "./facets";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";
import { SearchForm } from "./search-form";
import { Heading } from "@/components/catalyst/heading";
import { MARKETPLACE_ROUTES, categoryPath } from "@/lib/public/marketplace";
import {
  fetchProductFacets,
  fetchProducts,
  type ProductListParams,
} from "@/lib/public/marketplace-api";
import Link from "next/link";

/**
 * ÜRÜN DİZİNİ — firmalar arası vitrin.
 *
 * `ListingIndex`in ikizi ama üç yerde bilinçli olarak ayrılır:
 *  · kart FİRMA ADINI gösterir (ilan anonim, ürün vitrin),
 *  · "durum" süzgeci yok — ürün açılıp kapanmaz,
 *  · kategori süzgeci SORGU değil YOL üretir (`/urunler/kategori/<kod>-<ad>`):
 *    o sayfalar statik üretilebiliyor ve tek tek indekslenebiliyor.
 */

export interface ProductSearchParams {
  q?: string;
  il?: string;
  sayfa?: string;
}

/** Türkçe URL → İngilizce API sınırı (ilan tarafıyla aynı kural). */
export function toProductParams(
  sp: ProductSearchParams,
  fixedCategory?: string,
): ProductListParams {
  const page = Number(sp.sayfa);
  return {
    q: sp.q?.trim() || undefined,
    category: /^\d{8}$/.test(fixedCategory ?? "") ? fixedCategory : undefined,
    city: sp.il?.trim() || undefined,
    page: Number.isFinite(page) && page > 1 ? Math.trunc(page) : undefined,
  };
}

interface Props {
  title: string;
  lead: string;
  searchParams: ProductSearchParams;
  /** Kategori sayfasında sabit kod — süzgeç yoldan gelir, sorgudan değil. */
  category?: { id: string; name: string };
}

export async function ProductIndex({
  title,
  lead,
  searchParams,
  category,
}: Props) {
  const params = toProductParams(searchParams, category?.id);
  const basePath = category
    ? categoryPath(category.id, category.name)
    : MARKETPLACE_ROUTES.products;

  const [page, facets] = await Promise.all([
    fetchProducts(params),
    fetchProductFacets(),
  ]);

  const activeCity = params.city;
  const hasFilter = !!(params.q || activeCity);
  const showFacets =
    page.items.length > 0 ||
    hasFilter ||
    facets.categories.length + facets.cities.length >= 4;

  /** Sorgu süzgeçleri (arama + şehir) korunur; kategori YOLDA. */
  const withQuery = (path: string, patch: Partial<ProductSearchParams> = {}) => {
    const next: Record<string, string | undefined> = {
      q: searchParams.q,
      il: searchParams.il,
      ...patch,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
  };
  const filterHref = (patch: Partial<ProductSearchParams> = {}) =>
    withQuery(basePath, patch);

  return (
    <>
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
              hidden={{ il: searchParams.il }}
              placeholder="Ürün, marka veya parça numarası arayın"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 pt-8 pb-24 lg:px-8">
        {category ? (
          <nav aria-label="Konum" className="text-sm text-zinc-500">
            <Link
              href={MARKETPLACE_ROUTES.products}
              className="hover:text-zinc-900"
            >
              Ürünler
            </Link>
            <span aria-hidden className="mx-2">
              /
            </span>
            <span className="text-zinc-900">{category.name}</span>
          </nav>
        ) : null}

        {hasFilter ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-500">Süzgeçler:</span>
            {params.q ? (
              <FilterChip
                href={filterHref({ q: undefined })}
                label={`"${params.q}"`}
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
                  // Kategori bağlantısı YOL üretir — o sayfa statik ve
                  // indekslenebilir; sorgu parametresi ikisini de veremezdi.
                  // Arama/şehir süzgeci KORUNUR: sektör değiştirmek aramayı
                  // sıfırlarsa ziyaretçi her seferinde baştan yazar.
                  href: withQuery(categoryPath(c.id, c.name)),
                  active: category?.id === c.id,
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
                {page.total.toLocaleString("tr-TR")} ürün
              </p>
            ) : null}
            {page.items.length === 0 ? (
              <EmptyListings
                title={
                  hasFilter || category
                    ? "Bu süzgeçlerle eşleşen ürün yok."
                    : "Şu an yayımlanmış ürün yok."
                }
                hint={
                  hasFilter || category
                    ? "Süzgeçleri gevşetip yeniden deneyin."
                    : "Firmalar vitrinlerini doldurdukça ürünler burada görünür."
                }
                action={
                  hasFilter || category
                    ? { label: "Tüm ürünler", href: MARKETPLACE_ROUTES.products }
                    : { label: "Satılık ilanlara bak", href: MARKETPLACE_ROUTES.offers }
                }
              />
            ) : (
              <div
                className={`grid grid-cols-1 gap-5 ${
                  page.items.length >= 3
                    ? "sm:grid-cols-2 xl:grid-cols-3"
                    : page.items.length === 2
                      ? "sm:grid-cols-2"
                      : "sm:max-w-sm"
                }`}
              >
                {page.items.map((p) => (
                  <ProductCard
                    key={`${p.company.slug}/${p.slug}`}
                    companySlug={p.company.slug}
                    companyName={p.company.name}
                    companyCity={p.company.city}
                    product={p}
                  />
                ))}
              </div>
            )}
            <Pagination
              page={page.page}
              total={page.total}
              pageSize={page.pageSize}
              basePath={basePath}
              params={{ q: searchParams.q, il: searchParams.il }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
