import { Suspense } from "react";
import { SupplierApplicationsView } from "./_components/supplier-applications-view";

export const metadata = {
  title: "Tedarikçi Başvuruları — Supkeys Admin",
  robots: { index: false, follow: false },
};

export default function SupplierApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <SupplierApplicationsView />
    </Suspense>
  );
}
