import { PermissionGuard } from "@/components/auth/permission-guard";
import { BidComparisonView } from "./_components/bid-comparison-view";

export const metadata = {
  title: "Teklif Karşılaştırma Raporu — Rothern",
};

export default function BidComparisonReportPage() {
  return (
    <PermissionGuard permission="reports:view">
      <BidComparisonView />
    </PermissionGuard>
  );
}
