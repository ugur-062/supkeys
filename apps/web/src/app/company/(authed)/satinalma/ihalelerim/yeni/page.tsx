"use client";

import { Text } from "@/components/catalyst/text";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { useSearchParams } from "next/navigation";

export default function YeniIhalePage() {
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  // Kopyala: ?from={id} ile mevcut ihaleden ön-doldurarak yeni ihale.
  const { data: source, isLoading } = useListingDetail(fromId);

  if (fromId && isLoading) {
    return <Text className="text-sm text-zinc-500">Kopyalanıyor…</Text>;
  }

  // Kopya yalnız KENDİ ALIM ihalenden: ?from paramına güvenilmez —
  // başka firmanın ilanı (iç notlar dahil) forma taşınmaz, yön karışmaz.
  if (fromId && source && source.isOwner && source.type === "ALIM") {
    return (
      <TenderWizard initialValues={mapDetailToForm(source, { forCopy: true })} />
    );
  }

  return <TenderWizard />;
}
