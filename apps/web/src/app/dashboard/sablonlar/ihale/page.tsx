import { PermissionGuard } from "@/components/auth/permission-guard";
import { TenderTemplatesView } from "./_components/tender-templates-view";

export const metadata = {
  title: "İhale Şablonları — Supkeys",
};

export default function TenderTemplatesPage() {
  return (
    <PermissionGuard permission="templates:view">
      <TenderTemplatesView />
    </PermissionGuard>
  );
}
