"use client";

import { Button } from "@/components/ui/button";
import { useUploadAttachment } from "@/hooks/use-attachments";
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
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { MissingTargetWarningDialog } from "./missing-target-warning-dialog";
import { PublishConfirmDialog } from "./publish-confirm-dialog";
import { Step1Info } from "./step-1-info";
import { Step2Items } from "./step-2-items";
import { Step3Suppliers } from "./step-3-suppliers";
import { Step4Review } from "./step-4-review";
import { WizardStepper } from "./stepper";

type WizardStep = 1 | 2 | 3 | 4;

interface Props {
  mode: "create" | "edit";
  /**
   * edit mode'da: backend'den gelen mevcut DRAFT'ı form'a yükler (id zorunlu).
   * create mode'da: "İhaleyi Kopyala" akışında kaynak tender'dan kopyalanmış
   * form değerleri (id verilmez, çünkü yeni tender oluşturulur).
   */
  initialData?: TenderFormData & { id?: string };
}

export function TenderWizard({ mode, initialData }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<WizardStep>(1);
  const [publishOpen, setPublishOpen] = useState(false);
  const [missingTargetWarningOpen, setMissingTargetWarningOpen] =
    useState(false);
  const [itemsMissingTarget, setItemsMissingTarget] = useState(0);

  // V2-7 — Landing'den ?type=auction ile gelmişse İngiliz Usulü ön-seçili
  const defaults = useMemo<TenderFormData>(() => {
    if (initialData) return initialData;
    const urlType = searchParams.get("type");
    if (urlType === "auction") {
      return { ...DEFAULT_FORM_VALUES, type: "ENGLISH_AUCTION" };
    }
    return DEFAULT_FORM_VALUES;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: defaults,
    mode: "onTouched",
  });

  /**
   * V2-2 — Step 1'de eklenen dosyalar `File[]` olarak burada stage edilir.
   * Save Draft veya Yayınla'dan sonra tender id alınınca paralel R2'ye
   * yüklenir.
   */
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const createMutation = useCreateTender();
  const updateMutation = useUpdateTender(initialData?.id ?? "");
  const publishMutation = usePublishTender();
  const uploadMutation = useUploadAttachment("tenant");

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    publishMutation.isPending ||
    isUploadingFiles;

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

  /**
   * Tender oluştuktan sonra staged dosyaları paralel R2'ye yükle.
   * Best-effort: hata olan dosyalar atlanır, kullanıcıya toast ile bildirilir.
   * Tender create başarılı olduktan sonra çağrılır — dönen değer atılan
   * dosya sayısı.
   */
  const uploadStagedFiles = async (tenderId: string): Promise<number> => {
    if (stagedFiles.length === 0) return 0;
    setIsUploadingFiles(true);
    try {
      const results = await Promise.allSettled(
        stagedFiles.map((file) =>
          uploadMutation.mutateAsync({
            scope: "TENDER_DOC",
            scopeRefId: tenderId,
            file,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(
          `${failed} dosya yüklenemedi. Detay sayfasından tekrar deneyebilirsiniz.`,
        );
      }
      return stagedFiles.length - failed;
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleSaveDraft = form.handleSubmit(
    async (values) => {
      try {
        const saved =
          mode === "create"
            ? await createMutation.mutateAsync(values)
            : await updateMutation.mutateAsync(values);

        const uploaded = await uploadStagedFiles(saved.id);

        toast.success(
          mode === "create"
            ? `Taslak oluşturuldu: ${saved.tenderNumber}${uploaded > 0 ? ` · ${uploaded} dosya yüklendi` : ""}`
            : `Taslak güncellendi${uploaded > 0 ? ` · ${uploaded} dosya yüklendi` : ""}`,
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

        const uploaded = await uploadStagedFiles(saved.id);

        const result = await publishMutation.mutateAsync(saved.id);
        const status = (result as { status?: string } | undefined)?.status;
        const fileNote = uploaded > 0 ? ` · ${uploaded} dosya yüklendi` : "";
        if (status === "IN_APPROVAL") {
          const apr = (result as { approvalNumber?: string }).approvalNumber;
          toast.success(
            `Onay sürecine alındı${apr ? ` — ${apr}` : ""}${fileNote}`,
          );
        } else {
          toast.success(`İhale yayınlandı: ${saved.tenderNumber}${fileNote}`);
        }
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

  /**
   * Yayınla butonuna basıldığında önce hedef fiyatı eksik kalemleri kontrol et.
   * Eksik varsa warning modal göster; "Yine de Yayınla" derse asıl publish dialog açılır.
   */
  const checkAndOpenPublish = () => {
    const items = form.getValues("items") ?? [];
    const missing = items.filter((it) => {
      const t = it.targetUnitPrice;
      if (t === null || t === undefined) return true;
      const num = Number(t);
      return !Number.isFinite(num) || num <= 0;
    }).length;

    if (missing > 0) {
      setItemsMissingTarget(missing);
      setMissingTargetWarningOpen(true);
      return;
    }
    setPublishOpen(true);
  };

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
          {step === 1 ? (
            <Step1Info
              stagedFiles={stagedFiles}
              setStagedFiles={setStagedFiles}
            />
          ) : null}
          {step === 2 ? <Step2Items /> : null}
          {step === 3 ? <Step3Suppliers /> : null}
          {step === 4 ? (
            <Step4Review
              onEditStep={(s) => setStep(s)}
              stagedFiles={stagedFiles}
            />
          ) : null}
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
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  isUploadingFiles
                }
                disabled={isSubmitting}
              >
                <Save className="w-4 h-4" />
                Taslak Olarak Kaydet
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={checkAndOpenPublish}
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

      <MissingTargetWarningDialog
        open={missingTargetWarningOpen}
        onClose={() => setMissingTargetWarningOpen(false)}
        onContinue={() => setPublishOpen(true)}
        itemsMissingCount={itemsMissingTarget}
      />
    </FormProvider>
  );
}
