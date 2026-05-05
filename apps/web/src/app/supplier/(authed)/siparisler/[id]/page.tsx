import { SupplierOrderDetailView } from "./_components/supplier-order-detail-view";

export const metadata = {
  title: "Sipariş Detayı",
};

export default async function SupplierOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierOrderDetailView id={id} />;
}
