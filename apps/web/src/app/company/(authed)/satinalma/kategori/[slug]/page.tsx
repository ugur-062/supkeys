"use client";

import { PanelProductIndex } from "@/components/company/market/panel-product-index";
import { MarketBand, MarketTabs } from "@/components/company/market/market-band";
import { MarketSearch } from "@/components/company/market/market-search";
import { PANEL_MARKET, panelCategoryPath, parsePanelCategoryCode } from "@/lib/company/panel-market";
import { buildProductFilterQuery, parseProductFilters, type ProductFilterState } from "@/lib/public/product-filter-params";
import { categoryPhotoSrc, segmentPhotoSrc } from "@/lib/public/category-photos";
import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";

/**
 * KATEGORİ SAYFASI — her kategorinin kendi adresi ve kendi süzgeçleri.
 *
 * Eskiden kategori kartına tıklamak yalnız anasayfayı kaydırıyor ve URL
 * değişmiyordu: "Elektrik Sistemleri ürünleri" diye paylaşılabilir bir yer
 * yoktu, geri tuşu kategoriye dönmüyordu. Slug KOD ÖNDE
 * (`39000000-elektrik-sistemleri`) — herkese açık kategori sayfasıyla aynı
 * kural, aynı gerekçe (ayrıştırma tek regex'e iner).
 *
 * Alt kategori çipleri sunucudan gelen `subCategories` sayaçlarıyla çizilir
 * (seçili kodun BİR ALT seviyesi). Sayaç yoksa çip de yok — hiçbir şeyi
 * daraltmayan bir bağlantı gösterilmez.
 */
export default function PanelCategoryPage() {
  const params = useParams<{ slug: string }>();
  const code = parsePanelCategoryCode(params?.slug ?? "");
  if (!code) notFound();
  return <CategoryView code={code} />;
}

function CategoryView({ code }: { code: string }) {
  const sp = useSearchParams();
  const state = parseProductFilters(sp ?? new URLSearchParams(), code);
  const photo = categoryPhotoSrc(code) ?? segmentPhotoSrc([code]);

  return (
    <PanelProductIndex
      fixedCategory={code}
      band={({ total, facets }) => {
        // Ad ve alt dallar listenin KENDİ facet yanıtından okunur — ayrı bir
        // istek atmak aynı veriyi iki kez indirmek olurdu.
        // AD GELENE DEK YER TUTUCU (2026-09-07): eskiden başlık "Kategori",
        // açıklama "Kategori kategorisindeki tedarikçi ürünleri" ve sekme
        // "Ürünler 0" basılıp sonra doluyordu — her açılışta yanlış metin
        // görünüyordu. Slug'daki addan geri üretmek de yanlış: küçük harfe
        // ve aksansıza indirgenmiş hâli ("tibbi-ekipman") gerçek adı vermez.
        const name = facets?.categories.find((c) => c.id === code)?.name;
        const subs = facets?.subCategories ?? [];
        return (
        <MarketBand
          breadcrumb={[
            { label: "Satınalma", href: PANEL_MARKET.home },
            { label: "Ürünler", href: PANEL_MARKET.products },
            ...(name ? [{ label: name }] : []),
          ]}
          title={
            name ?? <span aria-hidden className="inline-block h-7 w-64 animate-pulse rounded bg-white/10 align-middle" />
          }
          lead={
            name
              ? `${name} kategorisindeki tedarikçi ürünleri. Alt dalları seçerek daraltın ya da kenar süzgeçlerini kullanın.`
              : undefined
          }
          search={<MarketSearch<ProductFilterState> placeholder={name ? `${name} içinde ara` : "Bu kategoride ara"} />}
          aside={
            photo ? (
              <div className="relative hidden aspect-[3/2] overflow-hidden rounded-xl ring-1 ring-white/10 lg:block">
                <Image src={photo} alt="" fill sizes="16rem" className="object-cover" />
              </div>
            ) : undefined
          }
          tabs={
            <div className="space-y-4">
              <MarketTabs
                active="products"
                productsHref={`${PANEL_MARKET.products}${buildProductFilterQuery(state)}`}
                companiesHref={`${PANEL_MARKET.companies}?kategori=${code}${state.q ? `&q=${encodeURIComponent(state.q)}` : ""}`}
                productCount={facets ? total : undefined}
              />
              {subs.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {subs.slice(0, 14).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={panelCategoryPath(c.id, c.name)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-zinc-200 transition hover:bg-white/20 hover:text-white"
                      >
                        <span className="max-w-[16rem] truncate">{c.name}</span>
                        <span className="tnum text-xs text-zinc-400">{c.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          }
        />
        );
      }}
    />
  );
}
