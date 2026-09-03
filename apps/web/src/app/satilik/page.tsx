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
  title: `${MARKETPLACE_LABELS.offers} — firmaların satışa açtığı ürün ve hizmetler`,
  description:
    "Firmaların satışa açtığı ürün, malzeme ve hizmet ilanları. Kategoriye ve şehre göre inceleyin; teklif vermek için Rothern'e ücretsiz kaydolun.",
  alternates: { canonical: `${resolveSiteUrl()}/satilik` },
  openGraph: {
    title: `${MARKETPLACE_LABELS.offers} — Rothern`,
    url: `${resolveSiteUrl()}/satilik`,
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
          type="SATIS"
          title={MARKETPLACE_LABELS.offers}
          lead="Firmaların satışa açtığı ürün, malzeme ve hizmet ilanları. Kategoriye ve şehre göre süzün, ilgilendiğiniz ilana kaydolup teklif verin."
          searchParams={sp}
        />
    </PublicLayout>
  );
}
