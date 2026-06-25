import { PermissionGuard } from "@/components/auth/permission-guard";
import { EditLoader } from "./_components/edit-loader";

export const metadata = {
  title: "İhaleyi Düzenle — Rothern",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TenderEditPage({ params }: Props) {
  const { id } = await params;
  return (
    <PermissionGuard permission="tender:edit">
      <EditLoader id={id} />
    </PermissionGuard>
  );
}
