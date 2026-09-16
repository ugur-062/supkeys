"use client";

import { PremiumOnly } from "@/components/company-shell/premium-only";
import { ReportsRoleGate } from "@/components/company/reports-role-gate";

/**
 * SATINALMA raporlarının kapısı — API `company-reports.controller` ile birebir:
 * Gold paket + "Satınalma raporları" (`buy:reports:view`). Genel / Tasarruf /
 * Teklif Karşılaştırma bu kapıyı kendi düzenlerinde takar; İş Analizi TAKMAZ
 * (o satış tarafı, `insights:view` + Silver).
 */
export function PurchasingReportGate({ children }: { children: React.ReactNode }) {
  return (
    <PremiumOnly minTier="GOLD">
      <ReportsRoleGate portal="satinalma">{children}</ReportsRoleGate>
    </PremiumOnly>
  );
}
