import { SupplierTenderDetailView } from "./_components/tender-detail-view";

export const metadata = {
  title: "İhale Detayı",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupplierTenderDetailPage({ params }: Props) {
  const { id } = await params;
  return <SupplierTenderDetailView id={id} />;
}
