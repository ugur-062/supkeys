"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useCreateListing,
  useUpdateListing,
  type CreateListingInput,
  type CurrencyCode,
} from "@/hooks/use-company-listings";
import {
  useListingTemplates,
  useSaveTemplate,
} from "@/hooks/use-listing-templates";
import {
  DEFAULT_FORM_VALUES,
  STEP_FIELDS,
  tenderFormSchema,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { uploadListingDocument } from "@/hooks/use-listing-documents";
import {
  PublishConfirmDialog,
  shouldSkipPublishConfirm,
} from "./publish-confirm-dialog";
import { SaveTemplateDialog } from "./save-template-dialog";
import type { StagedListingDoc } from "./staged-documents";
import type { AiTenderExtractResult } from "@rothern/shared";
import { AiFlagsBanner } from "../ai-import/ai-flags-banner";
import { Step0TypeScope } from "./step-0-type-scope";
import { Step1Info } from "./step-1-info";
import { Step2Items } from "./step-2-items";
import { Step3Suppliers } from "./step-3-suppliers";
import { Step4Review } from "./step-4-review";

function stepMeta(isSatis: boolean) {
  return [
    isSatis
      ? { title: "Tür & Kapsam", desc: "Satış ihalesi türü ve kapsamı" }
      : { title: "Tür & Kapsam", desc: "İhale türü ve kapsamı" },
    { title: "Genel Bilgi", desc: "Kurallar, teslimat, ödeme" },
    { title: "Kalemler", desc: "Ürün / hizmet kalemleri ve kategori" },
    isSatis
      ? { title: "Alıcılar", desc: "Davet edilecekler" }
      : { title: "Tedarikçiler", desc: "Davet edilecekler" },
    { title: "Özet & Yayınla", desc: "Kontrol et ve yayınla" },
  ];
}
const LAST_STEP = 4;

/** Üst adım göstergesi — numara + başlık + açıklama. Mobilde dikey, masaüstünde
 *  5 sütun. Tamamlanan adıma tıklayıp geri dönülebilir. */
function WizardSteps({
  current,
  onStepClick,
  meta,
}: {
  current: number;
  onStepClick: (i: number) => void;
  meta: { title: string; desc: string }[];
}) {
  return (
    <nav aria-label="İhale adımları">
      <ol className="grid grid-cols-1 divide-y divide-zinc-950/10 overflow-hidden rounded-xl border border-zinc-950/10 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {meta.map((s, idx) => {
          const isDone = current > idx;
          const isActive = current === idx;
          const clickable = isDone;
          return (
            <li key={s.title} className={cn(isActive && "bg-brand-50/60")}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(idx)}
                className={cn(
                  "flex h-full w-full items-start gap-3 p-4 text-left transition-colors",
                  clickable && "cursor-pointer hover:bg-zinc-50",
                  !clickable && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    isActive && "bg-brand-600 text-white",
                    isDone && "bg-success-500 text-white",
                    !isActive && !isDone && "bg-zinc-200 text-zinc-500",
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : idx + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-semibold",
                      isActive
                        ? "text-brand-900"
                        : isDone
                          ? "text-zinc-900"
                          : "text-zinc-500",
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-400">
                    {s.desc}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function toIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

/** Form → backend (CreateListingInput) eşlemesi. */
function mapToInput(d: TenderFormData): CreateListingInput {
  const isSatis = d.listingType === "SATIS";
  return {
    type: d.listingType,
    // Format iki yönde de var: ALIM'da RFQ/eksiltme, SATIS'ta RFQ/açık artırma.
    format: d.type,
    priceScope: isSatis ? d.priceScope : undefined,
    minPrice: isSatis && d.priceScope !== "KALEM" ? d.minPrice : undefined,
    buyNowPrice:
      isSatis && d.priceScope !== "KALEM" ? d.buyNowPrice : undefined,
    isInternational: d.isInternational,
    targetCountries: d.isInternational ? d.targetCountries : [],
    deliveryAddressId: d.deliveryAddressId || undefined,
    // "Fatura adresim teslimatla aynı" tiki: fatura adresi teslimat adresinden
    // kopyalanır; tik kaldırıldıysa kullanıcının seçtiği adres gider.
    billingAddressId: d.billingSameAsDelivery
      ? d.deliveryAddressId || undefined
      : d.billingAddressId || undefined,
    // W1: üç görünürlük değeri de geçerli (backend PUBLIC/CONNECTIONS/PRIVATE);
    // eski PUBLIC-veya-PRIVATE collapse'i CONNECTIONS'ı düşürüyordu.
    visibility: d.visibility,
    title: d.title.trim(),
    description: d.description?.trim() || undefined,
    closesAt: toIso(d.bidsCloseAt),
    bidsOpenAt: toIso(d.bidsOpenAt),
    items: d.items.map((it) => ({
      name: it.name.trim(),
      description: it.description?.trim() || undefined,
      quantity: it.quantity,
      unit: it.unit.trim(),
      targetPrice: it.targetUnitPrice,
      minUnitPrice:
        isSatis && d.priceScope === "KALEM" ? it.minUnitPrice : undefined,
      buyNowUnitPrice:
        isSatis && d.priceScope === "KALEM" ? it.buyNowUnitPrice : undefined,
      materialCode: it.materialCode?.trim() || undefined,
      requiredByDate: toIso(it.requiredByDate),
      questions: it.questions?.length
        ? it.questions.map((q) => ({
            text: q.text.trim(),
            answerType: q.answerType,
            required: q.required,
          }))
        : undefined,
    })),
    invitations: d.invitedSupplierIds?.length ? d.invitedSupplierIds : undefined,
    categoryIds: d.categoryIds,
    keywords: d.keywords,
    terms: d.termsAndConditions?.trim() || undefined,
    internalNotes: d.internalNotes?.trim() || undefined,
    requireAllItems: d.requireAllItems,
    requireBidDocument: d.requireBidDocument,
    showTargetToSuppliers: d.showTargetToSuppliers,
    isSealedBid: d.isSealedBid,
    primaryCurrency: d.primaryCurrency as CurrencyCode,
    allowedCurrencies: d.allowedCurrencies as CurrencyCode[],
    deliveryTerm: d.deliveryTerm,
    // Ödeme planı — zamanlama gönderilmez, backend plandan türetir (Faz 2).
    paymentCategory: d.paymentCategory,
    advancePercent: d.advancePercent,
    paymentDays: d.paymentDays,
    lcType: d.lcType,
    lcConfirmed: d.lcConfirmed,
    paymentNote: d.paymentNote?.trim() || undefined,
    requireGuaranteeLetter: d.requireGuaranteeLetter,
    isLogistics: d.isLogistics,
    logistics: d.isLogistics ? (d.logistics as Record<string, unknown>) : undefined,
    bidVisibility: d.bidVisibility,
    decimalPlaces: d.decimalPlaces,
    autoExtendOnLateBid: d.autoExtendOnLateBid,
    autoExtendThresholdMin: d.autoExtendThresholdMin,
    autoExtendByMinutes: d.autoExtendByMinutes,
  };
}

export function TenderWizard({
  mode = "create",
  listingId,
  initialValues,
  listingType = "ALIM",
  aiImport,
}: {
  mode?: "create" | "edit";
  listingId?: string;
  initialValues?: TenderFormData;
  /** SATIS: satış ihalesi — format adımı yok, taban/hemen-al fiyat var. */
  listingType?: "ALIM" | "SATIS";
  /** Faz AI-1 — form AI ile belgeden doldurulduysa çıkarım sonucu (bant + refine). */
  aiImport?: AiTenderExtractResult;
} = {}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  // Faz AI-1 UX: AI doldurma sonrasında da 1. adımdan ("Tür & Kapsam")
  // başlanır — yurtiçi/uluslararası seçimi bilinçli bir kullanıcı kararı,
  // belgeden her zaman güvenilir çıkarılamaz; adım atlanırsa sessizce
  // "yurtiçi" varsayılmış olur.
  const [step, setStep] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  // Create modunda seçilen ihale dökümanları — ilan kaydedilince yüklenir
  // (edit modunda FilesTab doğrudan yükler, staging gerekmez).
  const [stagedDocs, setStagedDocs] = useState<StagedListingDoc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  // Faz AI-1 — refine sonrası güncel çıkarım sonucu (bant içeriği).
  const [aiResult, setAiResult] = useState<AiTenderExtractResult | undefined>(
    aiImport,
  );

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: initialValues ?? { ...DEFAULT_FORM_VALUES, listingType },
    mode: "onTouched",
  });
  // Yön form değerinden CANLI türetilir — şablon yüklemesi listingType'ı
  // değiştirebilir; başlık/adım/çıkış rotası statik prop'a bağlanamaz.
  const isSatis = form.watch("listingType") === "SATIS";
  // Adım değişiminde başlığa odak — klavye/ekran okuyucu yeni adımı duysun.
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const create = useCreateListing();
  const update = useUpdateListing(listingId ?? "");
  const submitting = (isEdit ? update.isPending : create.isPending) || docsUploading;

  /**
   * Staged dökümanları yeni oluşan ilana sırayla yükler. Başarısız olanlar
   * ilanı engellemez — kullanıcı Düzenle ekranından tamamlayabilir.
   */
  const uploadStagedDocs = async (newListingId: string) => {
    if (stagedDocs.length === 0) return;
    setDocsUploading(true);
    let failed = 0;
    try {
      for (const d of stagedDocs) {
        try {
          await uploadListingDocument(newListingId, d.file, d.kind);
        } catch {
          failed += 1;
        }
      }
    } finally {
      setDocsUploading(false);
    }
    if (failed > 0) {
      toast.warning(
        `${failed} döküman yüklenemedi — Düzenle ekranından tekrar ekleyebilirsiniz`,
      );
    }
  };
  const templates = useListingTemplates();
  const saveTemplate = useSaveTemplate();

  const loadTemplate = (id: string) => {
    if (!id) return;
    const tpl = (templates.data ?? []).find((t) => t.id === id);
    if (!tpl) return;
    // Tarih/davetliler şablonda saklanmaz; yön mevcut sihirbazın yönünde kalır.
    // `type` da uygulanmaz: format artık sihirbazda seçilmez (İngiliz usulüne
    // tek geçiş yolu "Yeni Tur") — eski auction şablonu formatı ezmesin.
    const {
      bidsCloseAt: _c,
      bidsOpenAt: _o,
      invitedSupplierIds: _i,
      listingType: _t,
      type: _ty,
      ...payload
    } = tpl.payload as Partial<TenderFormData>;
    form.reset({
      ...DEFAULT_FORM_VALUES,
      ...payload,
      listingType: form.getValues("listingType"),
      type: form.getValues("type"),
    });
    setStep(0);
    toast.success(`"${tpl.name}" şablonu yüklendi`);
  };

  const handleSaveTemplate = async (name: string) => {
    try {
      // Dialog metniyle tutarlı: kapanış/açılış tarihi ve davetliler her
      // ihalede yeniden seçilir — şablona YAZILMAZ.
      const {
        bidsCloseAt: _c,
        bidsOpenAt: _o,
        invitedSupplierIds: _i,
        ...payload
      } = form.getValues();
      await saveTemplate.mutateAsync({ name, payload });
      toast.success(`"${name}" şablonu kaydedildi`);
      setTemplateOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şablon kaydedilemedi"));
    }
  };

  const goNext = async () => {
    const stepNo = (step + 1) as 1 | 2 | 3 | 4;
    const fields = STEP_FIELDS[stepNo];
    const ok = await form.trigger(fields);
    if (!ok) {
      toast.error("Lütfen zorunlu alanları doldurun");
      return;
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const goPrev = () => {
    setStep((s) => Math.max(0, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  // Üstteki geri tuşu: wizard'da bir adım geri; ilk adımda çıkar.
  const goBackOrExit = () => {
    if (step > 0) goPrev();
    else if (isEdit && listingId) router.push(`/company/ilan/${listingId}`);
    else
      router.push(
        isSatis ? "/company/satis/ilanlarim" : "/company/satinalma/ihalelerim",
      );
  };

  // Yayınla'ya basınca doğrudan publish-confirm. Hedef fiyat opsiyoneldir —
  // eksikse uyarı ÇIKMAZ (kullanıcı kararı, 2026-07-11); bütçe-eşikli onay
  // zinciri hedef fiyatsız tetiklenmeyebilir, bu bilinçli kabul edildi.
  const handlePublishClick = async () => {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Eksik/hatalı alanlar var — adımları kontrol et");
      return;
    }
    if (isEdit) {
      void doSubmit();
      return;
    }
    // "Bir daha gösterme" işaretlenmişse onay diyaloğu atlanır, direkt yayın.
    if (shouldSkipPublishConfirm()) {
      void doSubmit();
      return;
    }
    setPublishOpen(true);
  };

  const handleSaveDraft = async () => {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Eksik/hatalı alanlar var — adımları kontrol et");
      return;
    }
    try {
      const listing = await create.mutateAsync({
        ...mapToInput(form.getValues()),
        asDraft: true,
      });
      await uploadStagedDocs(listing.id);
      toast.success("Taslak kaydedildi");
      router.push(`/company/ilan/${listing.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Taslak kaydedilemedi"));
    }
  };

  const doSubmit = async () => {
    const input = mapToInput(form.getValues());
    if (isEdit && listingId) {
      try {
        await update.mutateAsync(input);
        toast.success("İhale güncellendi");
        router.push(`/company/ilan/${listingId}`);
      } catch (err) {
        toast.error(extractErrorMessage(err, "İhale güncellenemedi"));
      }
      return;
    }
    try {
      const listing = await create.mutateAsync(input);
      await uploadStagedDocs(listing.id);
      toast.success("İhale oluşturuldu");
      setPublishOpen(false);
      router.push(`/company/ilan/${listing.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İhale oluşturulamadı"));
    }
  };

  return (
    <FormProvider {...form}>
      <div className="space-y-6 pb-12">
        {/* Üst bar: geri tuşu (wizard) + şablon kontrolleri */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBackOrExit}
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {step > 0 ? "Geri" : isSatis ? "Satış İlanlarım" : "İhaleler"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {templates.data && templates.data.length > 0 ? (
              <select
                defaultValue=""
                onChange={(e) => loadTemplate(e.target.value)}
                className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm shadow-sm focus:outline-none"
                aria-label="Şablondan yükle"
              >
                <option value="">Şablondan Yükle…</option>
                {templates.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button variant="secondary" onClick={() => setTemplateOpen(true)}>
              Şablon Olarak Kaydet
            </Button>
          </div>
        </div>

        {/* Başlık */}
        <div ref={headingRef} tabIndex={-1} className="outline-none">
          <Heading>
            {isEdit
              ? isSatis
                ? "Satış İhalesini Düzenle"
                : "İhaleyi Düzenle"
              : isSatis
                ? "Yeni Satış İhalesi"
                : "Yeni İhale"}
          </Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            {isEdit
              ? "Değişiklikleri yapıp kaydedin. Teklif geldikten sonra düzenlenemez."
              : "Adımları tamamlayıp ihaleyi yayınlayın."}
          </Text>
        </div>

        {/* Üstte adım göstergesi */}
        <WizardSteps current={step} onStepClick={setStep} meta={stepMeta(isSatis)} />

        {/* Faz AI-1 — AI doldurma bandı (işaretli alanlar + refine) */}
        {aiResult ? (
          <AiFlagsBanner result={aiResult} onResult={setAiResult} />
        ) : null}

        {/* İçerik */}
        <div className="min-w-0 pt-2">
          {step === 0 ? <Step0TypeScope /> : null}
          {step === 1 ? (
            <Step1Info
              listingId={listingId}
              stagedDocs={stagedDocs}
              onStagedDocsChange={setStagedDocs}
            />
          ) : null}
          {step === 2 ? <Step2Items /> : null}
          {step === 3 ? <Step3Suppliers /> : null}
          {step === 4 ? (
            <Step4Review
              onEditStep={(s) => setStep(s)}
              stagedDocsCount={isEdit ? undefined : stagedDocs.length}
            />
          ) : null}

          {/* Alt navigasyon */}
          <div className="mt-10 flex items-center justify-between border-t border-zinc-950/10 pt-6">
            <Button variant="secondary" onClick={goPrev} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" />
              Geri
            </Button>

            {step < LAST_STEP ? (
              <Button variant="primary" onClick={goNext}>
                Devam Et
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                {!isEdit ? (
                  <Button
                    variant="secondary"
                    onClick={handleSaveDraft}
                    loading={create.isPending}
                  >
                    Taslak Kaydet
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={handlePublishClick}
                  loading={submitting}
                >
                  <Send className="h-4 w-4" />
                  {isEdit ? "Değişiklikleri Kaydet" : "İhaleyi Yayınla"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={doSubmit}
        invitedCount={form.getValues("invitedSupplierIds")?.length ?? 0}
        isSubmitting={submitting}
        isSatis={isSatis}
      />
      <SaveTemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSave={handleSaveTemplate}
        isSaving={saveTemplate.isPending}
        defaultName={form.getValues("title") || ""}
      />
    </FormProvider>
  );
}
