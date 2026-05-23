"use client";

import { useSearchParams } from "next/navigation";
import { TenderTypeSelection } from "./tender-type-selection";
import { TenderWizard } from "./tender-wizard";

/**
 * /dashboard/ihaleler/yeni → tip seçim landing
 * /dashboard/ihaleler/yeni?type=rfq → wizard, RFQ
 * /dashboard/ihaleler/yeni?type=auction → wizard, İngiliz Usulü (V2-7)
 */
export function YeniIhaleRouter() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");

  if (type === "rfq" || type === "auction") {
    return <TenderWizard mode="create" />;
  }

  return <TenderTypeSelection />;
}
