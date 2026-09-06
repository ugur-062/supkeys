import { FilterResults, FilterShell, MobileFilterButton, ResultCount } from "./filter-shell";
import { Pagination } from "@/components/ui/pagination";
import { ProductCard } from "./product-card";
import { ActiveFilterChips, ProductFilters, SortControl } from "./product-filters";
import { PublicEmptyState } from "./public-empty-state";
import { PublicListPage, ResultGrid } from "./public-list-page";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { fetchProductFacets, fetchProducts } from "@/lib/public/marketplace-api";
import {
  buildProductFilterQuery,
  parseProductFilters,
  toProductListParams,
  type SearchParamsLike,
} from "@/lib/public/product-filter-params";
import { signupHref } from "@/lib/public/visibility";
import Link from "next/link";

/**
 * ÜRÜN DİZİNİ — süzgeç v3 (2026-09-04).
 *
 * Sunucu bileşeni veriyi çeker; süzgeçler İSTEMCİ (`ProductFilters`,
 * checkbox, çoklu seçim) ve durumu URL sorgusunda tutar (`filter-shell.tsx`:
 * router.replace + transition, tam sayfa yenileme yok). Kategori yol sayfası
 * (`/urunler/kategori/<kod>-<ad>`) SEO girişi; etkileşim sorgu şemasına geçer.
 * URL şeması tek kaynak: `lib/public/product-filter-params.ts`.
 */
export type ProductSearchParams = SearchParamsLike;

interface Props {
  title: string;
  lead: string;
  searchParams: SearchParamsLike;
  /** Kategori yol sayfasında sabit kod. */
  category?: { id: string; name: string };
  /** Kategori sayfası: segment fotoğrafı (başlık yanında). */
  image?: string | null;
}

export async function ProductIndex({ title, lead, searchParams, category, image }: Props) {
  const state = parseProductFilters(searchParams, category?.id);
  const params = toProductListParams(state);
  const basePath = MARKETPLACE_ROUTES.products;

  const [page, facets] = await Promise.all([
    fetchProducts(params),
    fetchProductFacets({ category: params.category, q: params.q, city: params.city, activity: params.activity, verified: params.verified, price: params.price }),
  ]);
  const hasFilter = buildProductFilterQuery({ ...state, q: undefined, sort: undefined, page: 1 }) !== "";
  const talepHref = signupHref("talep", state.q ? `/company/satinalma/taleplerim/yeni?q=${encodeURIComponent(state.q)}` : undefined);

  return (
    <FilterShell basePath={basePath} fixedCategory={category?.id} total={page.total} drawer={<ProductFilters facets={facets} idPrefix="m" />}>
      <PublicListPage
        title={title}
        lead={lead}
        image={image}
        breadcrumb={
          category ? (
            <nav aria-label="Konum" className="mb-3 text-sm text-zinc-500">
              <Link href={basePath} className="hover:text-zinc-900">Ürünler</Link>
              <span aria-hidden className="mx-2">/</span>
              <span className="text-zinc-900">{category.name}</span>
            </nav>
          ) : undefined
        }
        search={{
          action: basePath,
          defaultValue: state.q,
          hidden: {
            kategori: state.category, sehir: state.cities.join(",") || undefined, faaliyet: state.activities.join(",") || undefined,
            dogrulanmis: state.verified ? "1" : undefined, fiyat: state.price, sirala: state.sort,
          },
          hiddenList: { nitelik: state.attrs },
          placeholder: "Ürün, marka veya parça numarası arayın",
        }}
        chips={[]}
        clearHref={basePath}
        chipsNode={<ActiveFilterChips facets={facets} />}
        sidebar={<ProductFilters facets={facets} idPrefix="d" />}
        summary={
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount noun="ürün" />
            </span>
            <SortControl />
          </span>
        }
      >
        <FilterResults>
          {page.items.length === 0 ? (
            <PublicEmptyState
              noun="Bu kriterlerle ürün"
              clearHref={hasFilter || category ? basePath : undefined}
              extra={{ label: "Talep aç — tedarikçiler teklif versin", href: talepHref }}
            />
          ) : (
            <ResultGrid count={page.items.length} heading="Ürün sonuçları">
              {page.items.map((p, i) => (
                <ProductCard
                  key={`${p.company.slug}/${p.slug}`}
                  companySlug={p.company.slug}
                  company={p.company}
                  product={p}
                  cta="Bilgi iste"
                  priority={i < 3}
                />
              ))}
            </ResultGrid>
          )}
        </FilterResults>
        <Pagination
          page={page.page}
          total={page.total}
          pageSize={page.pageSize}
          className="mt-10 border-t border-zinc-950/5 pt-6"
          // Kategori yol sayfasında yol korunur, sorgu `kategori` taşımaz; 7 yuva,
          // gerçek bağlantılar (bot izler, rel=prev/next).
          hrefBuilder={(p) =>
            `${category ? `/urunler/kategori/${category.id}` : basePath}${buildProductFilterQuery({
              ...state,
              category: category ? undefined : state.category,
              page: p,
            })}`
          }
        />
        {/* Yüzen "Talep aç" — listeyi gezen alıcı için; hero'lu sayfa değil. */}
        <Link
          href={talepHref}
          className="fixed right-5 bottom-5 z-30 inline-flex items-center gap-1 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800"
        >
          Talep aç
        </Link>
      </PublicListPage>
    </FilterShell>
  );
}
