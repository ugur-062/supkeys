"use client";

import { SavingsReportView } from "@/components/company/reports/savings-report-view";

export default function Page() {
  return (
    <SavingsReportView type="ALIM" basePath="/company/sirketim/raporlar" />
  );
}
