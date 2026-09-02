import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketplaceFooter } from "@/components/marketplace/marketplace-footer";
import {
  ListingIndex,
  type MarketplaceSearchParams,
} from "@/components/marketplace/listing-index";
import { MARKETPLACE_LABELS } from "@/lib/public/marketplace";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";

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
  const sp = await searchParams;
  return (
    <div className="min-h-dvh bg-white">
      <MarketingHeader />
      <main>
        <ListingIndex
          type="SATIS"
          title={MARKETPLACE_LABELS.offers}
          lead="Firmaların satışa açtığı ürün, malzeme ve hizmet ilanları. Kategoriye ve şehre göre süzün, ilgilendiğiniz ilana kaydolup teklif verin."
          searchParams={sp}
        />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
