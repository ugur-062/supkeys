"use client";

import { Button } from "@/components/ui/button";
import {
  useChangeApprovalFlowStatus,
  useDeleteApprovalFlow,
  useDuplicateApprovalFlow,
} from "@/hooks/use-approval-flows";
import {
  APPROVAL_FLOW_STATUS_META,
  APPROVAL_FLOW_TYPE_META,
  formatAmountTR,
} from "@/lib/approval-flows/labels";
import type { ApprovalFlow } from "@/lib/approval-flows/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { roleLabel } from "@/lib/users/labels";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ChevronLeft,
  Copy,
  Pencil,
  Power,
  Trash2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApprovalFlowWizard } from "../../_components/approval-flow-wizard";
import { useState } from "react";

export function ApprovalFlowDetailView({ flow }: { flow: ApprovalFlow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const changeStatus = useChangeApprovalFlowStatus();
  const duplicate = useDuplicateApprovalFlow();
  const remove = useDeleteApprovalFlow();

  if (editing) {
    return <ApprovalFlowWizard mode="edit" initial={flow} />;
  }

  const typeMeta = APPROVAL_FLOW_TYPE_META[flow.type];
  const statusMeta = APPROVAL_FLOW_STATUS_META[flow.status];

  const onToggleStatus = () => {
    const next = flow.status === "ACTIVE" ? "PASSIVE" : "ACTIVE";
    changeStatus.mutate(
      { id: flow.id, status: next },
      {
        onSuccess: () =>
          toast.success(
            next === "ACTIVE" ? "Akış aktifleştirildi" : "Akış pasif yapıldı",
          ),
        onError: (err) =>
          toast.error(extractErrorMessage(err, "Durum değiştirilemedi")),
      },
    );
  };

  const onDuplicate = () => {
    duplicate.mutate(flow.id, {
      onSuccess: (created) => {
        toast.success("Akış kopyalandı");
        router.push(`/dashboard/ayarlar/onay-akislari/${created.id}`);
      },
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Kopyalama başarısız")),
    });
  };

  const onDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `"${flow.name}" akışını silmek istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    remove.mutate(flow.id, {
      onSuccess: () => {
        toast.success("Akış silindi");
        router.push("/dashboard/ayarlar/onay-akislari");
      },
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Silme başarısız")),
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link
        href="/dashboard/ayarlar/onay-akislari"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Onay Akışları
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Workflow className="h-5 w-5 text-brand-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-slate-500">
                #{flow.flowNumber}
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                  typeMeta.pillClass,
                )}
              >
                {typeMeta.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-semibold",
                  flow.status === "ACTIVE"
                    ? "text-success-700"
                    : flow.status === "DRAFT"
                      ? "text-warning-700"
                      : "text-slate-600",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    statusMeta.dotClass,
                  )}
                />
                {statusMeta.label}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-brand-900 mt-1">
              {flow.name}
            </h1>
            {flow.description ? (
              <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                {flow.description}
              </p>
            ) : null}
            <p className="text-xs text-slate-500 mt-2">
              {flow.createdBy.firstName} {flow.createdBy.lastName} oluşturdu ·{" "}
              Son güncelleme:{" "}
              {format(new Date(flow.updatedAt), "d MMM yyyy HH:mm", {
                locale: tr,
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Düzenle
          </Button>
          <Button
            variant="secondary"
            onClick={onToggleStatus}
            loading={changeStatus.isPending}
            className={
              flow.status === "ACTIVE"
                ? "!text-warning-700 !border-warning-200 hover:!bg-warning-50"
                : "!text-success-700 !border-success-200 hover:!bg-success-50"
            }
          >
            <Power className="h-4 w-4" />
            {flow.status === "ACTIVE" ? "Pasif Yap" : "Aktif Et"}
          </Button>
          <Button
            variant="secondary"
            onClick={onDuplicate}
            loading={duplicate.isPending}
          >
            <Copy className="h-4 w-4" />
            Kopyala
          </Button>
          <Button
            variant="secondary"
            onClick={onDelete}
            loading={remove.isPending}
            className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
          >
            <Trash2 className="h-4 w-4" />
            Sil
          </Button>
        </div>
      </div>

      {/* Kazandırmayı Yapan Kişiler */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <h3 className="font-bold text-brand-900 text-sm mb-3">
          Kazandırmayı Yapan Kişiler ({flow.initiators.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {flow.initiators.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Tanımlı yok</p>
          ) : (
            flow.initiators.map((init) => (
              <span
                key={init.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-50 text-zinc-800 border border-zinc-200 text-sm"
              >
                <span className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {(init.user.firstName?.[0] ?? "?").toUpperCase()}
                  {(init.user.lastName?.[0] ?? "").toUpperCase()}
                </span>
                <span className="font-semibold">
                  {init.user.firstName} {init.user.lastName}
                </span>
                <span className="text-[11px] text-zinc-600">
                  · {roleLabel(init.user.role)}
                </span>
              </span>
            ))
          )}
        </div>
      </section>

      {/* Onay Adımları */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-bold text-brand-900 text-sm mb-3">
          Onay Adımları ({flow.steps.length})
        </h3>
        <ol className="space-y-2">
          {flow.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
            >
              <div className="h-9 w-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold flex-shrink-0">
                {step.orderIndex}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brand-900">
                  {step.displayLabel
                    ? `${step.displayLabel} — `
                    : `Adım ${step.orderIndex}: `}
                  {step.approver.firstName} {step.approver.lastName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {step.approver.email} · {roleLabel(step.approver.role)}
                </p>
                {step.conditionMinAmount &&
                Number(step.conditionMinAmount) > 0 ? (
                  <p className="text-xs text-warning-700 mt-1">
                    Koşul:{" "}
                    {formatAmountTR(
                      step.conditionMinAmount,
                      step.conditionCurrency,
                    )}{" "}
                    ve üstü
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 italic mt-1">
                    Tüm tutarlar için aktif
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
