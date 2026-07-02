"use client";

import { SellerTendersView } from "@/components/company/seller-tenders-view";

/** Satın Al — Açık İhaleler paritesi (SATIS yönü): teklif verilecek satış
 *  ihaleleri, arama/filtre/sıralama + teklif-durumu rozetli kartlar. */
export default function SatinAlPage() {
  return <SellerTendersView listingType="SATIS" />;
}
