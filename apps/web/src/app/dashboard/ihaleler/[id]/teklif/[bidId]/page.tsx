import { BidDetailView } from "./_components/bid-detail-view";

export const metadata = {
  title: "Teklif Detayı — Supkeys",
};

interface Props {
  params: Promise<{ id: string; bidId: string }>;
}

export default async function TenderBidDetailPage({ params }: Props) {
  const { id, bidId } = await params;
  return <BidDetailView tenderId={id} bidId={bidId} />;
}
