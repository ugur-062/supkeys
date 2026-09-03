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
  /** Nitelik süzgeci — `anahtar:değer`, tekrarlanabilir. */
  nitelik?: string | string[];
}

/** Tekrarlanan parametre tek dize de gelebilir — her zaman diziye indirge. */
function attrList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter((a) => a.includes(":")).slice(0, 6);
}

/** Türkçe URL → İngilizce API sınırı (ilan tarafıyla aynı kural). */
export function toProductParams(
  sp: ProductSearchParams,
  fixedCategory?: string,
): ProductListParams {
  const page = Number(sp.sayfa);
  const attr = attrList(sp.nitelik);
  return {
    q: sp.q?.trim() || undefined,
    category: /^\d{8}$/.test(fixedCategory ?? "") ? fixedCategory : undefined,
    city: sp.il?.trim() || undefined,
    ...(attr.length ? { attr } : {}),
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
    // Nitelik sayaçları kategoriye özgü — kategorisiz sayfada boş döner.
    fetchProductFacets(category?.id),
  ]);

  const activeCity = params.city;
  const activeAttrs = params.attr ?? [];
  const hasFilter = !!(params.q || activeCity || activeAttrs.length);
  const showFacets =
    page.items.length > 0 ||
    hasFilter ||
    facets.categories.length + facets.cities.length >= 4;

  /**
   * Sorgu süzgeçleri (arama + şehir + nitelik) korunur; kategori YOLDA.
   *
   * `attrs` verilmezse mevcut nitelik seçimleri aynen taşınır: sektör
   * değiştiren ya da sayfa çeviren ziyaretçi seçtiği nitelikleri kaybetmemeli.
   */
  const withQuery = (
    path: string,
    patch: { q?: string; il?: string } = {},
    attrs: string[] = activeAttrs,
  ) => {
    const next: Record<string, string | undefined> = {
      q: searchParams.q,
      il: searchParams.il,
      ...patch,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    for (const a of attrs) sp.append("nitelik", a);
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
  };
  const filterHref = (patch: { q?: string; il?: string } = {}) =>
    withQuery(basePath, patch);
  /** Bir nitelik değerini açar/kapatır (aynı bağlantı iki yönlü çalışır). */
  const attrHref = (key: string, value: string) => {
    const entry = `${key}:${value}`;
    const next = activeAttrs.includes(entry)
      ? activeAttrs.filter((a) => a !== entry)
      : [...activeAttrs, entry];
    return withQuery(basePath, {}, next);
  };

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
              hiddenList={{ nitelik: activeAttrs }}
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
            {activeAttrs.map((a) => {
              // Etiket olarak DEĞER gösterilir: "Paslanmaz çelik" tek başına
              // okunur, "malzeme:Paslanmaz çelik" makine dili gibi durur.
              const value = a.slice(a.indexOf(":") + 1);
              return (
                <FilterChip
                  key={a}
                  href={withQuery(
                    basePath,
                    {},
                    activeAttrs.filter((x) => x !== a),
                  )}
                  label={value}
                />
              );
            })}
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

              {/* Nitelik süzgeçleri yalnız kategori sayfasında dolu gelir —
                  nitelikler kategoriye özgü; kategorisiz listede her ürün
                  başka bir alan kümesi taşır ve süzgeç anlamsızlaşır. */}
              {facets.attributes.map((a) => (
                <FacetGroup
                  key={a.key}
                  heading={a.unit ? `${a.nameTr} (${a.unit})` : a.nameTr}
                  items={a.values.map((v) => ({
                    key: `${a.key}:${v.value}`,
                    label: v.value,
                    count: v.count,
                    href: attrHref(a.key, v.value),
                    active: activeAttrs.includes(`${a.key}:${v.value}`),
                  }))}
                />
              ))}
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
                    priceGated
                  />
                ))}
              </div>
            )}
            {/* Sayfalama nitelik seçimlerini de taşır: 2. sayfaya geçen
                ziyaretçi süzgeçlerini kaybetmemeli. */}
            <Pagination
              page={page.page}
              total={page.total}
              pageSize={page.pageSize}
              basePath={basePath}
              params={{ q: searchParams.q, il: searchParams.il }}
              repeated={{ nitelik: activeAttrs }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
