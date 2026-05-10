import type { Metadata } from "next";
import { SupplierDashboardView } from "./_components/dashboard-view";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function SupplierDashboardPage() {
  return <SupplierDashboardView />;
}
