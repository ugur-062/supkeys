import { OrderDetailView } from "./_components/order-detail-view";

export const metadata = {
  title: "Sipariş Detayı — Supkeys",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetailView id={id} />;
}
