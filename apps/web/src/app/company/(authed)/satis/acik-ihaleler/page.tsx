"use client";

import { BrowseListings } from "@/components/company/listings-section";

export default function AcikIhalelerPage() {
  return (
    <BrowseListings
      type="ALIM"
      title="Açık İhaleler"
      emptyHint="Şu an teklif verebileceğin açık ihale yok. Alıcılarla bağlan ya da herkese açık ihaleler geldikçe burada görünür."
    />
  );
}
