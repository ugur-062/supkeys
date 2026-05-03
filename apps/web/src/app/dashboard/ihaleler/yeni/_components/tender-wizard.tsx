"use client";

import { Button } from "@/components/ui/button";
import {
  useCreateTender,
  usePublishTender,
  useUpdateTender,
} from "@/hooks/use-tenant-tenders";
import {
  DEFAULT_FORM_VALUES,
  STEP_FIELDS,
  tenderFormSchema,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { PublishConfirmDialog } from "./publish-confirm-dialog";
import { Step1Info } from "./step-1-info";
import { Step2Items } from "./step-2-items";
import { Step3Suppliers } from "./step-3-suppliers";
import { Step4Review } from "./step-4-review";
import { WizardStepper } from "./stepper";

type WizardStep = 1 | 2 | 3 | 4;

interface Props {
  mode: "create" | "edit";
  /** edit mode'da var: backend'den gelen mevcut DRAFT'ı form'a yükler */
  initialData?: TenderFormData & { id: string };
}

export function TenderWizard({ mode, initialData }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [publishOpen, setPublishOpen] = useState(false);

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: initialData ?? DEFAULT_FORM_VALUES,
    mode: "onTouched",
  });

  const createMutation = useCreateTender();
  const updateMutation = useUpdateTender(initialData?.id ?? "");
  const publishMutation = usePublishTender();

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    publishMutation.isPending;

  const validateStepAndNext = async (currentStep: 1 | 2 | 3) => {
    const fields = STEP_FIELDS[currentStep];
    const ok = await form.trigger(fields);
    if (!ok) {
      toast.error("Lütfen zorunlu alanları doldurun");
      return;
    }
    setStep((currentStep + 1) as WizardStep);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const goPrev = () => {
    if (step > 1) setStep((step - 1) as WizardStep);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const handleSaveDraft = form.handleSubmit(
    async (values) => {
      try {
        const saved =
          mode === "create"
            ? await createMutation.mutateAsync(values)
            : await updateMutation.mutateAsync(values);
        toast.success(
          mode === "create"
            ? `Taslak oluşturuldu: ${saved.tenderNumber}`
            : "Taslak güncellendi",
        );
        router.push(`/dashboard/ihaleler/${saved.id}`);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Taslak kaydedilemedi"));
      }
    },
    () => toast.error("Lütfen tüm zorunlu alanları kontrol edin"),
  );

  const handlePublish = form.handleSubmit(
    async (values) => {
      try {
        const saved =
          mode === "create"
            ? await createMutation.mutateAsync(values)
            : await updateMutation.mutateAsync(values);

        await publishMutation.mutateAsync(saved.id);
        toast.success(`İhale yayınlandı: ${saved.tenderNumber}`);
        router.push(`/dashboard/ihaleler/${saved.id}`);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Yayınlama başarısız"));
      } finally {
        setPublishOpen(false);
      }
    },
    () => {
      toast.error("Yayınlamadan önce tüm alanları doldurun");
      setPublishOpen(false);
    },
  );

  const invitedCount = form.watch("invitedSupplierIds")?.length ?? 0;

  return (
    <FormProvider {...form}>
      <div className="max-w-5xl mx-auto space-y-6 pb-24">
        <header>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
            {mode === "create" ? "Yeni İhale Aç" : "İhaleyi Düzenle"}
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            {mode === "create"
              ? "Adım adım ihale oluşturma sihirbazı."
              : "Taslak halindeki ihaleyi güncelleyin."}
          </p>
        </header>

        <div className="flex justify-center">
          <WizardStepper current={step} />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-7">
          {step === 1 ? <Step1Info /> : null}
          {step === 2 ? <Step2Items /> : null}
          {step === 3 ? <Step3Suppliers /> : null}
          {step === 4 ? <Step4Review onEditStep={(s) => setStep(s)} /> : null}
        </div>

        {/* Sticky footer navigation */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-slate-200 -mx-4 md:-mx-8 px-4 md:px-8 py-4 flex items-center justify-between gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <Button
            type="button"
            variant="secondary"
            onClick={goPrev}
            disabled={step === 1 || isSubmitting}
          >
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>

          {step < 4 ? (
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                validateStepAndNext(step as 1 | 2 | 3)
              }
              disabled={isSubmitting}
            >
              İleri
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveDraft}
                loading={
                  createMutation.isPending || updateMutation.isPending
                }
                disabled={isSubmitting}
              >
                <Save className="w-4 h-4" />
                Taslak Olarak Kaydet
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => setPublishOpen(true)}
                disabled={isSubmitting || invitedCount === 0}
                title={
                  invitedCount === 0
                    ? "Yayınlamak için en az 1 tedarikçi seçmelisiniz"
                    : undefined
                }
              >
                <Send className="w-4 h-4" />
                Yayınla
              </Button>
            </div>
          )}
        </div>
      </div>

      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => handlePublish()}
        invitedCount={invitedCount}
        isSubmitting={isSubmitting}
      />
    </FormProvider>
  );
}
