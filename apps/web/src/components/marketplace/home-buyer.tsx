"use client";

import { useTranslations } from "next-intl";

/* `"use client"` ŞART: `toShowcaseRows` panelin client dosyasından geliyor
   (`category-showcase-rows.tsx`) ve sunucudan ÇAĞRILAMAZ. Panel dosyasına
   dokunmamak için (kullanıcı sınırı) satır hesabı istemciye alındı. Kayıp
   yok: veri sunucudan prop olarak geliyor, bileşen SSR'da basılıyor —
   ürün adları ve kategoriler HTML'de duruyor, indekslenir. */
import { CategoryShowcaseRows, toShowcaseRows } from "@/components/dashboard/category-showcase-rows";
import { ProductStrip } from "./product-strip";
import type { ProductIndexCard } from "@/lib/public/marketplace-api";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { MARKETPLACE_ROUTES, categoryHref } from "@/lib/public/marketplace";

/**
 * ANASAYFANIN ALICI YÜZÜ — satınalma panosunun herkese açık hâli
 * (2026-09-08, kullanıcı kararı).
 *
 * Sıra (2026-09-22, kullanıcı kararı "öne çıkan ürünler kalksın,
 * kategoriler gelsin direkt"):
 *   1 hero (sayfa düzeyinde)  2 kategori vitrini  3 yeni eklenen ürünler
 *
 * Panelin "Size uygun ürünler" şeridi burada YOK: giriş yapmış firmanın beyan
 * ettiği kategorilere dayanır, ziyaretçinin profili yok. Anonim karşılığı
 * olan "Öne çıkan ürünler" şeridi de 2026-09-22'de kaldırıldı.
 *
 * Panelin son arama geçmişine dayanan varyantı da BURADA YOK: geçmiş
 * `localStorage`ta, sayfa ise ISR ile statik — koşulu render'a taşımak
 * hidrasyon uyuşmazlığı olurdu (2026-09-05 #418 dersi).
 *
 * FİRMA LİSTESİ YOK (2026-09-21, kullanıcı kararı): hero "Firma" pili ve
 * altındaki firma bölümü kaldırıldı; ziyaretçi anasayfadan firma aramaz.
 * KATEGORİ VİTRİNİ FOTOĞRAFSIZ (aynı gün, kullanıcı: "kategorilerde fotoğraf
 * olmasın, çizgisel ikonlar"): `visual="icon"` — segment ikonu
 * (`category-visual.ts`), panel vitrini fotoğraflı kalır.
 */
export function HomeBuyer({
  newest,
  showcase,
}: {
  newest: ProductIndexCard[];
  showcase: ShowcaseCategory[];
}) {
  // 6 blok × (1 promo + 10 kategori); artan segmentler son ızgaraya eklenir.
  const rows = toShowcaseRows(showcase, 6);
  const t = useTranslations("web.marketing.home");

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 pb-14 sm:px-6 lg:px-8">
      {/* "ÖNE ÇIKAN ÜRÜNLER" ŞERİDİ KALKTI (2026-09-22, kullanıcı: "ilk kısımdaki
          öne çıkan ürünler kısmını kaldır, kategoriler gelsin direkt") — hero'nun
          hemen altı kategori vitrini; "Yeni eklenen ürünler" onun altında. */}
      <div className="space-y-10">
      {/* ÇAPA: footer'daki "Kategoriler" bağlantısı `/#kategoriler`e gidiyor
          ama sayfada o id HİÇ YOKTU — tıklayan kullanıcı anasayfanın başına
          düşüyordu (canlı bulgu 2026-09-09). Sarmalayıcı `CategoryShowcaseRows`
          panel bileşenine dokunmadan çapayı veriyor; `scroll-mt` sabit
          header'ın altına gizlenmesin diye. */}
      <div id="kategoriler" className="scroll-mt-24">
      <CategoryShowcaseRows
        rows={rows}
        /* Ürünü OLMAYAN segment kategori sayfasında 404 verir (o sayfa boş
           kategoriyi bilerek üretmiyor). O dalın kartı süzülmüş dizine gider:
           dürüst boş liste, kırık bağlantı değil. */
        hrefFor={(c) =>
          c.count > 0 ? categoryHref(c) : `${MARKETPLACE_ROUTES.products}?kategori=${c.id}`
        }
        ctaLabel={t("categoriesCta")}
        visual="icon"
      />
      </div>

      <ProductStrip
        id="yeni-eklenen-urunler"
        title={t("newestTitle")}
        lead={t("newestLead")}
        href={`${MARKETPLACE_ROUTES.products}?sirala=yeni`}
        items={newest}
        accent="blue"
        /* Şeritte HEPSİ yeni; rozet her kartta çıkıp hiçbir şeyi ayırt etmez. */
        showNew={false}
      />
      </div>
    </div>
  );
}
