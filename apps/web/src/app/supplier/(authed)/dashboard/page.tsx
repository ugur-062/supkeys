import type { Metadata } from "next";
import { SupplierEmptyPanels } from "./_components/empty-panels";
import { SupplierGreeting } from "./_components/greeting";
import { SupplierKpiGrid } from "./_components/kpi-grid";
import { SupplierOnboardingCard } from "./_components/onboarding-card";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function SupplierDashboardPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <SupplierGreeting />
      <SupplierKpiGrid />
      <SupplierOnboardingCard />
      <SupplierEmptyPanels />
    </div>
  );
}
