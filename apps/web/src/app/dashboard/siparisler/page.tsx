import { PermissionGuard } from "@/components/auth/permission-guard";
import { Suspense } from "react";
import { OrdersListView } from "./_components/orders-list-view";

export const metadata = {
  title: "Siparişler — Supkeys",
};

export default function SiparislerPage() {
  return (
    <PermissionGuard permission="order:view">
      <Suspense fallback={null}>
        <OrdersListView />
      </Suspense>
    </PermissionGuard>
  );
}
