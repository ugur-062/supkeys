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
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { MissingTargetWarningDialog } from "./missing-target-warning-dialog";
import { PublishConfirmDialog } from "./publish-confirm-dialog";
import { SaveTemplateDialog } from "./save-template-dialog";
import { Step0TypeScope } from "./step-0-type-scope";
import { Step1Info } from "./step-1-info";
import { Step2Items } from "./step-2-items";
import { Step3Suppliers } from "./step-3-suppliers";
import { Step4Review } from "./step-4-review";

const STEP_META = [
  { title: "Tür & Kapsam", desc: "İhale türü ve kapsamı" },
  { title: "Genel Bilgi", desc: "Kategori, kurallar, teslimat, ödeme" },
  { title: "Kalemler", desc: "Ürün / hizmet kalemleri" },
  { title: "Tedarikçiler", desc: "Davet edilecekler" },
  { title: "Özet & Yayınla", desc: "Kontrol et ve yayınla" },
];
const LAST_STEP = STEP_META.length - 1; // 4

/** Üst adım göstergesi — numara + başlık + açıklama. Mobilde dikey, masaüstünde
 *  5 sütun. Tamamlanan adıma tıklayıp geri dönülebilir. */
function WizardSteps({
  current,
  onStepClick,
}: {
  current: number;
  onStepClick: (i: number) => void;
}) {
  return (
    <nav aria-label="İhale adımları">
      <ol className="grid grid-cols-1 divide-y divide-zinc-950/10 overflow-hidden rounded-xl border border-zinc-950/10 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {STEP_META.map((s, idx) => {
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
  return {
    type: "ALIM",
    format: d.type, // RFQ / ENGLISH_AUCTION
    isInternational: d.isInternational,
    targetCountries: d.isInternational ? d.targetCountries : [],
    visibility: d.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
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
    isSealedBid: d.isSealedBid,
    primaryCurrency: d.primaryCurrency as CurrencyCode,
    allowedCurrencies: d.allowedCurrencies as CurrencyCode[],
    deliveryTerm: d.deliveryTerm,
    paymentTerm: d.paymentTerm,
    paymentDays: d.paymentDays,
    paymentTiming: d.paymentTiming,
    isLogistics: d.isLogistics,
    logistics: d.isLogistics ? (d.logistics as Record<string, unknown>) : undefined,
    bidVisibility: d.bidVisibility,
    priceDecrementType: d.priceDecrementType,
    priceDecrementValue: d.priceDecrementValue,
    priceDecrementBasis: d.priceDecrementBasis,
    decimalPlaces: d.decimalPlaces,
    sendClosingReminder: d.sendClosingReminder,
    reminderMinutesBefore: d.reminderMinutesBefore,
    autoExtendOnLateBid: d.autoExtendOnLateBid,
    autoExtendThresholdMin: d.autoExtendThresholdMin,
    autoExtendByMinutes: d.autoExtendByMinutes,
  };
}

export function TenderWizard({
  mode = "create",
  listingId,
  initialValues,
}: {
  mode?: "create" | "edit";
  listingId?: string;
  initialValues?: TenderFormData;
} = {}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [step, setStep] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingCount, setMissingCount] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: initialValues ?? DEFAULT_FORM_VALUES,
    mode: "onTouched",
  });

  const create = useCreateListing();
  const update = useUpdateListing(listingId ?? "");
  const submitting = isEdit ? update.isPending : create.isPending;
  const templates = useListingTemplates();
  const saveTemplate = useSaveTemplate();

  const loadTemplate = (id: string) => {
    if (!id) return;
    const tpl = (templates.data ?? []).find((t) => t.id === id);
    if (!tpl) return;
    form.reset({
      ...DEFAULT_FORM_VALUES,
      ...(tpl.payload as Partial<TenderFormData>),
    });
    setStep(0);
    toast.success(`"${tpl.name}" şablonu yüklendi`);
  };

  const handleSaveTemplate = async (name: string) => {
    try {
      await saveTemplate.mutateAsync({ name, payload: form.getValues() });
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
    else router.push("/company/satinalma/ihalelerim");
  };

  // Yayınla'ya basınca: hedef fiyatsız kalem uyarısı → publish-confirm.
  const handlePublishClick = async () => {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Eksik/hatalı alanlar var — adımları kontrol et");
      return;
    }
    const items = form.getValues("items");
    const missing = items.filter((i) => i.targetUnitPrice == null).length;
    if (missing > 0) {
      setMissingCount(missing);
      setMissingOpen(true);
      return;
    }
    if (isEdit) {
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
            {step > 0 ? "Geri" : "İhaleler"}
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
        <div>
          <Heading>{isEdit ? "İhaleyi Düzenle" : "Yeni İhale"}</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            {isEdit
              ? "Değişiklikleri yapıp kaydedin. Teklif geldikten sonra düzenlenemez."
              : "Adımları tamamlayıp ihaleyi yayınlayın."}
          </Text>
        </div>

        {/* Üstte adım göstergesi */}
        <WizardSteps current={step} onStepClick={setStep} />

        {/* İçerik */}
        <div className="min-w-0 pt-2">
          {step === 0 ? <Step0TypeScope /> : null}
          {step === 1 ? <Step1Info /> : null}
          {step === 2 ? <Step2Items /> : null}
          {step === 3 ? <Step3Suppliers /> : null}
          {step === 4 ? <Step4Review onEditStep={(s) => setStep(s)} /> : null}

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

      <MissingTargetWarningDialog
        open={missingOpen}
        onClose={() => setMissingOpen(false)}
        onContinue={() => {
          setMissingOpen(false);
          if (isEdit) void doSubmit();
          else setPublishOpen(true);
        }}
        itemsMissingCount={missingCount}
      />
      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={doSubmit}
        invitedCount={form.getValues("invitedSupplierIds")?.length ?? 0}
        isSubmitting={submitting}
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
