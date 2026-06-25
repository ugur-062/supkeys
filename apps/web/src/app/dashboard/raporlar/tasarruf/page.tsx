import { PermissionGuard } from "@/components/auth/permission-guard";
import { SavingsReportView } from "./_components/savings-view";

export const metadata = {
  title: "Tasarruf Raporu — Rothern",
};

export default function SavingsReportPage() {
  return (
    <PermissionGuard permission="reports:view">
      <SavingsReportView />
    </PermissionGuard>
  );
}
