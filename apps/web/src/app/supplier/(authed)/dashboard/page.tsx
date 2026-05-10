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
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <SupplierGreeting />
        </div>
        <div className="w-full md:w-auto md:max-w-md md:flex-shrink-0">
          <TcmbRatesWidget />
        </div>
      </header>
      <SupplierKpiGrid />
      <SupplierOnboardingCard />
      <SupplierEmptyPanels />
    </div>
  );
}
