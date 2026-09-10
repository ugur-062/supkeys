"use client";

/* `"use client"` ŞART: `toShowcaseRows` panelin client dosyasından geliyor
   (`category-showcase-rows.tsx`) ve sunucudan ÇAĞRILAMAZ. Panel dosyasına
   dokunmamak için (kullanıcı sınırı) satır hesabı istemciye alındı. Kayıp
   yok: veri sunucudan prop olarak geliyor, bileşen SSR'da basılıyor —
   ürün adları ve kategoriler HTML'de duruyor, indekslenir. */
import { CategoryShowcaseRows, toShowcaseRows } from "@/components/dashboard/category-showcase-rows";
import { ProductStrip } from "./product-strip";
import { CompanyCard } from "./company-card";
import { useAudience } from "./audience-switch";
import { signupHref } from "@/lib/public/visibility";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ProductIndexCard, PublicDirectoryCard } from "@/lib/public/marketplace-api";
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
  companies = [],
  companiesTotal = 0,
}: {
  featured: ProductIndexCard[];
  newest: ProductIndexCard[];
  showcase: ShowcaseCategory[];
  /** Firma dizininin ilk sayfası — hero pili "Firma"yken bu listelenir. */
  companies?: PublicDirectoryCard[];
  companiesTotal?: number;
}) {
  // 6 blok × (1 promo + 10 kategori); artan segmentler son ızgaraya eklenir.
  const rows = toShowcaseRows(showcase, 6);
  // Hero kapsam pili (2026-09-10, kullanıcı kararı — panelle aynı): "Firma"
  // seçiliyken ürün bölümleri yerine FİRMA listesi. İki blok da HTML'de
  // durur (sunucu "products" basar, arama motoru ikisini de görür); görünmeyen
  // `hidden` — audience anahtarıyla aynı hidrasyon kuralı.
  const { scope } = useAudience();
  const firmaMode = scope === "suppliers";

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 pb-14 sm:px-6 lg:px-8">
      <section
        id="firmalar"
        hidden={!firmaMode}
        aria-labelledby="home-firmalar-title"
        className="space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="home-firmalar-title" className="text-xl font-semibold tracking-tight text-zinc-950">
              Firmalar
            </h2>
            {companiesTotal > 0 ? (
              <span className="tnum text-sm text-zinc-500">{companiesTotal.toLocaleString("tr-TR")} firma</span>
            ) : null}
          </span>
          <Link
            href={MARKETPLACE_ROUTES.companies}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 hover:text-zinc-950"
          >
            Tümünü gör
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {companies.length === 0 ? (
          <p className="text-sm text-zinc-500">Henüz listelenen firma yok.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {companies.slice(0, 12).map((c) => (
              <li key={c.slug}>
                {/* Dizinle AYNI geniş kart ve aynı birincil eylem (kayda gider). */}
                <CompanyCard
                  company={c}
                  variant="wide"
                  cta={{ label: "Bilgi iste", href: signupHref("teklif", `/firma/${c.slug}`) }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div hidden={firmaMode} className="space-y-10">
      <ProductStrip
        id="one-cikan-urunler"
        title="Öne çıkan ürünler"
        lead="Doğrulanmış tedarikçilerin vitrinlerinden — fiyat ve minimum sipariş bilgisiyle."
        href={MARKETPLACE_ROUTES.products}
        items={featured}
        accent="blue"
      />

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
          c.count > 0 ? categoryPath(c.id, c.name) : `${MARKETPLACE_ROUTES.products}?kategori=${c.id}`
        }
        countNoun="ürün"
        ctaLabel="Şimdi tedarikçi bulun"
      />
      </div>

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
    </div>
  );
}
