"use client";

/* `"use client"` ŞART: `toShowcaseRows` panelin client dosyasından geliyor
   (`category-showcase-rows.tsx`) ve sunucudan ÇAĞRILAMAZ. Panel dosyasına
   dokunmamak için (kullanıcı sınırı) satır hesabı istemciye alındı. Kayıp
   yok: veri sunucudan prop olarak geliyor, bileşen SSR'da basılıyor —
   ürün adları ve kategoriler HTML'de duruyor, indekslenir. */
import { CategoryShowcaseRows, toShowcaseRows } from "@/components/dashboard/category-showcase-rows";
import { ProductStrip } from "./product-strip";
import type { ProductIndexCard } from "@/lib/public/marketplace-api";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { MARKETPLACE_ROUTES, categoryPath } from "@/lib/public/marketplace";

/**
 * ANASAYFANIN ALICI YÜZÜ — satınalma panosunun herkese açık hâli
 * (2026-09-08, kullanıcı kararı).
 *
 * Panelle AYNI sıra ve aynı bileşenler:
 *   1 hero (sayfa düzeyinde)  2 ürün şeridi  3 kategori vitrini
 *   4 ikinci ürün şeridi
 *
 * TEK SAPMA — birinci şeridin BAŞLIĞI. Panelde "Size uygun ürünler / alım
 * kategorilerinizle örtüşen" yazıyor; bu, giriş yapmış firmanın beyan ettiği
 * kategorilere dayanıyor. Ziyaretçinin profili YOK, dolayısıyla "size uygun"
 * anonimde ölçülmemiş bir iddia olurdu. Yerine ölçülebilir kesit:
 * "Öne çıkan ürünler" (doğrulanmış firma önce, firma başına en çok 2).
 *
 * Panelin son arama geçmişine dayanan varyantı da BURADA YOK: geçmiş
 * `localStorage`ta, sayfa ise ISR ile statik — koşulu render'a taşımak
 * hidrasyon uyuşmazlığı olurdu (2026-09-05 #418 dersi).
 */
export function HomeBuyer({
  featured,
  newest,
  showcase,
}: {
  featured: ProductIndexCard[];
  newest: ProductIndexCard[];
  showcase: ShowcaseCategory[];
}) {
  // 6 blok × (1 promo + 10 kategori); artan segmentler son ızgaraya eklenir.
  const rows = toShowcaseRows(showcase, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 pb-14 sm:px-6 lg:px-8">
      <ProductStrip
        id="one-cikan-urunler"
        title="Öne çıkan ürünler"
        lead="Doğrulanmış tedarikçilerin vitrinlerinden — fiyat ve minimum sipariş bilgisiyle."
        href={MARKETPLACE_ROUTES.products}
        items={featured}
        accent="blue"
      />

      <CategoryShowcaseRows
        rows={rows}
        /* Ürünü OLMAYAN segment kategori sayfasında 404 verir (o sayfa boş
           kategoriyi bilerek üretmiyor). O dalın kartı süzülmüş dizine gider:
           dürüst boş liste, kırık bağlantı değil. */
        hrefFor={(c) =>
          c.count > 0 ? categoryPath(c.id, c.name) : `${MARKETPLACE_ROUTES.products}?kategori=${c.id}`
        }
        countNoun="ürün"
        ctaLabel="Şimdi tedarikçi bulun"
      />

      <ProductStrip
        id="yeni-eklenen-urunler"
        title="Yeni eklenen ürünler"
        lead="Tedarikçilerin vitrinlerine en son eklediği ürünler."
        href={`${MARKETPLACE_ROUTES.products}?sirala=yeni`}
        items={newest}
        accent="blue"
        /* Şeritte HEPSİ yeni; rozet her kartta çıkıp hiçbir şeyi ayırt etmez. */
        showNew={false}
      />
    </div>
  );
}
