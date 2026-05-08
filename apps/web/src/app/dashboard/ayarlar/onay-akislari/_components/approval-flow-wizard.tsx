"use client";

import { useAuth } from "@/hooks/use-auth";
import {
  useCreateApprovalFlow,
  useUpdateApprovalFlow,
} from "@/hooks/use-approval-flows";
import { useTenantUsers } from "@/hooks/use-tenant-users";
import type { ApprovalFlow } from "@/lib/approval-flows/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ChevronLeft, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  StepDivider,
  StepIndicator,
} from "./step-indicator";
import { Step1FlowInfo } from "../yeni/_components/step-1-flow-info";
import { Step2Steps } from "../yeni/_components/step-2-steps";
import { Step3Summary } from "../yeni/_components/step-3-summary";
import { EMPTY_DRAFT, type FlowDraft } from "./wizard-types";

interface CreateProps {
  mode: "create";
  initial?: undefined;
}

interface EditProps {
  mode: "edit";
  initial: ApprovalFlow;
}

type Props = CreateProps | EditProps;

export function ApprovalFlowWizard(props: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "COMPANY_ADMIN";
  const usersQuery = useTenantUsers();
  const createMutation = useCreateApprovalFlow();
  const updateMutation = useUpdateApprovalFlow();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<FlowDraft>(() => {
    if (props.mode === "edit") {
      return {
        name: props.initial.name,
        description: props.initial.description ?? "",
        type: props.initial.type,
        status: props.initial.status,
        initiatorUserIds: props.initial.initiators.map((i) => i.userId),
        steps: props.initial.steps.map((s) => ({
          orderIndex: s.orderIndex,
          approverUserId: s.approverUserId,
          conditionMinAmount:
            s.conditionMinAmount !== null
              ? Number(s.conditionMinAmount)
              : undefined,
          conditionCurrency: s.conditionCurrency ?? "TRY",
          displayLabel: s.displayLabel ?? undefined,
        })),
      };
    }
    return EMPTY_DRAFT;
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link
          href="/dashboard/ayarlar"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Ayarlar
        </Link>
        <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-6 flex gap-3 items-start">
          <Shield className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-warning-900">
              Sadece Firma Yöneticileri için
            </p>
            <p className="text-sm text-warning-800 mt-1">
              Onay akışı oluşturma yalnızca <strong>Firma Yöneticisi</strong>{" "}
              rolündeki kullanıcılar tarafından yapılabilir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (status: "DRAFT" | "ACTIVE") => {
    if (props.mode === "edit") {
      updateMutation.mutate(
        {
          id: props.initial.id,
          payload: {
            name: draft.name.trim(),
            description: draft.description.trim() || undefined,
            type: draft.type,
            status,
            initiatorUserIds: draft.initiatorUserIds,
            steps: draft.steps.map((s) => ({
              orderIndex: s.orderIndex,
              approverUserId: s.approverUserId,
              conditionMinAmount: s.conditionMinAmount,
              conditionCurrency: s.conditionCurrency,
              displayLabel: s.displayLabel,
            })),
          },
        },
        {
          onSuccess: () => {
            toast.success(
              status === "ACTIVE"
                ? "Akış güncellendi ve aktif edildi"
                : "Akış güncellendi",
            );
            router.push(
              `/dashboard/ayarlar/onay-akislari/${props.initial.id}`,
            );
          },
          onError: (err) =>
            toast.error(extractErrorMessage(err, "Güncelleme başarısız")),
        },
      );
      return;
    }

    createMutation.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        type: draft.type,
        status,
        initiatorUserIds: draft.initiatorUserIds,
        steps: draft.steps.map((s) => ({
          orderIndex: s.orderIndex,
          approverUserId: s.approverUserId,
          conditionMinAmount: s.conditionMinAmount,
          conditionCurrency: s.conditionCurrency,
          displayLabel: s.displayLabel,
        })),
      },
      {
        onSuccess: (created) => {
          toast.success(
            status === "ACTIVE"
              ? "Akış oluşturuldu ve aktif edildi"
              : "Akış taslak olarak kaydedildi",
          );
          router.push(`/dashboard/ayarlar/onay-akislari/${created.id}`);
        },
        onError: (err) =>
          toast.error(extractErrorMessage(err, "Akış oluşturulamadı")),
      },
    );
  };

  const isEdit = props.mode === "edit";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link
        href={
          isEdit
            ? `/dashboard/ayarlar/onay-akislari/${props.initial.id}`
            : "/dashboard/ayarlar/onay-akislari"
        }
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        {isEdit ? "Akış Detayı" : "Onay Akışları"}
      </Link>

      <h1 className="font-display text-2xl font-bold text-brand-900 mb-6">
        {isEdit
          ? `Onay Akışını Düzenle · #${props.initial.flowNumber}`
          : "Onay Akışı Oluştur"}
      </h1>

      <div className="flex items-center justify-center mb-8 flex-wrap gap-y-3">
        <StepIndicator num={1} label="Akış Bilgileri" active={step === 1} done={step > 1} />
        <StepDivider done={step > 1} />
        <StepIndicator num={2} label="Onay Adımları" active={step === 2} done={step > 2} />
        <StepDivider done={step > 2} />
        <StepIndicator num={3} label="Tamamla" active={step === 3} done={false} />
      </div>

      {step === 1 ? (
        <Step1FlowInfo
          draft={draft}
          setDraft={setDraft}
          onCancel={() =>
            router.push(
              isEdit
                ? `/dashboard/ayarlar/onay-akislari/${props.initial.id}`
                : "/dashboard/ayarlar/onay-akislari",
            )
          }
          onNext={() => setStep(2)}
          isEdit={isEdit}
        />
      ) : null}

      {step === 2 ? (
        <Step2Steps
          draft={draft}
          setDraft={setDraft}
          users={usersQuery.data ?? []}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      ) : null}

      {step === 3 ? (
        <Step3Summary
          draft={draft}
          users={usersQuery.data ?? []}
          onBack={() => setStep(2)}
          onSaveDraft={() => handleSubmit("DRAFT")}
          onSaveActive={() => handleSubmit("ACTIVE")}
          loading={isPending}
          isEdit={isEdit}
        />
      ) : null}
    </div>
  );
}
