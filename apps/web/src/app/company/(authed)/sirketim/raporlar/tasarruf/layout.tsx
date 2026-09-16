import { PurchasingReportGate } from "@/components/company/reports/purchasing-report-gate";

/** Satınalma raporu: Gold + "Satınalma raporları" izni (API aynası). */
export default function SatinalmaRaporuLayout({ children }: { children: React.ReactNode }) {
  return <PurchasingReportGate>{children}</PurchasingReportGate>;
}
