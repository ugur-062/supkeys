"use client";

import { WizardStepper } from "@/components/tenders/wizard-stepper";
import { Button } from "@/components/ui/button";
import {
  useCreateListing,
  type CreateListingInput,
  type CurrencyCode,
} from "@/hooks/use-company-listings";
import {
  DEFAULT_FORM_VALUES,
  STEP_FIELDS,
  tenderFormSchema,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { MissingTargetWarningDialog } from "./missing-target-warning-dialog";
import { PublishConfirmDialog } from "./publish-confirm-dialog";
import { Step1Info } from "./step-1-info";
import { Step2Items } from "./step-2-items";
import { Step3Suppliers } from "./step-3-suppliers";
import { Step4Review } from "./step-4-review";

const STEPS = ["Genel Bilgi", "Kalemler", "Tedarikçiler", "Özet & Yayınla"];

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

export function TenderWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingCount, setMissingCount] = useState(0);

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onTouched",
  });

  const create = useCreateListing();

  const goNext = async () => {
    const stepNo = (step + 1) as 1 | 2 | 3;
    const fields = STEP_FIELDS[stepNo];
    const ok = await form.trigger(fields);
    if (!ok) {
      toast.error("Lütfen zorunlu alanları doldurun");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const goPrev = () => {
    setStep((s) => Math.max(0, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
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
    setPublishOpen(true);
  };

  const doPublish = async () => {
    try {
      const listing = await create.mutateAsync(mapToInput(form.getValues()));
      toast.success("İhale oluşturuldu");
      setPublishOpen(false);
      router.push(`/company/ilan/${listing.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İhale oluşturulamadı"));
    }
  };

  return (
    <FormProvider {...form}>
      <div className="mx-auto max-w-4xl space-y-8 pb-10">
        <div className="mx-auto max-w-3xl">
          <WizardStepper steps={STEPS} current={step} onStepClick={setStep} />
        </div>

        <div className="rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-sm">
          {step === 0 ? <Step1Info /> : null}
          {step === 1 ? <Step2Items /> : null}
          {step === 2 ? <Step3Suppliers /> : null}
          {step === 3 ? (
            <Step4Review onEditStep={(s) => setStep(s - 1)} />
          ) : null}
        </div>

        {/* Navigasyon */}
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={goPrev}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4" />
            Geri
          </Button>

          {step < 3 ? (
            <Button variant="primary" onClick={goNext}>
              İleri
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handlePublishClick}
              loading={create.isPending}
            >
              <Send className="h-4 w-4" />
              İhaleyi Yayınla
            </Button>
          )}
        </div>
      </div>

      <MissingTargetWarningDialog
        open={missingOpen}
        onClose={() => setMissingOpen(false)}
        onContinue={() => {
          setMissingOpen(false);
          setPublishOpen(true);
        }}
        itemsMissingCount={missingCount}
      />
      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={doPublish}
        invitedCount={form.getValues("invitedSupplierIds")?.length ?? 0}
        isSubmitting={create.isPending}
      />
    </FormProvider>
  );
}
