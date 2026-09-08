"use client";

import { PanelProductIndex } from "@/components/company/market/panel-product-index";
import { MarketHeader, MarketTabs } from "@/components/company/market/market-band";
import { PANEL_MARKET, panelCategoryPath, parsePanelCategoryCode } from "@/lib/company/panel-market";
import { notFound, useParams } from "next/navigation";

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
  return (
    <PanelProductIndex
      fixedCategory={code}
      band={({ total, loaded, facets }) => {
        // KOYU BANT KALDIRILDI (2026-09-07, kullanıcı kararı): kategoriye
        // tıklayan kullanıcı zaten ne aradığını biliyor; başlık + açıklama +
        // arama + sekmeler + alt dal çipleri ürün ızgarasını ekranın altına
        // itiyordu. Kalan: kırıntı ve H1 — sayfanın başlıksız kalmaması ve
        // "neredeyim" sorusunun cevabı için (a11y'de h1 zorunlu).
        //
        // Alt dallar KAYBOLMADI: kenar süzgecindeki KATEGORİ grubu aynı
        // dalları sayaçlarıyla listeliyor, üstelik çoklu seçimle.
        // Ad, seçili kategori alanından (her seviye + ürünü olmayan dallar);
        // eski kenar önbelleği taşımıyorsa L1 listesine düşer.
        const name = facets?.selectedCategory?.name ?? facets?.categories.find((c) => c.id === code)?.name;
        return (
          <MarketHeader
            breadcrumb={[
              { label: "Satınalma", href: PANEL_MARKET.home },
              { label: "Ürünler", href: PANEL_MARKET.products },
              ...(name ? [{ label: name }] : []),
            ]}
            count={loaded ? `${total.toLocaleString("tr-TR")} ürün` : undefined}
            /* KATEGORİ SEÇİLİYKEN "Tedarikçiler" (kaynak kalıp): aynı
               kategorideki firmalara geçer — kategori adresle taşınır. */
            tabs={
              <MarketTabs
                active="products"
                productsHref={panelCategoryPath(code, name ?? "")}
                companiesHref={`${PANEL_MARKET.companies}?kategori=${code}`}
                productCount={loaded ? total : undefined}
              />
            }
            title={
              name ?? (
                <span aria-hidden className="inline-block h-7 w-64 animate-pulse rounded bg-zinc-100 align-middle" />
              )
            }
          />
        );
      }}
    />
  );
}
