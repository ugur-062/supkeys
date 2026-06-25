"use client";

import { MyListings } from "@/components/company/listings-section";

export default function IhalelerimPage() {
  return (
    <MyListings
      type="ALIM"
      title="İhalelerim"
      createLabel="Yeni İhale"
      createHref="/company/satinalma/ihalelerim/yeni"
      emptyHint="Henüz ihalen yok. Yeni İhale ile çok kalemli bir alım ihalesi (RFQ / İngiliz Usulü) aç; tedarikçileri davet et, teklif topla."
    />
  );
}
