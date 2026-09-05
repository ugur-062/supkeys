import { ReportsRoleGate } from "@/components/company/reports-role-gate";
import { PremiumOnly } from "@/components/company-shell/premium-only";

/** Raporlar: Silver+ paket (menüdeki kilit ile aynı) + "Satınalma raporları" tiki. */
export default function SatinalmaRaporlarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PremiumOnly minTier="SILVER">
      <ReportsRoleGate portal="satinalma">{children}</ReportsRoleGate>
    </PremiumOnly>
  );
}
