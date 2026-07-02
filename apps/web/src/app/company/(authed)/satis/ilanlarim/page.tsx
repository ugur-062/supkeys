"use client";

import { MyListings } from "@/components/company/listings-section";

export default function IlanlarimPage() {
  return (
    <MyListings
      type="SATIS"
      title="Satış İlanlarım"
      createLabel="Yeni Satış İlanı"
      createHref="/company/satis/ilanlarim/yeni"
      emptyHint="Henüz satış ilanın yok. Yeni Satış İlanı ile ürün/hizmetini satışa çıkar; alıcılar teklif versin veya Hemen-Al ile alsın."
    />
  );
}
