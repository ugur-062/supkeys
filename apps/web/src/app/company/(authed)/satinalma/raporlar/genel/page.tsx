"use client";

import { GeneralReportView } from "@/components/company/reports/general-report-view";

export default function Page() {
  return (
    <GeneralReportView type="ALIM" basePath="/company/satinalma/raporlar" />
  );
}
