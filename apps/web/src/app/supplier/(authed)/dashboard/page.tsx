import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SupplierEmptyPanels />
        </div>
        <TcmbRatesWidget />
      </div>
    </div>
  );
}
