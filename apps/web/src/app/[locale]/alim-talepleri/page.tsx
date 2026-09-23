import { setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { ListingIndex } from "@/components/marketplace/listing-index";
import { ButtonAccentProvider } from "@/components/ui/button-accent";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { dizinBos } from "@/lib/seo/empty-index-guard";
import { buildMetadata } from "@/lib/seo/meta";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * ISR: 60 sn. Sayfa süzgeçli varyantlar üretiyor (`?kategori=…`), her varyant
 * kendi önbellek girdisini alır. `force-dynamic` KOYMA — bu rota public
 * listesinde ve nonce'suz CSP alıyor (bkz. lib/public-routes.ts).
 */
export const revalidate = 60;

/**
 * Meta İSTEK ANINDA üretilir: dizin BOŞSA `noindex` basılır (ince içerik /
 * yumuşak 404 koruması, `lib/seo/empty-index-guard.ts`). İlk kayıt girince
 * kural kendiliğinden kalkar.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const bos = await dizinBos("talepler");
  return buildMetadata({
    locale,
  title: `${MARKETPLACE_LABELS.demands} — Türkiye ve yurtdışından açık alım ilanları`,
  description:
    "Firmaların yayımladığı açık alım taleplerini kategoriye ve şehre göre inceleyin. Teklif vermek için Rothern'e ücretsiz kaydolun.",
  path: MARKETPLACE_ROUTES.demands,
    noindex: bos,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<SearchParamsLike>;
}) {
  setRequestLocale(await localeFromParams(params));
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  return (
    <PublicLayout className={MARKET_GROUND}>
        {/* Tedarikçi yüzü: "Teklif ver" ve dolgulu düğmeler YEŞİL (2026-09-18, kullanıcı). */}
        <ButtonAccentProvider accent="emerald">
        <ListingIndex
          type="ALIM"
          title={MARKETPLACE_LABELS.demands}
          lead="Firmaların herkese açık alım talepleri. Kalemleri ve alıcıyı görmek, teklif vermek için ücretsiz hesap."
          searchParams={sp}
        />
        </ButtonAccentProvider>
    </PublicLayout>
  );
}
