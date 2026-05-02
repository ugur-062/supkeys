import { TenderDetailView } from "./_components/tender-detail-view";

export const metadata = {
  title: "İhale Detayı — Supkeys",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TenderDetailPage({ params }: Props) {
  const { id } = await params;
  return <TenderDetailView id={id} />;
}
