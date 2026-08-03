"use client";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/catalyst/text";
import { AiImportDialog } from "@/components/tenders/ai-import/ai-import-dialog";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import type { AiTenderExtractResult } from "@rothern/shared";
import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Yeni SATIŞ ihalesi — satınalma sihirbazının satışa uyarlanmış hâli.
 */
export default function YeniSatisIhalesiPage() {
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  const fromAi = params.get("ai") === "1";
  const { data: source, isLoading } = useListingDetail(fromId);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<AiTenderExtractResult | null>(null);

  useEffect(() => {
    if (!fromAi) return;
    const raw = sessionStorage.getItem("ai-tender-draft");
    if (raw) {
      try {
        setAiResult(JSON.parse(raw) as AiTenderExtractResult);
      } catch {
        /* bozuk payload — yok say */
      }
      sessionStorage.removeItem("ai-tender-draft");
    }
  }, [fromAi]);

  if (fromId && isLoading) {
    return <Text className="text-sm text-zinc-500">Kopyalanıyor…</Text>;
  }
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
      <TenderWizard
        listingType="SATIS"
        belowStepsSlot={
          /* AI-1 — belgeden doldurma girişi (adım göstergesinin hemen altında) */
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900">
                Belgeden otomatik doldur
              </p>
              <p className="text-xs text-zinc-500">
                Ürün listesi, katalog veya fotoğraf yükleyin — AI ilanı sizin
                için doldursun.
              </p>
            </div>
            <Button variant="primary" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Belgeden Doldur
            </Button>
          </div>
        }
      />
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
