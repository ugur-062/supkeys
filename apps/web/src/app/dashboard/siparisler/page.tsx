import { Suspense } from "react";
import { OrdersListView } from "./_components/orders-list-view";

export const metadata = {
  title: "Siparişler — Supkeys",
};

export default function SiparislerPage() {
  return (
    <Suspense fallback={null}>
      <OrdersListView />
    </Suspense>
  );
}
