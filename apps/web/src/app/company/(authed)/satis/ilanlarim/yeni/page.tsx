"use client";

import { Text } from "@/components/catalyst/text";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { useSearchParams } from "next/navigation";

/**
 * Yeni SATIŞ ihalesi — satınalma sihirbazının satışa uyarlanmış hâli:
 * format adımı yok, taban + hemen-al fiyat var, davetliler alıcı firmalar.
 */
export default function YeniSatisIhalesiPage() {
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  const { data: source, isLoading } = useListingDetail(fromId);

  if (fromId && isLoading) {
    return <Text className="text-sm text-zinc-500">Kopyalanıyor…</Text>;
  }
  // Kopya yalnız KENDİ SATIS ihalenden (?from paramına güvenilmez).
  if (fromId && source && source.isOwner && source.type === "SATIS") {
    return (
      <TenderWizard
        listingType="SATIS"
        initialValues={mapDetailToForm(source, { forCopy: true })}
      />
    );
  }
  return <TenderWizard listingType="SATIS" />;
}
