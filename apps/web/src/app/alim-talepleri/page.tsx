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
  const sp = await searchParams;
  return (
    <div className="min-h-dvh bg-white">
      <MarketingHeader />
      <main>
        <ListingIndex
          type="ALIM"
          title={MARKETPLACE_LABELS.demands}
          lead="Firmaların herkese açık yayımladığı satın alma talepleri. Kategoriye ve şehre göre süzün, ilgilendiğiniz talebe kaydolup teklif verin."
          searchParams={sp}
        />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
