import { ListingDetail } from "@/components/marketplace/listing-detail";
import { resolveListingPage } from "@/components/marketplace/listing-page";
import { parseListingNumber } from "@/lib/public/marketplace";
import { fetchListing, fetchListings } from "@/lib/public/marketplace-api";
import { listingSeo, listingSeoInput } from "@/lib/seo/entities";
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
  /* TEK KAYNAK (`lib/seo/entities.ts`): sayfanın JSON-LD'siyle aynı
     olgulardan türer ve SAHİBİN ADINI parametre olarak bile almaz —
     kapanmış/dizinlenmeyen ilan `noindex` alır, sayfa durur. */
  return listingSeo(listingSeoInput(listing)).metadata;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const { slug } = await params;
  const res = await resolveListingPage(slug, "ALIM");
  if (res.kind === "notFound") notFound();
  if (res.kind === "redirect") permanentRedirect(res.to);
  // Benzer açık talepler: aynı L1 segment, kendisi hariç.
  const seg = res.listing.categoryIds.find((c) => /^\d{8}$/.test(c));
  const similar = seg
    ? (await fetchListings({ type: "ALIM", category: `${seg.slice(0, 2)}000000`, page: 1 })).items.filter(
        (l) => l.number !== res.listing.number,
      )
    : [];
  return <ListingDetail listing={res.listing} similar={similar} />;
}
