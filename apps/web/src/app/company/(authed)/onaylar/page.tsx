"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { ApprovalFlowsSection } from "@/app/company/(authed)/ayarlar/_components/approval-flows-section";
import {
  useAllApprovals,
  useApprovalHistory,
  useCancelApproval,
  useDecideApproval,
  usePendingApprovals,
  type ApprovalHistoryItem,
  type PendingApproval,
} from "@/hooks/use-company-approvals";
import {
  EmptyState as SharedEmptyState,
  ListSkeleton,
} from "@/components/list";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  MinusCircle,
  Plus,
  Search,
  Workflow,
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
      {isAlim ? "Alış" : "Satış"}
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
                {s.displayLabel ? (
                  <span className="font-normal text-zinc-500">
                    {" "}
                    ({s.displayLabel})
                  </span>
                ) : null}
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

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white">
      <SharedEmptyState
        icon={ClipboardCheck}
        title={text}
        variant="no-results"
      />
    </div>
  );
}

/** Sorgu hatası — yanıltıcı "boş" durumu yerine gerçek hata + yeniden dene. */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center"
    >
      <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" aria-hidden />
      <p className="mt-3 text-sm font-medium text-rose-900">
        Kayıtlar yüklenemedi
      </p>
      <p className="mt-1 text-sm text-rose-700/80">
        Bağlantı sorunu olabilir. Lütfen yeniden deneyin.
      </p>
      <Button className="mt-4" outline onClick={onRetry}>
        Yeniden Dene
      </Button>
    </div>
  );
}

/** Geçmiş / Tüm Süreçler ortak istek kartı. */
function RequestCard({
  h,
  canCancel,
  onCancel,
  cancelPending,
}: {
  h: ApprovalHistoryItem;
  canCancel: boolean;
  onCancel: (h: ApprovalHistoryItem) => void;
  /** Yalnız BU kart iptal edilirken true — tüm listeyi kilitlemez. */
  cancelPending: boolean;
}) {
  const st = REQ_STATUS[h.status];
  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {h.requestNo ? (
              <span className="font-mono text-xs font-semibold text-zinc-500">
                {h.requestNo}
              </span>
            ) : null}
            <Badge color={h.type === "LISTING_AWARD" ? "purple" : "amber"}>
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
            {h.status === "PENDING" ? (
              <>
                Adım {h.currentStepOrder}/{h.totalSteps}
                {h.currentApprover ? ` — şu an: ${h.currentApprover}` : ""}
                <span className="mx-1.5 text-zinc-300">·</span>
              </>
            ) : null}
            {format(new Date(h.createdAt), "d MMM yyyy HH:mm", { locale: tr })}
            {h.decidedAt
              ? ` → ${format(new Date(h.decidedAt), "d MMM HH:mm", { locale: tr })}`
              : ""}
          </div>
          {h.initiatorNote ? (
            <p className="mt-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">
              <span className="font-semibold text-zinc-500">
                Başlatan notu:
              </span>{" "}
              {h.initiatorNote}
            </p>
          ) : null}
        </div>
        {canCancel && h.status === "PENDING" ? (
          <Button plain onClick={() => onCancel(h)} disabled={cancelPending}>
            {cancelPending ? "İptal ediliyor…" : "İptal Et"}
          </Button>
        ) : null}
      </div>
      <StepsTimeline steps={h.steps} />
    </div>
  );
}

type OnaylarTab = "pending" | "history" | "all" | "flows";

export default function OnaylarPage() {
  const [tab, setTab] = useState<OnaylarTab>("pending");
  const { user } = useCompanyAuth();
  const isManager =
    !!user &&
    (user.isOwner ||
      user.roles.includes("SAHIP") ||
      user.roles.includes("YONETICI"));
  const canManageFlows = useHasCompanyPermission("approvals:manage");
  // Üst "Yeni Onay Akışı" butonu → flows sekmesine geçer + sihirbazı açar.
  // Boolean "intent" + consume: bölüm remount olduğunda (sekmeye tekrar
  // girildiğinde) sihirbaz KENDİLİĞİNDEN açılmasın diye tüketilince sıfırlanır.
  const [openNewFlow, setOpenNewFlow] = useState(false);

  const {
    data: pending,
    isLoading: pendingLoading,
    isError: pendingError,
    refetch: refetchPending,
  } = usePendingApprovals();
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useApprovalHistory();

  // Tüm Süreçler filtreleri — arama debounce'lı (her tuşta refetch etmesin).
  const [fltStatus, setFltStatus] = useState("");
  const [fltType, setFltType] = useState("");
  const [fltSearch, setFltSearch] = useState("");
  const debouncedSearch = useDebouncedValue(fltSearch.trim(), 300);
  const {
    data: all,
    isLoading: allLoading,
    isError: allError,
    refetch: refetchAll,
  } = useAllApprovals({
    status: fltStatus || undefined,
    type: fltType || undefined,
    search: debouncedSearch || undefined,
  });

  const decide = useDecideApproval();
  const cancel = useCancelApproval();
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<PendingApproval | null>(null);
  // Hangi kart işlem görüyor — buton kilidi/spinner yalnız o karta uygulanır
  // (paylaşılan isPending tüm listeyi kilitlemesin).
  const [actingId, setActingId] = useState<string | null>(null);

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
    setActingId(p.id);
    try {
      await decide.mutateAsync({ id: p.id, action: "approve" });
      toast.success("Onaylandı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    } finally {
      setActingId(null);
    }
  };

  const submitReject = async (reason: string) => {
    if (!rejecting) return;
    setActingId(rejecting.id);
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
    } finally {
      setActingId(null);
    }
  };

  const cancelRequest = async (h: ApprovalHistoryItem) => {
    if (
      !(await confirm({
        title: "Onay isteğini iptal et",
        description: `"${h.listing.title}" için onay isteği iptal edilsin mi? İlan eski durumuna döner.`,
        confirmLabel: "İptal Et",
        destructive: true,
      }))
    )
      return;
    setActingId(h.id);
    try {
      await cancel.mutateAsync(h.id);
      toast.success("Onay isteği iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    } finally {
      setActingId(null);
    }
  };

  const tabs: { key: OnaylarTab; label: string }[] = [
    { key: "pending", label: `Sıra Sizde (${pending?.length ?? 0})` },
    { key: "history", label: "Geçmiş & Taleplerim" },
    { key: "all", label: "Tüm Süreçler" },
    ...(canManageFlows
      ? [{ key: "flows" as const, label: "Onay Akışları" }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading>Onaylar</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            Kazandırma onay süreçleri — sırası sende olanlar, taleplerin ve
            firmadaki tüm süreçler. Akışları buradan tanımlarsın.
          </Text>
        </div>
        {/* §9: aynı birincil aksiyon ekranda bir kez — flows sekmesi kendi
            CTA'sını taşır, üstteki yalnız diğer sekmelerde görünür. */}
        {canManageFlows && tab !== "flows" ? (
          <Button
            onClick={() => {
              setOpenNewFlow(true);
              setTab("flows");
            }}
          >
            <Plus className="size-4" aria-hidden />
            Yeni Onay Akışı
          </Button>
        ) : null}
      </div>

      {/* Sekmeler */}
      <div
        role="tablist"
        aria-label="Onay görünümleri"
        className="flex gap-1 overflow-x-auto border-b border-zinc-950/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`onaylar-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`onaylar-panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.key === "flows" ? <Workflow className="size-4" aria-hidden /> : null}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        <div
          role="tabpanel"
          id="onaylar-panel-pending"
          aria-labelledby="onaylar-tab-pending"
        >
        {pendingLoading ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={4} /></div>
        ) : pendingError ? (
          <ErrorState onRetry={() => refetchPending()} />
        ) : !pending || pending.length === 0 ? (
          <Empty text="Bekleyen onay yok — sana yönlendirilen istekler burada görünür." />
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
                      {p.requestNo ? (
                        <span className="font-mono text-xs font-semibold text-zinc-500">
                          {p.requestNo}
                        </span>
                      ) : null}
                      <Badge
                        color={p.type === "LISTING_AWARD" ? "purple" : "amber"}
                      >
                        {TYPE_LABEL[p.type]}
                      </Badge>
                      <ListingTypeBadge type={p.listing.type} />
                      <span className="tabular-nums text-xs text-zinc-400">
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
                      {p.createdBy} başlattı
                      <span className="mx-1.5 text-zinc-300">·</span>
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
                    {p.initiatorNote ? (
                      <p className="mt-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">
                        <span className="font-semibold text-zinc-500">
                          Başlatan notu:
                        </span>{" "}
                        {p.initiatorNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      plain
                      onClick={() => setRejecting(p)}
                      disabled={decide.isPending && actingId === p.id}
                    >
                      <XCircle className="h-4 w-4 text-red-500" aria-hidden />
                      Reddet
                    </Button>
                    <Button
                      onClick={() => approve(p)}
                      disabled={decide.isPending && actingId === p.id}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      {decide.isPending && actingId === p.id
                        ? "Onaylanıyor…"
                        : "Onayla"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div
          role="tabpanel"
          id="onaylar-panel-history"
          aria-labelledby="onaylar-tab-history"
        >
        {historyLoading ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={4} /></div>
        ) : historyError ? (
          <ErrorState onRetry={() => refetchHistory()} />
        ) : !history || history.length === 0 ? (
          <Empty text="Henüz geçmiş yok — başlattığın ve karara bağlanan istekler burada görünür." />
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <RequestCard
                key={h.id}
                h={h}
                canCancel={h.mine || isManager}
                onCancel={cancelRequest}
                cancelPending={cancel.isPending && actingId === h.id}
              />
            ))}
          </div>
        )}
        </div>
      ) : null}

      {tab === "all" ? (
        <div
          role="tabpanel"
          id="onaylar-panel-all"
          aria-labelledby="onaylar-tab-all"
          className="space-y-4"
        >
          {/* Filtreler — eski sistem paritesi: durum / tür / arama */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <Input
                value={fltSearch}
                onChange={(e) => setFltSearch(e.target.value)}
                placeholder="Onay no / ihale ara…"
                aria-label="Onay no veya ihale ara"
                className="w-full pl-8"
              />
            </div>
            <Select
              value={fltStatus}
              onChange={(e) => setFltStatus(e.target.value)}
              aria-label="Duruma göre filtrele"
              className="max-w-40"
            >
              <option value="">Tüm durumlar</option>
              <option value="PENDING">Bekliyor</option>
              <option value="APPROVED">Onaylandı</option>
              <option value="REJECTED">Reddedildi</option>
              <option value="CANCELLED">İptal Edildi</option>
            </Select>
            <Select
              value={fltType}
              onChange={(e) => setFltType(e.target.value)}
              aria-label="Türe göre filtrele"
              className="max-w-40"
            >
              <option value="">Tüm türler</option>
              <option value="LISTING_AWARD">Kazandırma</option>
              <option value="LISTING_PUBLISH">İlan Yayını (eski)</option>
            </Select>
          </div>
          {allLoading ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={4} /></div>
          ) : allError ? (
            <ErrorState onRetry={() => refetchAll()} />
          ) : !all || all.length === 0 ? (
            <Empty text="Kayıt bulunamadı — firmadaki tüm onay süreçleri burada listelenir." />
          ) : (
            <div className="space-y-3">
              {all.map((h) => (
                <RequestCard
                  key={h.id}
                  h={h}
                  canCancel={h.mine || isManager}
                  onCancel={cancelRequest}
                  cancelPending={cancel.isPending && actingId === h.id}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "flows" && canManageFlows ? (
        <div
          role="tabpanel"
          id="onaylar-panel-flows"
          aria-labelledby="onaylar-tab-flows"
        >
          <ApprovalFlowsSection
            canManage={canManageFlows}
            openNew={openNewFlow}
            onConsumeOpenNew={() => setOpenNewFlow(false)}
          />
        </div>
      ) : null}

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
