import { FacetGroup } from "./facets";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";
import { PublicEmptyState } from "./public-empty-state";
import { PublicListPage, ResultGrid } from "./public-list-page";
import { MARKETPLACE_ROUTES, categoryPath } from "@/lib/public/marketplace";
import {
  fetchProductFacets,
  fetchProducts,
  type ProductListParams,
} from "@/lib/public/marketplace-api";
import { companyActivityLabel, isCompanyActivity } from "@rothern/shared";
import Link from "next/link";

/**
 * ÜRÜN DİZİNİ — firmalar arası vitrin.
 *
 * `ListingIndex` ile aynı iskelet (`PublicListPage`) ama üç yerde bilinçli
 * olarak ayrılır:
 *  · kart FİRMA ADINI gösterir (ilan anonim, ürün vitrin),
 *  · "durum" süzgeci yok — ürün açılıp kapanmaz; yerine FAALİYET TİPİ var
 *    (üretici / bayi / hizmet…),
 *  · kategori süzgeci SORGU değil YOL üretir (`/urunler/kategori/<kod>-<ad>`):
 *    o sayfalar statik üretilebiliyor ve tek tek indekslenebiliyor.
 */

export interface ProductSearchParams {
  q?: string;
  il?: string;
  sayfa?: string;
  /** Nitelik süzgeci — `anahtar:değer`, tekrarlanabilir. */
  nitelik?: string | string[];
  /** Satıcının faaliyet tipi kodu. */
  faaliyet?: string;
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
    ...(sp.faaliyet && isCompanyActivity(sp.faaliyet) ? { activity: sp.faaliyet } : {}),
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
  const activeActivity = params.activity;
  const activeAttrs = params.attr ?? [];
  const hasFilter = !!(params.q || activeCity || activeActivity || activeAttrs.length);

  /**
   * Sorgu süzgeçleri (arama + şehir + faaliyet + nitelik) korunur; kategori
   * YOLDA. `attrs` verilmezse mevcut nitelik seçimleri aynen taşınır: sektör
   * değiştiren ya da sayfa çeviren ziyaretçi seçtiği nitelikleri kaybetmemeli.
   */
  const withQuery = (
    path: string,
    patch: { q?: string; il?: string; faaliyet?: string } = {},
    attrs: string[] = activeAttrs,
  ) => {
    const next: Record<string, string | undefined> = {
      q: searchParams.q,
      il: searchParams.il,
      faaliyet: activeActivity,
      ...patch,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    for (const a of attrs) sp.append("nitelik", a);
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
  };
  const filterHref = (patch: { q?: string; il?: string; faaliyet?: string } = {}) =>
    withQuery(basePath, patch);
  /** Bir nitelik değerini açar/kapatır (aynı bağlantı iki yönlü çalışır). */
  const attrHref = (key: string, value: string) => {
    const entry = `${key}:${value}`;
    const next = activeAttrs.includes(entry)
      ? activeAttrs.filter((a) => a !== entry)
      : [...activeAttrs, entry];
    return withQuery(basePath, {}, next);
  };

  const chips = [
    ...(params.q ? [{ key: "q", label: `"${params.q}"`, href: filterHref({ q: undefined }) }] : []),
    ...(activeCity ? [{ key: "il", label: activeCity, href: filterHref({ il: undefined }) }] : []),
    ...(activeActivity
      ? [{ key: "faaliyet", label: companyActivityLabel(activeActivity), href: filterHref({ faaliyet: undefined }) }]
      : []),
    // Etiket olarak DEĞER gösterilir: "Paslanmaz çelik" tek başına okunur,
    // "malzeme:Paslanmaz çelik" makine dili gibi durur.
    ...activeAttrs.map((a) => ({
      key: a,
      label: a.slice(a.indexOf(":") + 1),
      href: withQuery(basePath, {}, activeAttrs.filter((x) => x !== a)),
    })),
  ];

  return (
    <PublicListPage
      title={title}
      lead={lead}
      breadcrumb={
        category ? (
          <nav aria-label="Konum" className="mb-3 text-sm text-zinc-500">
            <Link href={MARKETPLACE_ROUTES.products} className="hover:text-zinc-900">
              Ürünler
            </Link>
            <span aria-hidden className="mx-2">/</span>
            <span className="text-zinc-900">{category.name}</span>
          </nav>
        ) : undefined
      }
      search={{
        action: basePath,
        defaultValue: searchParams.q,
        hidden: { il: searchParams.il, faaliyet: activeActivity },
        hiddenList: { nitelik: activeAttrs },
        placeholder: "Ürün, marka veya parça numarası arayın",
      }}
      chips={chips}
      clearHref={category ? MARKETPLACE_ROUTES.products : basePath}
      summary={page.total > 0 ? `${page.total.toLocaleString("tr-TR")} ürün` : undefined}
      sidebar={
        <>
          <FacetGroup
            heading="Kategori"
            items={facets.categories.slice(0, 12).map((c) => ({
              key: c.id,
              label: c.name,
              count: c.count,
              // Kategori bağlantısı YOL üretir — o sayfa statik ve
              // indekslenebilir; sorgu parametresi ikisini de veremezdi.
              // Arama/şehir süzgeci KORUNUR: sektör değiştirmek aramayı
              // sıfırlarsa ziyaretçi her seferinde baştan yazar.
              href: category?.id === c.id
                ? withQuery(MARKETPLACE_ROUTES.products)
                : withQuery(categoryPath(c.id, c.name)),
              active: category?.id === c.id,
            }))}
          />
          <FacetGroup
            heading="Şehir"
            items={facets.cities.slice(0, 12).map((c) => ({
              key: c.city,
              label: c.city,
              count: c.count,
              href: filterHref({ il: activeCity === c.city ? undefined : c.city }),
              active: activeCity === c.city,
            }))}
          />
          <FacetGroup
            heading="Faaliyet tipi"
            items={facets.activities.map((a) => ({
              key: a.activity,
              label: companyActivityLabel(a.activity),
              count: a.count,
              href: filterHref({ faaliyet: activeActivity === a.activity ? undefined : a.activity }),
              active: activeActivity === a.activity,
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
        </>
      }
    >
      {page.items.length === 0 ? (
        <PublicEmptyState
          noun="Ürün"
          clearHref={hasFilter || category ? MARKETPLACE_ROUTES.products : undefined}
        />
      ) : (
        <ResultGrid count={page.items.length}>
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
        </ResultGrid>
      )}
      {/* Sayfalama nitelik seçimlerini de taşır: 2. sayfaya geçen
          ziyaretçi süzgeçlerini kaybetmemeli. */}
      <Pagination
        page={page.page}
        total={page.total}
        pageSize={page.pageSize}
        basePath={basePath}
        params={{ q: searchParams.q, il: searchParams.il, faaliyet: activeActivity }}
        repeated={{ nitelik: activeAttrs }}
      />
    </PublicListPage>
  );
}
