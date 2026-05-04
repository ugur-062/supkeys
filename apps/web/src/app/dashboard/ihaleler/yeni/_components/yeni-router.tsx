"use client";

import { useSearchParams } from "next/navigation";
import { TenderTypeSelection } from "./tender-type-selection";
import { TenderWizard } from "./tender-wizard";

/**
 * /dashboard/ihaleler/yeni → tip seçim landing
 * /dashboard/ihaleler/yeni?type=rfq → wizard (Adım 1'den)
 *
 * V1: sadece "rfq" tanınır. "english" V2'de aktif olacak; o zamana kadar
 * landing'e geri düşer.
 */
export function YeniIhaleRouter() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");

  if (type === "rfq") {
    return <TenderWizard mode="create" />;
  }

  return <TenderTypeSelection />;
}
