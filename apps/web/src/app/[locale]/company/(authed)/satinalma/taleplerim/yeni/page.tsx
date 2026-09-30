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
import { appendTermToQuickDraft } from "@/lib/tenders/quick-draft";
import { PRODUCT_SEED_KEY, mapProductToForm, mapSearchTermToForm, type ProductSeed } from "@/lib/tenders/map-product-to-form";
import type { AiTenderExtractResult } from "@rothern/shared";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/**
 * YENİ TALEP — TEK GİRİŞ: HIZLI KART (2026-09-19, kullanıcı kararı: "detaylı
 * sihirbazı kaldır, sistemde görünmesin"). Eskiden kopya (`?from=`), AI belge
 * (`?ai=1`) ve şablon (`?template=`) girişleri ayrı bir sihirbaza yönlenirdi;
 * artık üçü de hızlı kartı DOLU açar. Ürün sayfasından "talebime ekle"
 * (`?urun=1`) yine kalem olarak düşer; "Talep aç" CTA'larının `?q=` terimi
 * de ilk kalem adı olur.
 */
export default function YeniTalepPage() {
  const tr = useTranslations("web.panel.requests.page");
  const params = useSearchParams();
  const fromId = params.get("from") ?? "";
  const fromAi = params.get("ai") === "1";
  const templateId = params.get("template") ?? "";
  const fromProduct = params.get("urun") === "1";
  // Ürün sayfası / dizin "Talep aç" CTA'sı: `?q=` ilk kalem adı olur.
  const searchTerm = (params.get("q") ?? "").trim();

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

  // `?q=` terimi: yarım taslak varsa SİLİNMEZ — terim taslağa kalem olarak
  // eklenir ve kart taslağı geri getirir (LU-30 gözden geçirme). sessionStorage
  // yalnız istemcide okunur → karar efektte, o zamana dek çizim beklenir.
  const termOnly = !!searchTerm && !fromId && !templateId && !fromAi && !fromProduct;
  const [termSeed, setTermSeed] = useState<TenderFormData | null | undefined>(termOnly ? undefined : null);
  useEffect(() => {
    if (!termOnly) {
      setTermSeed(null);
      return;
    }
    setTermSeed(appendTermToQuickDraft(searchTerm, DEFAULT_FORM_VALUES.items[0]!) ? null : mapSearchTermToForm(searchTerm));
  }, [termOnly, searchTerm]);

  const waiting =
    (fromId && source.isLoading) ||
    (templateId && templates.isLoading) ||
    sessionSeed === undefined ||
    termSeed === undefined;
  if (waiting) return null;

  const seed = copySeed ?? templateSeed ?? sessionSeed ?? termSeed ?? undefined;
  const key = fromId
    ? `copy-${fromId}`
    : templateId
      ? `tpl-${templateId}`
      : fromAi
        ? "ai"
        : fromProduct
          ? "product"
          : termSeed
            ? `q-${searchTerm}`
            : "blank";

  return (
    <PageContainer>
      <PageHeader
        title={tr("yeniSatinAlmaTalebi")}
        description={tr("neLazimNereyeNeZamana")}
      />
      <div className="mt-6">
        {/* Kopya ve şablon kendi ticari şartlarını taşır — profil onları ezmez (Y-19). */}
        <QuickRequest key={key} initialValues={seed} seedTerms={!!(copySeed ?? templateSeed)} />
      </div>
    </PageContainer>
  );
}
