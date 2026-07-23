import { PremiumOnly } from "@/components/company-shell/premium-only";
import { ReportsRoleGate } from "@/components/company/reports-role-gate";

export default function SatisRaporlarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PremiumOnly>
      <ReportsRoleGate portal="satis">{children}</ReportsRoleGate>
    </PremiumOnly>
  );
}
