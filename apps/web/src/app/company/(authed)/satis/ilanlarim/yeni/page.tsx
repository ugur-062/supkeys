"use client";

import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { AiImportDialog } from "@/components/tenders/ai-import/ai-import-dialog";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import type { AiTenderExtractResult } from "@rothern/shared";
import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Yeni SATIŞ ihalesi — satınalma sihirbazının satışa uyarlanmış hâli:
 * format adımı yok, taban + hemen-al fiyat var, davetliler alıcı firmalar.
 */
export default function YeniSatisIhalesiPage() {
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  const { data: source, isLoading } = useListingDetail(fromId);
  // Faz AI-1 — "Belgeden Doldur" (bkz. satınalma yeni sayfası).
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<AiTenderExtractResult | null>(null);

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

  if (aiResult) {
    return (
      <TenderWizard
        key="ai-import"
        listingType="SATIS"
        initialValues={mapAiDraftToForm(aiResult.draft, "SATIS")}
        aiImport={aiResult}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button outline onClick={() => setAiOpen(true)}>
          <Sparkles className="h-4 w-4" />
          Belgeden Doldur (AI)
        </Button>
      </div>
      <TenderWizard listingType="SATIS" />
      <AiImportDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        listingType="SATIS"
        onResult={(r) => {
          setAiOpen(false);
          setAiResult(r);
        }}
      />
    </div>
  );
}
