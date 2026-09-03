"use client";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/catalyst/text";
import { AiImportDialog } from "@/components/tenders/ai-import/ai-import-dialog";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import {
  PRODUCT_SEED_KEY,
  mapProductToForm,
  type ProductSeed,
} from "@/lib/tenders/map-product-to-form";
import type { AiTenderExtractResult } from "@rothern/shared";
import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function YeniIhalePage() {
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  const fromAi = params.get("ai") === "1";
  /** Ürün sayfasından "talebime ekle" ile gelindi. */
  const fromProduct = params.get("urun") === "1";
  const { data: source, isLoading } = useListingDetail(fromId);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<AiTenderExtractResult | null>(null);
  const [productSeed, setProductSeed] = useState<ProductSeed | null>(null);

  // AI-3: asistandan gelen taslak sessionStorage'da → wizard'a taşı.
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

  // Ürün tohumu — AI taslağıyla AYNI taşıma tekniği (sessionStorage), AYRI
  // anahtar. Aynı anahtarı paylaşsalardı ürün tohumu `AiTenderExtractResult`
  // gibi ayrıştırılır ve sayfaya "AI doldurdu" bandı basılırdı; burada AI yok.
  useEffect(() => {
    if (!fromProduct) return;
    const raw = sessionStorage.getItem(PRODUCT_SEED_KEY);
    if (raw) {
      try {
        setProductSeed(JSON.parse(raw) as ProductSeed);
      } catch {
        /* bozuk payload — yok say */
      }
      sessionStorage.removeItem(PRODUCT_SEED_KEY);
    }
  }, [fromProduct]);

  if (fromId && isLoading) {
    return <Text className="text-sm text-zinc-500">Kopyalanıyor…</Text>;
  }

  // Kopya yalnız KENDİ ALIM ihalenden.
  if (fromId && source && source.isOwner && source.type === "ALIM") {
    return (
      <TenderWizard initialValues={mapDetailToForm(source, { forCopy: true })} />
    );
  }

  if (productSeed) {
    return (
      <TenderWizard
        key="product-seed"
        initialValues={mapProductToForm(productSeed)}
      />
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
      <TenderWizard
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
                Şartname, teklif talebi veya fotoğraf yükleyin — AI formu sizin
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
        listingType="ALIM"
        onResult={(r) => {
          setAiOpen(false);
          setAiResult(r);
        }}
      />
    </div>
  );
}
