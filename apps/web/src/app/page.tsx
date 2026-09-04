import { PublicLayout } from "@/components/marketplace/public-layout";
import { MarketplaceHero } from "@/components/marketplace/hero";
import { StatsStrip } from "@/components/marketplace/stats-strip";
import { HowItWorksFlow } from "@/components/marketplace/how-it-works-flow";
import { ProductShowcase } from "@/components/marketplace/product-showcase";
import { FloatingCta } from "@/components/marketplace/floating-cta";
import { CategoryGrid } from "@/components/marketplace/category-grid";
import { ListingTeaserCard } from "@/components/marketplace/listing-teaser-card";
import { TwoCards } from "@/components/marketplace/two-cards";
import { CompanyGrid } from "@/components/marketplace/company-grid";
import { TrustBand } from "@/components/marketplace/trust-band";
import { PopularChips } from "@/components/marketplace/popular-chips";
import { serializeJsonLd } from "@/lib/json-ld";
import { buildShowcase } from "@/lib/public/category-showcase";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import {
  fetchFeaturedProducts,
  fetchListings,
  fetchProductFacets,
  fetchProducts,
  fetchPublicDirectory,
  fetchSegments,
  fetchStats,
} from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoon } from "@/components/marketplace/coming-soon";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";

/**
 * PAZAR YERİ ANASAYFASI v2 — Europages kalıbı (2026-09-04).
 *
 *  1 header · 2 hero (iki sekmeli arama + RFQ şeridi + güven bandı) ·
 *  3 hareket şeridi (ürün ≥50 ∧ firma ≥20) · 4 alıcı akışı üç adım (her zaman) ·
 *  5 açık alım talepleri (≥3; altında tek satır) · 6 sekmeli ürün kaydırıcısı
 *  (öne çıkan ≥8 · yeni · fiyatı yazılı) · 7 kategori listesi (her zaman) ·
 *  9 iki kart (her zaman) · 10 firmalar (≥4) · 11 nasıl çalışır ·
 * 12 popüler kategoriler · 13 SEO paragrafı + footer.
 *
 * Sıfır veride görünen: 1, 2, 4, 6, 9, 11, 13. Boş kutu YOK. Satış İlanları
 * anasayfada YOK (footer). Kayıt CTA'sı üç: header · hero şeridi · iki kart.
 * `force-dynamic` YOK — public liste, nonce'suz CSP, ISR.
 */
export const revalidate = 60;

const SITE = resolveSiteUrl();
const MIN_DEMANDS = 3;

const LIVE_METADATA: Metadata = {
  title: "Rothern — B2B pazar yeri: ürünler, tedarikçiler ve alım talepleri",
  description:
    "Doğrulanmış tedarikçilerin ürünlerini fiyat ve MOQ ile inceleyin, firmalarla konuşun, alım taleplerine kapalı zarf teklif verin. Alıcı ve satıcı tek hesapta. Kaydolmak ücretsiz.",
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    title: "Rothern — B2B pazar yeri",
    description: "Ürünler, doğrulanmış firmalar ve açık alım talepleri tek yerde.",
    url: `${SITE}/`,
    type: "website",
  },
};

export const metadata: Metadata = MARKETPLACE_LIVE
  ? LIVE_METADATA
  : {
      title: "Çok Yakında",
      description: "Rothern şu anda geliştirme aşamasında. En yakın zamanda sizlerleyiz.",
      robots: { index: false, follow: false },
    };

export default async function HomePage() {
  if (!MARKETPLACE_LIVE) return <ComingSoon />;

  // Paralel; biri düşerse diğerleri sayfayı taşır (veri katmanı hata yutar).
  const [featured, newest, priced, productFacets, segments, demands, directory, stats] = await Promise.all([
    fetchFeaturedProducts(),
    fetchProducts({ sort: "newest", page: 1 }),
    fetchProducts({ price: "has", sort: "price", page: 1 }),
    fetchProductFacets(),
    fetchSegments(),
    fetchListings({ type: "ALIM", page: 1 }),
    fetchPublicDirectory({ hasProducts: true }),
    fetchStats(),
  ]);

  const showcase = buildShowcase({
    segments: segments.map((s) => ({ id: s.id, name: s.nameTr })),
    counts: productFacets.categories.map((c) => ({ id: c.id, count: c.count })),
    productCovers: [...featured, ...newest.items].map((p) => ({ categoryId: p.categoryId, image: p.images[0] })),
    limit: 12,
  });

  // "Son eklenen" seçkide zaten görünenleri tekrar etmesin (skorlar eşitken
  // iki liste birebir çakışıyordu).
  const featuredKeys = new Set(featured.map((p) => `${p.company.slug}/${p.slug}`));
  const newestOnly = newest.items.filter((p) => !featuredKeys.has(`${p.company.slug}/${p.slug}`));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Rothern",
    url: `${SITE}/`,
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}${MARKETPLACE_ROUTES.products}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  // Yakında kapanacaklar önce — aciliyet cezbeder.
  const demandCards = [...demands.items]
    .sort((a, b) => (a.closesAt ? new Date(a.closesAt).getTime() : Infinity) - (b.closesAt ? new Date(b.closesAt).getTime() : Infinity))
    .slice(0, 6);

  return (
    <PublicLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <MarketplaceHero popular={stats.popularCategories} />
      <StatsStrip stats={stats} />
      <HowItWorksFlow />

      {/* AÇIK ALIM TALEPLERİ — gizli ama cezbedici; ürünlerden ÖNCE (kullanıcı
          kararı: talepler öne çıksın). Ölçek açık, kimlik üyeye. */}
      <section className="border-y border-zinc-950/5 bg-zinc-50">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm/6 font-semibold text-emerald-700">Açık alım talepleri</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                Alıcılar şu an bunları arıyor
              </h2>
              <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">
                Doğrulanmış alıcıların açık talepleri. Miktar ve kapsam herkese açık; alıcı adı, kalem
                adları ve şartname yalnız üyelere. Teklif vermek ücretsiz hesapla.
              </p>
            </div>
            {demandCards.length >= MIN_DEMANDS ? (
              <Link
                href={MARKETPLACE_ROUTES.demands}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-950 hover:text-white"
              >
                Tüm talepler{demands.total > 0 ? ` (${demands.total})` : ""} →
              </Link>
            ) : null}
          </div>
          {demandCards.length >= MIN_DEMANDS ? (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {demandCards.map((l) => (
                <ListingTeaserCard key={l.number} listing={l} />
              ))}
            </div>
          ) : (
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
              Talepler kaydolduktan sonra panelinizde kategorinize göre eşleşir.
              <Link href={signupHref("teklif")} className="font-semibold text-zinc-950 underline underline-offset-2 hover:text-zinc-600">
                Kaydol
              </Link>
            </p>
          )}
        </div>
      </section>

      <ProductShowcase
        heading="Ürünler"
        lead="Doğrulanmış firmaların vitrinlerinden — fiyat ve minimum sipariş bilgisiyle."
        groups={[
          { key: "one-cikan", label: "Öne çıkan", items: featured, href: MARKETPLACE_ROUTES.products, hrefLabel: "Tüm ürünler" },
          { key: "yeni", label: "Yeni", items: newestOnly, href: `${MARKETPLACE_ROUTES.products}?sirala=yeni`, hrefLabel: "Yeni ürünler" },
          { key: "fiyatli", label: "Fiyatı yazılı", items: priced.items, href: `${MARKETPLACE_ROUTES.products}?fiyat=var&sirala=fiyat`, hrefLabel: "Fiyatlı ürünler" },
        ]}
      />

      <CategoryGrid categories={showcase} />

      <TwoCards />
      <CompanyGrid companies={directory.items} />
      <TrustBand />
      <PopularChips items={stats.popularCategories} />
      <FloatingCta href={signupHref("talep")} />

      {/* SEO paragrafı — iki cümle, sayfanın ne olduğunu düz metinle söyler. */}
      <section className="mx-auto max-w-7xl px-6 pb-14 lg:px-8">
        <p className="max-w-3xl text-sm/6 text-zinc-500">
          Rothern, Türkiye&apos;deki üretici, distribütör ve hizmet sağlayıcı firmaların ürünlerini fiyat
          ve minimum sipariş bilgisiyle listeleyen, alım taleplerini kapalı zarf teklifle buluşturan
          B2B pazar yeridir. Ürün ve firma profilleri herkese açıktır; teklif vermek, bilgi istemek ve
          alıcı bilgilerini görmek için ücretsiz hesap gerekir.
        </p>
      </section>
    </PublicLayout>
  );
}
