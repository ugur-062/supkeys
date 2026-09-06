import { ReportsRoleGate } from "@/components/company/reports-role-gate";
import { PremiumOnly } from "@/components/company-shell/premium-only";

/** Raporlar: Gold paket (satınalma paneli) (menüdeki kilit ile aynı) + "Satınalma raporları" tiki. */
export default function SatinalmaRaporlarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PremiumOnly minTier="GOLD">
      <ReportsRoleGate portal="satinalma">{children}</ReportsRoleGate>
    </PremiumOnly>
  );
}
