import { AudienceOnly, AudienceProvider } from "@/components/marketplace/audience-switch";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { HomeHero } from "@/components/marketplace/home-hero";
import { HomeBuyer } from "@/components/marketplace/home-buyer";
import { HomeSupplier } from "@/components/marketplace/home-supplier";
import { buildShowcase } from "@/lib/public/category-showcase";
import {
  fetchListings,
  fetchProductFacets,
  fetchProducts,
  fetchSegments,
} from "@/lib/public/marketplace-api";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { buildMetadata } from "@/lib/seo/meta";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/marketplace/coming-soon";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";

/**
 * ANASAYFA — PANEL ANASAYFALARININ HERKESE AÇIK HÂLİ (2026-09-08, kullanıcı
 * kararı: "satınalma ve satış anasayfalarını www.rothern.com anasayfasına
 * taşı, seçime göre o ekranlar gelsin, renkleriyle birlikte").
 *
 * Ziyaretçi üstteki anahtarla tarafını seçer; sayfa o portalın panel
 * anasayfasını, o portalın rengiyle gösterir:
 *
 *   TEDARİKÇİ (yeşil) hero → açık alım talepleri → "ürününüz vitrinde mi?"  ← VARSAYILAN (2026-09-21)
 *   ALICI (mavi)      hero → kategori vitrini (çizgisel ikon) → yeni eklenenler (öne çıkanlar 2026-09-22'de kalktı)
 *
 * FİRMA ARAMA YOK (2026-09-21, kullanıcı kararı): hero kapsam pili ve firma
 * listesi anasayfadan kalktı. `/firmalar` dizini, üst çubuk sekmesi ve altbilgi
 * bağlantısı bu karardan ETKİLENMEDİ (ayrı yüzey).
 *
 * PANEL SAYFALARINA DOKUNULMADI (kullanıcı sınırı): `PanelHeroSearch` ve
 * `CategoryShowcaseRows` değiştirilmeden kullanılıyor — ikisi de tümüyle
 * prop'la sürülüyor. Panelin tavsiye şeridi ve satış talep listesi
 * anonimde hesaplanamayan girdilere dayandığı için herkese açık
 * karşılıkları yazıldı (gerekçeler `home-buyer` / `home-supplier`de).
 *
 * MONOKROM KURALININ İSTİSNASI: `CLAUDE.md` "herkese açık pazar yeri
 * monokrom kalır, portal renkleri yalnız panelde yaşar" der. Kullanıcı bu
 * sayfa için renklerin de taşınmasını istedi. İstisna YALNIZ `/` içindir —
 * `/urunler`, `/firmalar`, `/alim-talepleri`, ürün ve firma sayfaları siyah
 * kalır.
 *
 * KALKAN BLOKLAR: sayı şeridi, nasıl çalışır, sekmeli ürün kaydırıcısı, iki
 * kart, firma ızgarası, güven bandı, popüler çipler, yüzen CTA. Bileşenler
 * SİLİNMEDİ (`/nasil-calisir` ve liste sayfaları kullanıyor). JSON-LD ve
 * alttaki SEO paragrafı KALDI: ikisi de arama görünürlüğünü taşıyor.
 *
 * `force-dynamic` YOK — public liste, nonce'suz CSP, ISR.
 */
export const revalidate = 60;


export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.home" });
  if (!MARKETPLACE_LIVE) {
    return {
      title: t("comingSoonTitle"),
      description: t("comingSoonDescription"),
      robots: { index: false, follow: false },
    };
  }
  return {
    ...buildMetadata({
      title: t("metaTitle"),
      description: t("metaDescription"),
      path: "/",
      locale,
    }),
    title: { absolute: t("metaAbsoluteTitle") },
  };
}

export default async function HomePage({ params }: { params: LocaleParams }) {
  const locale = await localeFromParams(params);
  // Statik render: bu sayfa next-intl API'si çağırır (docs/plan-i18n.md).
  setRequestLocale(locale);
  if (!MARKETPLACE_LIVE) return <ComingSoon />;
  const t = await getTranslations("web.marketing.home");

  // Paralel; biri düşerse diğerleri sayfayı taşır (veri katmanı hata yutar).
  // Firma dizini ÇEKİLMEZ (2026-09-21, kullanıcı kararı): anasayfada firma
  // arama ve firma listesi yok.
  // "Öne çıkan ürünler" şeridi 2026-09-22'de kalktı → o sorgu da atılmaz.
  const [newest, productFacets, segments, demands] = await Promise.all([
    fetchProducts({ sort: "newest", page: 1 }),
    fetchProductFacets(),
    fetchSegments(),
    fetchListings({ type: "ALIM", page: 1 }),
  ]);

  const showcase = buildShowcase({
    segments: segments.map((s) => ({ id: s.id, name: s.nameTr })),
    counts: productFacets.categories.map((c) => ({ id: c.id, count: c.count })),
    productCovers: newest.items.map((p) => ({
      categoryId: p.categoryId,
      image: p.images[0],
    })),
    // TÜM ana kategoriler (58 segment) — panel vitriniyle aynı kural.
    limit: 100,
  });

  // Yakında kapanacaklar önce — aciliyet cezbeder.
  const demandCards = [...demands.items]
    .sort(
      (a, b) =>
        (a.closesAt ? new Date(a.closesAt).getTime() : Infinity) -
        (b.closesAt ? new Date(b.closesAt).getTime() : Infinity),
    )
    .slice(0, 6);


  return (
    <PublicLayout>
      <AudienceProvider>
        <HomeHero />

        {/* İki yüzün GÖVDESİ de HTML'de durur (arama motoru ikisini de görür);
            görünmeyen taraf `hidden` ile ölçüm ve etkileşim dışı kalır. Yalnız
            hero tek basılır — iki arka plan fotoğrafı birden inmesin diye. */}
        <AudienceOnly side="buyer">
          <HomeBuyer newest={newest.items} showcase={showcase} />
        </AudienceOnly>

        <AudienceOnly side="supplier">
          <HomeSupplier demands={demandCards} total={demands.total} />
        </AudienceOnly>

        {/* SEO paragrafı — iki cümle, sayfanın ne olduğunu düz metinle söyler. */}
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <p className="max-w-3xl text-sm/6 text-zinc-500">{t("seoParagraph")}</p>
        </section>
      </AudienceProvider>
    </PublicLayout>
  );
}
