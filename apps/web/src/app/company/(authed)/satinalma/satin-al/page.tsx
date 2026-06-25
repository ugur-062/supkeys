"use client";

import { BrowseListings } from "@/components/company/listings-section";

export default function SatinAlPage() {
  return (
    <BrowseListings
      type="SATIS"
      title="Satın Al"
      emptyHint="Şu an satın alınabilir satış ilanı yok. Firmalarla bağlan ya da herkese açık satış ilanları geldikçe burada görünür."
    />
  );
}
