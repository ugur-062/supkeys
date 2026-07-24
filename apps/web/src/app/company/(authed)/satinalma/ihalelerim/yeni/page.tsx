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

export default function YeniIhalePage() {
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  // Kopyala: ?from={id} ile mevcut ihaleden ön-doldurarak yeni ihale.
  const { data: source, isLoading } = useListingDetail(fromId);
  // Faz AI-1 — "Belgeden Doldur": çıkarım sonucu state'te; wizard yeniden
  // kurulur (key) ve AI bandı + initialValues ile açılır.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<AiTenderExtractResult | null>(null);

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

  if (aiResult) {
    return (
      <TenderWizard
        key="ai-import"
        initialValues={mapAiDraftToForm(aiResult.draft, "ALIM")}
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
      <TenderWizard />
      <AiImportDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        listingType="ALIM"
        onResult={(r) => {
          setAiOpen(false);
          setAiResult(r);
        }}
      />
    </div>
  );
}
