"use client";

import { BidComparisonView } from "@/components/company/reports/bid-comparison-view";

export default function Page() {
  return (
    <BidComparisonView type="ALIM" basePath="/company/sirketim/raporlar" />
  );
}
