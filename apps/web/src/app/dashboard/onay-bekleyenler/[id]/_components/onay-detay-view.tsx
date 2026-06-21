"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  useApproveRequest,
  useCancelRequest,
  useRejectRequest,
} from "@/hooks/use-approval-requests";
import {
  APPROVAL_TYPE_LABEL,
  formatAmountTR,
} from "@/lib/approval-requests/labels";
import type {
  ApprovalRequestDetail,
  ApprovalRequestStep,
} from "@/lib/approval-requests/types";
import { tenderStatusLabel } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import axios from "axios";
import { format, formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  CircleSlash,
  Clock,
  ExternalLink,
  Send,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  ApprovalStatusBadge,
  ApprovalTypeBadge,
} from "../../_components/status-badge";
import { CancelModal } from "./cancel-modal";
import { DecisionModal } from "./decision-modal";

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function OnayDetayView({
  request,
}: {
  request: ApprovalRequestDetail;
}) {
  const { user } = useAuth();
  const router = useRouter();

  const myPendingStep = request.steps.find(
    (s) => s.status === "PENDING" && s.approverUserId === user?.id,
  );
  const isInitiator = request.initiatedBy.id === user?.id;
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const canCancel =
    request.status === "PENDING" && (isInitiator || isCompanyAdmin);

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  const cancelMutation = useCancelRequest();

  const [decisionMode, setDecisionMode] = useState<"approve" | "reject" | null>(
    null,
  );
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleDecision = (note: string) => {
    if (!decisionMode) return;
    const fn = decisionMode === "approve" ? approveMutation : rejectMutation;
    fn.mutate(
      { id: request.id, note: note || undefined },
      {
        onSuccess: () => {
          toast.success(
            decisionMode === "approve"
              ? "Onaylandı, sıradaki adıma geçildi."
              : "Reddedildi.",
          );
          setDecisionMode(null);
          router.refresh();
        },
        onError: (err) =>
          toast.error(
            getErrorMessage(err, "İşlem gerçekleştirilemedi"),
          ),
      },
    );
  };

  const handleCancel = (reason: string) => {
    cancelMutation.mutate(
      { id: request.id, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success("Onay süreci iptal edildi");
          setCancelOpen(false);
          router.refresh();
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "İptal edilemedi")),
      },
    );
  };

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/dashboard/onay-bekleyenler"
          className="text-sm text-slate-500 hover:text-brand-600 inline-flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Onay Süreçleri
        </Link>

        {/* Üst Bilgi Kartı */}
        <section className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                Onay Süreci
              </p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-semibold text-brand-900">
                  {request.approvalNumber}
                </h1>
                <ApprovalStatusBadge status={request.status} />
                <ApprovalTypeBadge type={request.type} />
              </div>
              <p className="text-sm text-slate-600 mt-1.5">
                {request.tender.title}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {myPendingStep ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setDecisionMode("reject")}
                    className="!text-danger-700 hover:!bg-danger-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reddet
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setDecisionMode("approve")}
                    className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Onayla
                  </Button>
                </>
              ) : null}

              {canCancel && !myPendingStep ? (
                <Button
                  variant="ghost"
                  onClick={() => setCancelOpen(true)}
                  className="!text-warning-700 hover:!bg-warning-50"
                >
                  <Ban className="w-4 h-4" />
                  Onayı İptal Et
                </Button>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm border-t border-surface-border pt-5">
            <DetailField
              label="Onay Türü"
              value={APPROVAL_TYPE_LABEL[request.type]}
            />
            <DetailField
              label="Akış"
              value={`#${request.flow.flowNumber} · ${request.flow.name}`}
            />
            <DetailField
              label="Toplam Tutar"
              value={formatAmountTR(request.amount, request.currency)}
              emphasized
            />
            <DetailField
              label="İşlemi Yapan"
              value={`${request.initiatedBy.firstName} ${request.initiatedBy.lastName}`}
            />
            <DetailField
              label="Başlangıç"
              value={format(
                new Date(request.startedAt),
                "dd.MM.yyyy HH:mm",
                { locale: tr },
              )}
            />
            {request.completedAt ? (
              <DetailField
                label="Tamamlandı"
                value={format(
                  new Date(request.completedAt),
                  "dd.MM.yyyy HH:mm",
                  { locale: tr },
                )}
              />
            ) : (
              <DetailField
                label="Geçen Süre"
                value={formatDistanceToNowStrict(new Date(request.startedAt), {
                  locale: tr,
                  addSuffix: false,
                })}
              />
            )}
          </dl>

          {request.initiatorNote ? (
            <div className="mt-5 pt-5 border-t border-surface-border">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1.5">
                Açıklama
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {request.initiatorNote}
              </p>
            </div>
          ) : null}
        </section>

        {/* Onay Tarihçesi */}
        <section className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg text-brand-900">
              Onay Tarihçesi
            </h2>
          </div>

          <ol className="mt-1">
            {/* İşlem (gönderim) düğümü */}
            <HistoryNode
              icon={<Send className="h-4 w-4" />}
              iconWrap="bg-zinc-900 text-white"
              title={
                <>
                  <strong className="text-zinc-900">
                    {request.initiatedBy.firstName}{" "}
                    {request.initiatedBy.lastName}
                  </strong>{" "}
                  <span className="text-zinc-600">onaya gönderdi</span>
                </>
              }
              date={format(new Date(request.startedAt), "dd.MM.yyyy HH:mm", {
                locale: tr,
              })}
              note={request.initiatorNote}
              isLast={request.steps.length === 0}
            />

            {request.steps.map((step, i) => (
              <StepNode
                key={step.id}
                step={step}
                isLast={i === request.steps.length - 1}
              />
            ))}
          </ol>
        </section>

        {/* İhale Özeti */}
        <section className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                İhale
              </p>
              <h3 className="font-semibold text-lg text-brand-900 mt-1">
                {request.tender.title}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="font-mono">{request.tender.tenderNumber}</span>
              </p>
            </div>

            <Link href={`/dashboard/ihaleler/${request.tender.id}`}>
              <Button variant="secondary" size="sm">
                <ExternalLink className="w-4 h-4" />
                İhale Detayını Aç
              </Button>
            </Link>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm border-t border-surface-border pt-4">
            <DetailField
              label="Statü"
              value={tenderStatusLabel(request.tender.status)}
            />
            <DetailField
              label="Para Birimi"
              value={request.tender.primaryCurrency}
            />
            <DetailField
              label="Oluşturan"
              value={
                request.tender.createdBy
                  ? `${request.tender.createdBy.firstName} ${request.tender.createdBy.lastName}`
                  : "—"
              }
            />
            <DetailField
              label="Davet Edilen"
              value={`${request.tender.invitations.length} tedarikçi`}
            />
          </dl>

          {request.tender.invitations.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-surface-border">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
                Davetli Tedarikçiler
              </p>
              <ul className="flex flex-wrap gap-2">
                {request.tender.invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-surface-border text-xs"
                  >
                    <Building2 className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-700">
                      {inv.supplier.companyName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {request.tender.items.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-surface-border">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
                Kalemler ({request.tender._count.items})
              </p>
              <ul className="space-y-1">
                {request.tender.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm border-b border-surface-border/60 last:border-0 py-1.5"
                  >
                    <span className="text-slate-700 truncate">
                      <span className="text-slate-400 mr-1">
                        {item.orderIndex}.
                      </span>
                      {item.name}
                    </span>
                    <span className="text-slate-500 whitespace-nowrap text-xs">
                      {Number(item.quantity).toLocaleString("tr-TR")}{" "}
                      {item.unit}
                      {item.targetUnitPrice
                        ? ` · hedef ${formatAmountTR(
                            item.targetUnitPrice,
                            request.tender.primaryCurrency,
                          )}`
                        : ""}
                    </span>
                  </li>
                ))}
                {request.tender._count.items > request.tender.items.length ? (
                  <li className="text-xs text-slate-500 italic pt-1">
                    +
                    {request.tender._count.items - request.tender.items.length}{" "}
                    kalem daha
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <DecisionModal
        mode={decisionMode ?? "approve"}
        open={decisionMode !== null}
        onClose={() => setDecisionMode(null)}
        onConfirm={handleDecision}
        loading={approveMutation.isPending || rejectMutation.isPending}
      />

      <CancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        loading={cancelMutation.isPending}
        approvalType={request.type}
      />
    </>
  );
}

function DetailField({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-brand-900 truncate",
          emphasized ? "text-base font-semibold" : "font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function HistoryNode({
  icon,
  iconWrap,
  title,
  subLabel,
  date,
  note,
  isLast,
  muted,
}: {
  icon: React.ReactNode;
  iconWrap: string;
  title: React.ReactNode;
  subLabel?: string | null;
  date?: string | null;
  note?: string | null;
  isLast?: boolean;
  muted?: boolean;
}) {
  return (
    <li className={cn("relative flex gap-3 pb-5 last:pb-0", muted && "opacity-70")}>
      {!isLast ? (
        <span className="absolute bottom-0 left-[15px] top-9 w-px bg-zinc-200" />
      ) : null}
      <div
        className={cn(
          "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          iconWrap,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm">{title}</p>
        {subLabel ? (
          <p className="mt-0.5 text-xs text-zinc-500">{subLabel}</p>
        ) : null}
        {note ? (
          <p className="mt-1.5 whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-700">
            {note}
          </p>
        ) : null}
        {date ? <p className="mt-1 text-xs text-zinc-400">{date}</p> : null}
      </div>
    </li>
  );
}

function StepNode({
  step,
  isLast,
}: {
  step: ApprovalRequestStep;
  isLast: boolean;
}) {
  const name = `${step.approver.firstName} ${step.approver.lastName}`;
  let icon: React.ReactNode;
  let iconWrap = "bg-zinc-100 text-zinc-500";
  let title: React.ReactNode;

  if (step.status === "APPROVED") {
    icon = <CheckCircle2 className="h-4 w-4" />;
    iconWrap = "bg-success-100 text-success-600";
    title = (
      <>
        <strong className="text-zinc-900">{name}</strong>{" "}
        <span className="text-success-700">onayladı</span>
      </>
    );
  } else if (step.status === "REJECTED") {
    icon = <XCircle className="h-4 w-4" />;
    iconWrap = "bg-danger-100 text-danger-600";
    title = (
      <>
        <strong className="text-zinc-900">{name}</strong>{" "}
        <span className="text-danger-700">reddetti</span>
      </>
    );
  } else if (step.status === "PENDING") {
    icon = <Clock className="h-4 w-4" />;
    iconWrap = "bg-warning-100 text-warning-600";
    title = (
      <>
        <strong className="text-zinc-900">{name}</strong>{" "}
        <span className="text-warning-700">onayı bekleniyor</span>
      </>
    );
  } else if (step.status === "WAITING") {
    icon = <CircleDashed className="h-4 w-4" />;
    title = (
      <>
        <strong className="text-zinc-700">{name}</strong>{" "}
        <span className="text-zinc-500">sırada bekliyor</span>
      </>
    );
  } else {
    icon = <CircleSlash className="h-4 w-4" />;
    iconWrap = "bg-zinc-50 text-zinc-300";
    title = (
      <span className="italic text-zinc-500">
        {name} — eşik karşılanmadı, atlandı
      </span>
    );
  }

  return (
    <HistoryNode
      icon={icon}
      iconWrap={iconWrap}
      title={title}
      subLabel={step.displayLabel}
      date={
        step.decidedAt
          ? format(new Date(step.decidedAt), "dd.MM.yyyy HH:mm", { locale: tr })
          : null
      }
      note={step.decisionNote}
      isLast={isLast}
      muted={step.status === "SKIPPED"}
    />
  );
}
