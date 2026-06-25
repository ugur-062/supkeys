"use client";

import { MyListings } from "@/components/company/listings-section";

export default function IhalelerimPage() {
  return (
    <MyListings
      type="ALIM"
      title="İhalelerim"
      createLabel="Yeni İhale"
      emptyHint="Henüz ihalen yok. Yeni İhale ile bir alım ihalesi (RFQ / İngiliz Usulü) aç; satıcılar teklif versin."
    />
  );
}
