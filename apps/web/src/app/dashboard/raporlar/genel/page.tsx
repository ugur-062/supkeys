import { PermissionGuard } from "@/components/auth/permission-guard";
import { GeneralReportView } from "./_components/general-view";

export const metadata = {
  title: "Genel İhale Raporu — Supkeys",
};

export default function GeneralReportPage() {
  return (
    <PermissionGuard permission="reports:view">
      <GeneralReportView />
    </PermissionGuard>
  );
}
