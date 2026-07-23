import { ReportsRoleGate } from "@/components/company/reports-role-gate";

export default function SatinalmaRaporlarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReportsRoleGate portal="satinalma">{children}</ReportsRoleGate>;
}
