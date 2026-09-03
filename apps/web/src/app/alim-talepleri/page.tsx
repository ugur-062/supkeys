import { PublicLayout } from "@/components/marketplace/public-layout";
import {
  ListingIndex,
  type MarketplaceSearchParams,
} from "@/components/marketplace/listing-index";
import { MARKETPLACE_LABELS } from "@/lib/public/marketplace";
import { resolveSiteUrl } from "@/lib/site-url";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * ISR: 60 sn. Sayfa süzgeçli varyantlar üretiyor (`?kategori=…`), her varyant
 * kendi önbellek girdisini alır. `force-dynamic` KOYMA — bu rota public
 * listesinde ve nonce'suz CSP alıyor (bkz. lib/public-routes.ts).
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: `${MARKETPLACE_LABELS.demands} — Türkiye ve yurtdışından açık alım ilanları`,
  description:
    "Firmaların yayımladığı açık alım taleplerini kategoriye ve şehre göre inceleyin. Teklif vermek için Rothern'e ücretsiz kaydolun.",
  alternates: { canonical: `${resolveSiteUrl()}/alim-talepleri` },
  openGraph: {
    title: `${MARKETPLACE_LABELS.demands} — Rothern`,
    url: `${resolveSiteUrl()}/alim-talepleri`,
    type: "website",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<MarketplaceSearchParams>;
}) {
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  return (
    <PublicLayout>
        <ListingIndex
          type="ALIM"
          title={MARKETPLACE_LABELS.demands}
          lead="Firmaların herkese açık yayımladığı satın alma talepleri. Kategori, şehir ve kapsama göre süzün; teklif vermek için ücretsiz hesap açın."
          searchParams={sp}
        />
    </PublicLayout>
  );
}
