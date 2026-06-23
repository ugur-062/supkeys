import { PermissionGuard } from "@/components/auth/permission-guard";
import { Suspense } from "react";
import { SupplierPoolView } from "./_components/supplier-pool-view";

export const metadata = {
  title: "Tedarikçi Havuzu — Supkeys",
};

export default function TedarikciHavuzuPage() {
  return (
    <PermissionGuard permission="settings:suppliers">
      <Suspense fallback={null}>
        <SupplierPoolView />
      </Suspense>
    </PermissionGuard>
  );
}
