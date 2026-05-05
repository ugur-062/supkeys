import { Suspense } from "react";
import { SupplierOrdersListView } from "./_components/supplier-orders-list-view";

export const metadata = {
  title: "Siparişler",
};

export default function SupplierSiparislerPage() {
  return (
    <Suspense fallback={null}>
      <SupplierOrdersListView />
    </Suspense>
  );
}
