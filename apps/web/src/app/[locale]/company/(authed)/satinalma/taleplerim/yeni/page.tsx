"use client";

import { useTranslations } from "next-intl";
import { QuickRequest } from "@/components/tenders/quick/quick-request";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { useListingDetail } from "@/hooks/use-company-listings";
import { useListingTemplates } from "@/hooks/use-listing-templates";
import { AI_TENDER_DRAFT_KEY } from "@/lib/company/ai-search";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { PRODUCT_SEED_KEY, mapProductToForm, type ProductSeed } from "@/lib/tenders/map-product-to-form";
import type { AiTenderExtractResult } from "@rothern/shared";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/**
 * YENİ TALEP — TEK GİRİŞ: HIZLI KART (2026-09-19, kullanıcı kararı: "detaylı
 * sihirbazı kaldır, sistemde görünmesin"). Eskiden kopya (`?from=`), AI belge
 * (`?ai=1`) ve şablon (`?template=`) girişleri ayrı bir sihirbaza yönlenirdi;
 * artık üçü de hızlı kartı DOLU açar. Ürün sayfasından "talebime ekle"
 * (`?urun=1`) yine kalem olarak düşer.
 */
export default function YeniTalepPage() {
  const tr = useTranslations("web.panel.requests.page");
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  const fromAi = params.get("ai") === "1";
  const templateId = params.get("template") ?? "";
  const fromProduct = params.get("urun") === "1";

  const source = useListingDetail(fromId);
  const templates = useListingTemplates();
  const [sessionSeed, setSessionSeed] = useState<Partial<TenderFormData> | null | undefined>(
    fromAi || fromProduct ? undefined : null,
  );

  // sessionStorage tohumları (AI taslağı / ürün) — bir kez okunur, silinir.
  useEffect(() => {
    if (!fromAi && !fromProduct) return;
    try {
      if (fromAi) {
        const raw = sessionStorage.getItem(AI_TENDER_DRAFT_KEY);
        sessionStorage.removeItem(AI_TENDER_DRAFT_KEY);
        if (raw) {
          const r = JSON.parse(raw) as AiTenderExtractResult;
          setSessionSeed(mapAiDraftToForm(r.draft, DEFAULT_FORM_VALUES));
          return;
        }
      }
      if (fromProduct) {
        const raw = sessionStorage.getItem(PRODUCT_SEED_KEY);
        sessionStorage.removeItem(PRODUCT_SEED_KEY);
        if (raw) {
          setSessionSeed(mapProductToForm(JSON.parse(raw) as ProductSeed));
          return;
        }
      }
    } catch {
      /* bozuk payload — boş form */
    }
    setSessionSeed(null);
  }, [fromAi, fromProduct]);

  // Şablon: tarih/davetli/tip şablonda saklanmaz (sihirbazdaki kuralla aynı).
  const templateSeed = useMemo<Partial<TenderFormData> | null>(() => {
    if (!templateId || !templates.data) return null;
    const tpl = templates.data.find((t) => t.id === templateId);
    if (!tpl) return null;
    const payload: Partial<TenderFormData> = { ...(tpl.payload as Partial<TenderFormData>) };
    delete payload.bidsCloseAt;
    delete payload.bidsOpenAt;
    delete payload.invitedSupplierIds;
    delete payload.type;
    return payload;
  }, [templateId, templates.data]);

  const copySeed = useMemo<Partial<TenderFormData> | null>(() => {
    if (!fromId || !source.data) return null;
    // Kopya yalnız KENDİ alım talebinden.
    if (!source.data.isOwner || source.data.type !== "ALIM") return null;
    return mapDetailToForm(source.data, { forCopy: true });
  }, [fromId, source.data]);

  const waiting =
    (fromId && source.isLoading) || (templateId && templates.isLoading) || sessionSeed === undefined;
  if (waiting) return null;

  const seed = copySeed ?? templateSeed ?? sessionSeed ?? undefined;
  const key = fromId ? `copy-${fromId}` : templateId ? `tpl-${templateId}` : fromAi ? "ai" : fromProduct ? "product" : "blank";

  return (
    <PageContainer>
      <PageHeader
        title={tr("yeniSatinAlmaTalebi")}
        description={tr("neLazimNereyeNeZamana")}
      />
      <div className="mt-6">
        <QuickRequest key={key} initialValues={seed} />
      </div>
    </PageContainer>
  );
}
