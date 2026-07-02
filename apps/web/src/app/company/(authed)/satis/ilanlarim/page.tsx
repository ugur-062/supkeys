"use client";

import { IhalelerView } from "@/components/tenders/ihaleler-view";

/** Satış İlanlarım — satınalmadaki İhalelerim ile aynı zengin liste (SATIS). */
export default function IlanlarimPage() {
  return <IhalelerView listingType="SATIS" />;
}
