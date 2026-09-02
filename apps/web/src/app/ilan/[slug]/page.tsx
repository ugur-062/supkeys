import { ListingDetail } from "@/components/marketplace/listing-detail";
import { resolveListingPage } from "@/components/marketplace/listing-page";
import { listingPath, parseListingNumber } from "@/lib/public/marketplace";
import { fetchListing } from "@/lib/public/marketplace-api";
import { resolveSiteUrl } from "@/lib/site-url";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/** ISR 2 dk — ilan içeriği yayımlandıktan sonra nadiren değişir. */
export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const number = parseListingNumber(slug);
  const listing = number ? await fetchListing(number) : null;
  if (!listing) return { title: "İlan bulunamadı", robots: { index: false } };

  const canonical = `${resolveSiteUrl()}${listingPath(listing.type, listing.number, listing.title)}`;
  const description =
    listing.description?.replace(/\s+/g, " ").trim().slice(0, 160) ??
    `${listing.company.name} firmasının ${listing.number} numaralı satış ilanı.`;

  return {
    title: `${listing.title} — satılık ilan ${listing.number}`,
    description,
    alternates: { canonical },
    // Kapanmış / sahibi dizinlemeyi kapatmış ilan: sayfa DURUR, indeks YOK.
    robots: listing.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: listing.title,
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const { slug } = await params;
  const res = await resolveListingPage(slug, "SATIS");
  if (res.kind === "notFound") notFound();
  if (res.kind === "redirect") permanentRedirect(res.to);
  return <ListingDetail listing={res.listing} />;
}
