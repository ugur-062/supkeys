"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import {
  useApprovalHistory,
  useCancelApproval,
  useDecideApproval,
  usePendingApprovals,
  type ApprovalHistoryItem,
  type PendingApproval,
} from "@/hooks/use-company-approvals";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  MinusCircle,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const TYPE_LABEL: Record<PendingApproval["type"], string> = {
  LISTING_PUBLISH: "İlan Yayını",
  LISTING_AWARD: "Kazandırma",
};

const REQ_STATUS: Record<
  ApprovalHistoryItem["status"],
  { label: string; color: "amber" | "green" | "rose" | "zinc" }
> = {
  PENDING: { label: "Bekliyor", color: "amber" },
  APPROVED: { label: "Onaylandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "rose" },
  CANCELLED: { label: "İptal Edildi", color: "zinc" },
};

function ListingTypeBadge({ type }: { type: string }) {
  const isAlim = type === "ALIM";
  return (
    <Badge color={isAlim ? "blue" : "emerald"}>
      {isAlim ? "Alım" : "Satış"}
    </Badge>
  );
}

/** Adım zaman çizelgesi — kim, hangi sırada, ne karar verdi. */
function StepsTimeline({ steps }: { steps: ApprovalHistoryItem["steps"] }) {
  return (
    <ol className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3">
      {steps.map((s) => {
        const icon =
          s.status === "APPROVED" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : s.status === "REJECTED" ? (
            <XCircle className="h-4 w-4 text-rose-500" />
          ) : s.status === "SKIPPED" ? (
            <MinusCircle className="h-4 w-4 text-zinc-300" />
          ) : (
            <Circle
              className={cn(
                "h-4 w-4",
                s.status === "PENDING" ? "text-amber-500" : "text-zinc-300",
              )}
            />
          );
        return (
          <li key={s.order} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0">
              <span className="font-medium text-zinc-800">
                {s.order}. {s.approverName}
              </span>
              <span className="ml-1.5 text-zinc-500">
                {s.status === "APPROVED"
                  ? "onayladı"
                  : s.status === "REJECTED"
                    ? "reddetti"
                    : s.status === "SKIPPED"
                      ? "atlandı (bütçe eşiği)"
                      : s.status === "PENDING"
                        ? "karar bekleniyor"
                        : "sırada"}
                {s.decidedAt
                  ? ` · ${format(new Date(s.decidedAt), "d MMM HH:mm", { locale: tr })}`
                  : ""}
              </span>
              {s.note ? (
                <span className="block text-zinc-500">Not: {s.note}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
      <ClipboardCheck className="mx-auto h-8 w-8 text-zinc-300" />
      <p className="mt-2 text-sm text-zinc-500">{text}</p>
    </div>
  );
}

export default function OnaylarPage() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const { data: pending, isLoading: pendingLoading } = usePendingApprovals();
  const { data: history, isLoading: historyLoading } = useApprovalHistory();
  const decide = useDecideApproval();
  const cancel = useCancelApproval();
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<PendingApproval | null>(null);

  const approve = async (p: PendingApproval) => {
    if (
      !(await confirm({
        title: "İsteği onayla",
        description: `"${p.listing.title}" için ${TYPE_LABEL[p.type].toLocaleLowerCase("tr")} isteği onaylansın mı? ${
          p.currentStepOrder === p.totalSteps
            ? "Bu son adım — işlem hemen uygulanır."
            : "Sonraki onaycıya geçilir."
        }`,
        confirmLabel: "Onayla",
      }))
    )
      return;
    try {
      await decide.mutateAsync({ id: p.id, action: "approve" });
      toast.success("Onaylandı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const submitReject = async (reason: string) => {
    if (!rejecting) return;
    try {
      await decide.mutateAsync({
        id: rejecting.id,
        action: "reject",
        note: reason.trim() || undefined,
      });
      toast.success("Reddedildi");
      setRejecting(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const cancelRequest = async (h: ApprovalHistoryItem) => {
    if (
      !(await confirm({
        title: "Onay isteğini iptal et",
        description: `"${h.listing.title}" için başlattığın onay isteği iptal edilsin mi? İlan eski durumuna döner.`,
        confirmLabel: "İptal Et",
        destructive: true,
      }))
    )
      return;
    try {
      await cancel.mutateAsync(h.id);
      toast.success("Onay isteği iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    }
  };

  const tabs = [
    { key: "pending" as const, label: `Onayım Bekleyenler (${pending?.length ?? 0})` },
    { key: "history" as const, label: "Geçmiş & Taleplerim" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Heading>Onaylar</Heading>
        <Text className="mt-1 text-sm text-zinc-500">
          İlan yayını ve kazandırma istekleri — sırası sende olanlar ile
          başlattığın/karara bağlanan istekler.
        </Text>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-zinc-950/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        pendingLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !pending || pending.length === 0 ? (
          <EmptyState text="Bekleyen onay yok — sana yönlendirilen istekler burada görünür." />
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-zinc-950/10 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        color={p.type === "LISTING_AWARD" ? "purple" : "amber"}
                      >
                        {TYPE_LABEL[p.type]}
                      </Badge>
                      <ListingTypeBadge type={p.listing.type} />
                      <span className="font-mono text-[11px] text-zinc-400">
                        {p.listing.number ?? "—"}
                      </span>
                    </div>
                    <Link
                      href={`/company/ilan/${p.listing.id}`}
                      className="mt-1 block truncate font-medium text-zinc-950 hover:text-blue-600 hover:underline"
                    >
                      {p.listing.title}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500">
                      Tutar:{" "}
                      <strong>
                        {p.amount.toLocaleString("tr-TR")} {p.currency}
                      </strong>
                      <span className="mx-1.5 text-zinc-300">·</span>
                      Adım {p.currentStepOrder}/{p.totalSteps}
                      <span className="mx-1.5 text-zinc-300">·</span>
                      {format(new Date(p.createdAt), "d MMM yyyy HH:mm", {
                        locale: tr,
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      plain
                      onClick={() => setRejecting(p)}
                      disabled={decide.isPending}
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                      Reddet
                    </Button>
                    <Button onClick={() => approve(p)} disabled={decide.isPending}>
                      <CheckCircle2 className="h-4 w-4" />
                      Onayla
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : historyLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !history || history.length === 0 ? (
        <EmptyState text="Henüz geçmiş yok — başlattığın ve karara bağlanan istekler burada görünür." />
      ) : (
        <div className="space-y-3">
          {history.map((h) => {
            const st = REQ_STATUS[h.status];
            return (
              <div
                key={h.id}
                className="rounded-xl border border-zinc-950/10 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        color={h.type === "LISTING_AWARD" ? "purple" : "amber"}
                      >
                        {TYPE_LABEL[h.type]}
                      </Badge>
                      <ListingTypeBadge type={h.listing.type} />
                      <Badge color={st.color}>{st.label}</Badge>
                      {h.mine ? <Badge color="zinc">Talebim</Badge> : null}
                    </div>
                    <Link
                      href={`/company/ilan/${h.listing.id}`}
                      className="mt-1 block truncate font-medium text-zinc-950 hover:text-blue-600 hover:underline"
                    >
                      {h.listing.title}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500">
                      {h.createdBy}
                      <span className="mx-1.5 text-zinc-300">·</span>
                      {h.amount.toLocaleString("tr-TR")} {h.currency}
                      <span className="mx-1.5 text-zinc-300">·</span>
                      {format(new Date(h.createdAt), "d MMM yyyy HH:mm", {
                        locale: tr,
                      })}
                      {h.decidedAt
                        ? ` → ${format(new Date(h.decidedAt), "d MMM HH:mm", { locale: tr })}`
                        : ""}
                    </div>
                  </div>
                  {h.mine && h.status === "PENDING" ? (
                    <Button
                      plain
                      onClick={() => cancelRequest(h)}
                      disabled={cancel.isPending}
                    >
                      İptal Et
                    </Button>
                  ) : null}
                </div>
                <StepsTimeline steps={h.steps} />
              </div>
            );
          })}
        </div>
      )}

      <ReasonDialog
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        onSubmit={submitReject}
        title="İsteği reddet"
        description="Ret gerekçesi isteği başlatana iletilir (opsiyonel)."
        confirmLabel="Reddet"
        destructive
        pending={decide.isPending}
      />
    </div>
  );
}
