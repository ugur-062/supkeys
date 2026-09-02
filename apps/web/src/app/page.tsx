import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketplaceFooter } from "@/components/marketplace/marketplace-footer";
import { SearchForm } from "@/components/marketplace/search-form";
import { SectionGrid } from "@/components/marketplace/section-grid";
import { SectorGrid } from "@/components/marketplace/sector-grid";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
} from "@/lib/public/marketplace";
import { fetchFacets, fetchListings } from "@/lib/public/marketplace-api";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import type { Metadata } from "next";
import Link from "next/link";

/**
 * PAZAR YERİ ANASAYFASI — sunucu bileşeni, ISR.
 *
 * Eski pazarlama anasayfası `/nasil-calisir`e taşındı (içerik aynen duruyor).
 * Gerekçe: pazar yeri anasayfası ÜRÜNÜ değil ENVANTERİ göstermeli — ziyaretçi
 * "burada ne var" sorusuna ilk ekranda yanıt almalı, ürün anlatısı bir tık
 * ötede durabilir. Arama motoru tarafında da fark var: envanter sayfası her
 * revalidate'te tazelenen içerik üretir, pazarlama sayfası statik kalır.
 *
 * `force-dynamic` YOK — bu rota public listede (bkz. lib/public-routes.ts) ve
 * nonce'suz CSP alıyor; statik/ISR üretilebilmesi SEO'nun ön koşulu.
 */
export const revalidate = 60;

const SITE = resolveSiteUrl();

export const metadata: Metadata = {
  title: "Rothern — B2B pazar yeri: açık alım talepleri ve satılık ilanlar",
  description:
    "Firmaların açık alım taleplerini ve satılık ilanlarını inceleyin. Kapalı zarf teklif toplama, sipariş takibi ve firma keşfi tek panelde. Kaydolmak ücretsiz.",
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    title: "Rothern — B2B pazar yeri",
    description:
      "Açık alım talepleri, satılık ilanlar ve doğrulanmış firmalar tek yerde.",
    url: `${SITE}/`,
    type: "website",
  },
};

const HOW_IT_WORKS = [
  {
    icon: UsersIcon,
    title: "Kaydol ve firmanı tanıt",
    body: "Tek hesapla hem alıcı hem satıcı olursun. Faaliyet alanını ve kategorilerini seç; eşleşen talepler sana gelsin.",
  },
  {
    icon: LockClosedIcon,
    title: "Kapalı zarf teklif ver",
    body: "Teklifini yalnız talep sahibi görür. Rakip tedarikçiler ne teklifini ne kimliğini ne de kaç teklif geldiğini görebilir.",
  },
  {
    icon: CheckBadgeIcon,
    title: "Siparişe dönüştür",
    body: "Kazandırma kararıyla sipariş otomatik oluşur; teslim ve ödeme adımlarını aynı panelden takip edersin.",
  },
];

export default async function HomePage() {
  // Üç çağrı paralel: biri düşerse diğerleri sayfayı taşımaya devam eder
  // (veri katmanı hata YUTAR ve boş döner — bkz. marketplace-api.ts).
  const [demands, offers, facets] = await Promise.all([
    fetchListings({ type: "ALIM", page: 1 }),
    fetchListings({ type: "SATIS", page: 1 }),
    fetchFacets(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Rothern",
    url: `${SITE}/`,
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE}${MARKETPLACE_ROUTES.demands}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="min-h-dvh bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <MarketingHeader />

      <main>
        {/* Hero — envanterle açılır, pazarlama sözüyle değil. */}
        <section className="px-6 pt-32 pb-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-5xl">
              Türkiye'nin B2B alım-satım pazar yeri
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg/8 text-pretty text-zinc-600">
              Açık alım taleplerini ve satılık ilanları inceleyin, kapalı zarf
              usulüyle teklif verin. Görmek için üyelik gerekmez.
            </p>
            <div className="mx-auto mt-8 max-w-2xl">
              <SearchForm action={MARKETPLACE_ROUTES.demands} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link
                href={MARKETPLACE_ROUTES.demands}
                className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:text-blue-700"
              >
                {MARKETPLACE_LABELS.demands}
                {demands.total > 0 ? (
                  <span className="text-zinc-500">
                    ({demands.total.toLocaleString("tr-TR")})
                  </span>
                ) : null}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
              <Link
                href={MARKETPLACE_ROUTES.offers}
                className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:text-blue-700"
              >
                {MARKETPLACE_LABELS.offers}
                {offers.total > 0 ? (
                  <span className="text-zinc-500">
                    ({offers.total.toLocaleString("tr-TR")})
                  </span>
                ) : null}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
              <Link
                href={MARKETPLACE_ROUTES.companies}
                className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:text-blue-700"
              >
                {MARKETPLACE_LABELS.companies}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        <SectionGrid
          heading={MARKETPLACE_LABELS.demands}
          lead="Firmaların herkese açık yayımladığı, teklif bekleyen satın alma talepleri."
          href={MARKETPLACE_ROUTES.demands}
          hrefLabel="Tüm talepler"
          listings={demands.items.slice(0, 6)}
          emptyTitle="Şu an açık alım talebi yayımlanmamış."
        />

        <SectorGrid facets={facets} />

        <SectionGrid
          heading={MARKETPLACE_LABELS.offers}
          lead="Firmaların satışa açtığı ürün, malzeme ve hizmetler."
          href={MARKETPLACE_ROUTES.offers}
          hrefLabel="Tüm ilanlar"
          listings={offers.items.slice(0, 6)}
          emptyTitle="Şu an satılık ilan yayımlanmamış."
        />

        {/* Nasıl çalışır — kısa; uzun anlatı /nasil-calisir'da. */}
        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Nasıl çalışır
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((s, i) => (
              <li
                key={s.title}
                className="rounded-2xl border border-zinc-200 bg-white p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <s.icon aria-hidden className="size-5 text-zinc-400" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-zinc-950">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm/6 text-zinc-600">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/company/kayit"
              className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Ücretsiz kaydol
            </Link>
            <Link
              href="/nasil-calisir"
              className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-blue-700"
            >
              Ürünü ve paketleri incele
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
