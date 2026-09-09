import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { ListingIndex } from "@/components/marketplace/listing-index";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
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

export const metadata: Metadata = buildMetadata({
  title: `${MARKETPLACE_LABELS.demands} — Türkiye ve yurtdışından açık alım ilanları`,
  description:
    "Firmaların yayımladığı açık alım taleplerini kategoriye ve şehre göre inceleyin. Teklif vermek için Rothern'e ücretsiz kaydolun.",
  path: MARKETPLACE_ROUTES.demands,
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParamsLike>;
}) {
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  return (
    <PublicLayout className={MARKET_GROUND}>
        <ListingIndex
          type="ALIM"
          title={MARKETPLACE_LABELS.demands}
          lead="Firmaların herkese açık alım talepleri. Kalemleri ve alıcıyı görmek, teklif vermek için ücretsiz hesap."
          searchParams={sp}
        />
    </PublicLayout>
  );
}
