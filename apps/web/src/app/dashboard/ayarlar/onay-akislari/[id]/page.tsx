import { ApprovalFlowDetailLoader } from "./_components/approval-flow-detail-loader";

export const metadata = {
  title: "Onay Akışı Detayı — Supkeys",
};

export default async function ApprovalFlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApprovalFlowDetailLoader id={id} />;
}
