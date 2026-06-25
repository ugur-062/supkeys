import { PermissionGuard } from "@/components/auth/permission-guard";
import { SupplierTemplatesView } from "./_components/supplier-templates-view";

export const metadata = {
  title: "Tedarikçi Şablonları — Rothern",
};

export default function SupplierTemplatesPage() {
  return (
    <PermissionGuard permission="templates:view">
      <SupplierTemplatesView />
    </PermissionGuard>
  );
}
