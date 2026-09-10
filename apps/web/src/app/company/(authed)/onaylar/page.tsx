"use client";

import { userHasPermission } from "@/lib/company/permissions";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { ApprovalFlowsSection } from "@/app/company/(authed)/onaylar/_components/approval-flows-section";
import { ApprovalDetailPanel } from "@/components/company/approval-detail-panel";
import {
  useAllApprovals,
  useCancelApproval,
  useDecideApproval,
  usePendingApprovals,
  type ApprovalHistoryItem,
  type PendingApproval,
} from "@/hooks/use-company-approvals";
import { EmptyState as SharedEmptyState, ListSkeleton, SearchInput } from "@/components/list";
import { extractErrorMessage } from "@/lib/tenders/error";
import { currencySymbol } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  MinusCircle,
  Workflow,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * ONAYLAR — SADE DÜZEN (2026-09-10, kullanıcı: "çok karışık, fazla bölüm var").
 *
 * Eskiden 4 sekme (Sıra Sizde · Geçmiş & Taleplerim · Tüm Süreçler · Onay
 * Akışları) ve kartta 5-6 rozet + hep açık adım çizelgesi vardı. Şimdi:
 *  · İKİ görünüm: "Sıra sizde" (karar bekleyenler) ve "Tüm istekler"
 *    (Geçmiş + Tüm Süreçler BİRLEŞTİ — aynı kart iki listede çıkıyordu;
 *    `all` ucu sayfa kapısıyla aynı yetkiyi ister, `history` artık çağrılmaz).
 *    "Tüm istekler"de çipler istemcide süzer (Bekleyen / Başlattıklarım /
 *    Sonuçlanan), arama sunucuda.
 *  · Onay akışları sekme DEĞİL — başlıktaki tek düğmeyle kendi görünümüne
 *    açılır (`?tab=flows`, içerik `ApprovalFlowsSection` aynen).
 *  · Kart: tek satır başlık + tek satır bilgi + (varsa) başlatan notu;
 *    adım çizelgesi katlanır (varsayılan kapalı). Kaldırılan: "Alış/Satış"
 *    rozeti (satış ilanı kalktı, hep "Alış" yazıyordu), çift talep numarası,
 *    "Talebim" rozeti (çip var), ayrı durum/tür seçicileri.
 */

const TYPE_LABEL: Record<PendingApproval["type"], string> = {
  LISTING_PUBLISH: "İlan yayını",
  LISTING_AWARD: "Kazandırma",
};

const REQ_STATUS: Record<ApprovalHistoryItem["status"], { label: string; color: "amber" | "green" | "rose" | "zinc" }> = {
  PENDING: { label: "Bekliyor", color: "amber" },
  APPROVED: { label: "Onaylandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "rose" },
  CANCELLED: { label: "İptal edildi", color: "zinc" },
};

const money = (amount: number, currency: string) => `${amount.toLocaleString("tr-TR")} ${currencySymbol(currency)}`;

/** Adım zaman çizelgesi — kim, hangi sırada, ne karar verdi. */
function StepsTimeline({ steps }: { steps: ApprovalHistoryItem["steps"] }) {
  return (
    <ol className="mt-2 space-y-1.5">
      {steps.map((s) => {
        const icon =
          s.status === "APPROVED" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : s.status === "REJECTED" ? (
            <XCircle className="h-4 w-4 text-rose-500" />
          ) : s.status === "SKIPPED" ? (
            <MinusCircle className="h-4 w-4 text-zinc-300" />
          ) : (
            <Circle className={cn("h-4 w-4", s.status === "PENDING" ? "text-amber-500" : "text-zinc-300")} />
          );
        const verb =
          s.status === "APPROVED"
            ? "onayladı"
            : s.status === "REJECTED"
              ? "reddetti"
              : s.status === "SKIPPED"
                ? "atlandı (bütçe eşiği)"
                : s.status === "PENDING"
                  ? "karar bekleniyor"
                  : "sırada";
        return (
          <li key={s.order} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0">
              <span className="font-medium text-zinc-800">
                {s.order}. {s.approverName}
                {s.displayLabel ? <span className="font-normal text-zinc-500"> ({s.displayLabel})</span> : null}
              </span>
              <span className="ml-1.5 text-zinc-500">
                {verb}
                {s.decidedAt ? ` · ${formatDate(s.decidedAt, "datetime")}` : ""}
              </span>
              {s.note ? <span className="block text-zinc-500">Not: {s.note}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card">
      <SharedEmptyState icon={ClipboardCheck} title={text} variant="no-results" />
    </div>
  );
}

/** Sorgu hatası — yanıltıcı "boş" durumu yerine gerçek hata + yeniden dene. */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" aria-hidden />
      <p className="mt-3 text-sm font-medium text-rose-900">Kayıtlar yüklenemedi</p>
      <p className="mt-1 text-sm text-rose-700/80">Bağlantı sorunu olabilir. Lütfen yeniden deneyin.</p>
      <Button className="mt-4" outline onClick={onRetry}>
        Yeniden Dene
      </Button>
    </div>
  );
}

/** Başlık satırı — talep adı (izinliye bağlantı) + sağda durum. */
function CardTitle({
  listing,
  canOpenListing,
  right,
}: {
  listing: { id: string; title: string };
  canOpenListing: boolean;
  right: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      {canOpenListing ? (
        <Link
          href={`/company/ilan/${listing.id}`}
          className="min-w-0 truncate text-[15px] font-semibold text-zinc-950 hover:text-blue-600 hover:underline"
        >
          {listing.title}
        </Link>
      ) : (
        <p className="min-w-0 truncate text-[15px] font-semibold text-zinc-950">{listing.title}</p>
      )}
      <div className="shrink-0">{right}</div>
    </div>
  );
}

/** Tek bilgi satırı: no · tür · tutar · başlatan · tarih. Tür yalnız eski "İlan yayını" ise yazılır. */
function Meta({ parts }: { parts: (string | null | undefined)[] }) {
  return (
    <p className="mt-1 text-xs text-zinc-500">
      {parts.filter(Boolean).map((p, i) => (
        <span key={i}>
          {i > 0 ? <span className="mx-1.5 text-zinc-300">·</span> : null}
          {p}
        </span>
      ))}
    </p>
  );
}

function InitiatorNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">
      <span className="font-semibold text-zinc-500">Başlatan notu:</span> {note}
    </p>
  );
}

/** SIRA SİZDE kartı — karar verilecek istek. */
function DecideCard({
  p,
  canOpenListing,
  busy,
  detailOpen,
  onToggleDetail,
  onApprove,
  onReject,
}: {
  p: PendingApproval;
  canOpenListing: boolean;
  busy: boolean;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
      <CardTitle
        listing={p.listing}
        canOpenListing={canOpenListing}
        right={
          <Badge color="amber">
            Adım {p.currentStepOrder}/{p.totalSteps}
          </Badge>
        }
      />
      <Meta
        parts={[
          p.requestNo,
          p.type === "LISTING_PUBLISH" ? TYPE_LABEL[p.type] : null,
          money(p.amount, p.currency),
          `${p.createdBy} başlattı`,
          formatDate(p.createdAt, "datetime"),
        ]}
      />
      <InitiatorNote note={p.initiatorNote} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-950/5 pt-3">
        <button
          type="button"
          aria-expanded={detailOpen}
          aria-controls={`onay-detay-${p.id}`}
          onClick={onToggleDetail}
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-950"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition", detailOpen && "rotate-180")} />
          {detailOpen ? "Detayı gizle" : "Detay — kazanan, rekabet, kalemler"}
        </button>
        <div className="flex items-center gap-2">
          <Button plain onClick={onReject} disabled={busy}>
            <XCircle className="h-4 w-4 text-red-500" aria-hidden />
            Reddet
          </Button>
          <Button onClick={onApprove} disabled={busy}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {busy ? "Onaylanıyor…" : "Onayla"}
          </Button>
        </div>
      </div>
      {detailOpen ? (
        <div id={`onay-detay-${p.id}`} className="mt-4 border-t border-zinc-950/5 pt-4">
          <ApprovalDetailPanel id={p.id} />
        </div>
      ) : null}
    </div>
  );
}

/** TÜM İSTEKLER kartı — durum, sıradaki onaycı, katlanır adımlar, bekleyense iptal. */
function RequestCard({
  h,
  canCancel,
  onCancel,
  cancelPending,
  canOpenListing,
}: {
  h: ApprovalHistoryItem;
  canCancel: boolean;
  onCancel: (h: ApprovalHistoryItem) => void;
  cancelPending: boolean;
  canOpenListing: boolean;
}) {
  const st = REQ_STATUS[h.status];
  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
      <CardTitle
        listing={h.listing}
        canOpenListing={canOpenListing}
        right={
          <Badge color={st.color}>
            {st.label}
            {h.status === "PENDING" ? ` · ${h.currentStepOrder}/${h.totalSteps}` : ""}
          </Badge>
        }
      />
      <Meta
        parts={[
          h.requestNo,
          h.type === "LISTING_PUBLISH" ? TYPE_LABEL[h.type] : null,
          money(h.amount, h.currency),
          h.mine ? "Siz başlattınız" : `${h.createdBy} başlattı`,
          h.decidedAt ? `${formatDate(h.createdAt, "short")} → ${formatDate(h.decidedAt, "datetime")}` : formatDate(h.createdAt, "datetime"),
        ]}
      />
      {h.status === "PENDING" && h.currentApprover ? (
        <p className="mt-1 text-xs text-amber-700">Sırada: {h.currentApprover}</p>
      ) : null}
      <InitiatorNote note={h.initiatorNote} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-950/5 pt-3">
        <details className="group min-w-0 flex-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-950">
            <ChevronDown aria-hidden className="size-4 transition group-open:rotate-180" />
            Adımlar ({h.decidedSteps}/{h.totalSteps})
          </summary>
          <StepsTimeline steps={h.steps} />
        </details>
        {canCancel && h.status === "PENDING" ? (
          <Button plain onClick={() => onCancel(h)} disabled={cancelPending}>
            {cancelPending ? "İptal ediliyor…" : "İptal et"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type View = "pending" | "all" | "flows";
type Chip = "all" | "pending" | "mine" | "done";
const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekleyen" },
  { key: "mine", label: "Başlattıklarım" },
  { key: "done", label: "Sonuçlanan" },
];

export default function OnaylarPage() {
  // Görünüm URL'de (?tab=) — yenileme/paylaşımda korunur. Eski "history"
  // bağlantıları "all"a düşer (birleşti).
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [view, setViewState] = useState<View>(
    urlTab === "flows" ? "flows" : urlTab === "all" || urlTab === "history" ? "all" : "pending",
  );
  const setView = (k: View) => {
    setViewState(k);
    const u = new URL(window.location.href);
    if (k === "pending") u.searchParams.delete("tab");
    else u.searchParams.set("tab", k);
    window.history.replaceState(null, "", u.toString());
  };
  const { user } = useCompanyAuth();
  // Onay isteğini iptal: başlatan VEYA "Onay akışı tanımlama" yetkisi (API aynası).
  const isManager = !!user && (user.isOwner || userHasPermission(user, "approvals:manage"));
  const canManageFlows = useHasCompanyPermission("approvals:manage");
  // Talep detayı bağlantısı yalnız satınalma görüntüleme izni olana; onaycı
  // kararını kart içindeki onay detayından verir (yetki tablosu Faz 2).
  const canOpenListing = userHasPermission(user, "buy:view");
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  const { data: pending, isLoading: pendingLoading, isError: pendingError, refetch: refetchPending } = usePendingApprovals();

  const [chip, setChip] = useState<Chip>("all");
  // Arama debounce'u SearchInput'un içinde.
  const [search, setSearch] = useState("");
  const { data: all, isLoading: allLoading, isError: allError, refetch: refetchAll } = useAllApprovals({
    search: search.trim() || undefined,
  });
  const filtered = useMemo(() => {
    const rows = all ?? [];
    if (chip === "pending") return rows.filter((h) => h.status === "PENDING");
    if (chip === "mine") return rows.filter((h) => h.mine);
    if (chip === "done") return rows.filter((h) => h.status !== "PENDING");
    return rows;
  }, [all, chip]);

  const decide = useDecideApproval();
  const cancel = useCancelApproval();
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<PendingApproval | null>(null);
  // Hangi kart işlem görüyor — kilit yalnız o karta (paylaşılan isPending tüm listeyi kilitlemesin).
  const [actingId, setActingId] = useState<string | null>(null);

  const approve = async (p: PendingApproval) => {
    if (
      !(await confirm({
        title: "İsteği onayla",
        description: `"${p.listing.title}" için ${TYPE_LABEL[p.type].toLocaleLowerCase("tr")} isteği onaylansın mı? ${
          p.currentStepOrder === p.totalSteps ? "Bu son adım — işlem hemen uygulanır." : "Sonraki onaycıya geçilir."
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
      await decide.mutateAsync({ id: rejecting.id, action: "reject", note: reason.trim() || undefined });
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
        confirmLabel: "İptal et",
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

  if (view === "flows" && canManageFlows) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => setView("pending")}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Onaylara dön
          </button>
          <Heading>Onay akışları</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            Kazandırma isteklerinin kimden, hangi sırayla ve hangi tutar eşiğinde onay alacağını tanımlayın.
          </Text>
        </div>
        <ApprovalFlowsSection canManage={canManageFlows} />
      </div>
    );
  }

  const tabs: { key: "pending" | "all"; label: string; count?: number }[] = [
    { key: "pending", label: "Sıra sizde", count: pending?.length ?? 0 },
    { key: "all", label: "Tüm istekler" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading>Onaylar</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            Kazandırma isteklerini onaylayın ya da reddedin; firmadaki tüm istekleri tek listede izleyin.
          </Text>
        </div>
        {canManageFlows ? (
          <Button outline onClick={() => setView("flows")}>
            <Workflow data-slot="icon" aria-hidden />
            Onay akışlarını düzenle
          </Button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Onay görünümleri" className="flex gap-1 border-b border-zinc-950/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`onaylar-tab-${t.key}`}
            aria-selected={view === t.key}
            aria-controls={`onaylar-panel-${t.key}`}
            onClick={() => setView(t.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              view === t.key ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.label}
            {t.count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                  t.count > 0 ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-500",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {view === "pending" ? (
        <div role="tabpanel" id="onaylar-panel-pending" aria-labelledby="onaylar-tab-pending">
          {pendingLoading ? (
            <div className="overflow-hidden card">
              <ListSkeleton rows={4} />
            </div>
          ) : pendingError ? (
            <ErrorState onRetry={() => refetchPending()} />
          ) : !pending || pending.length === 0 ? (
            <Empty text="Sırada bekleyen onay yok — size yönlendirilen istekler burada görünür." />
          ) : (
            <div className="space-y-3">
              {pending.map((p) => (
                <DecideCard
                  key={p.id}
                  p={p}
                  canOpenListing={canOpenListing}
                  busy={decide.isPending && actingId === p.id}
                  detailOpen={openDetailId === p.id}
                  onToggleDetail={() => setOpenDetailId((cur) => (cur === p.id ? null : p.id))}
                  onApprove={() => void approve(p)}
                  onReject={() => setRejecting(p)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {view === "all" ? (
        <div role="tabpanel" id="onaylar-panel-all" aria-labelledby="onaylar-tab-all" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="İstek süzgeci">
              {CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={chip === c.key}
                  onClick={() => setChip(c.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium transition",
                    chip === c.key ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {/* Diğer listelerle AYNI arama kutusu (ikonlu, temizlenebilir, kendi
                debounce'u) — elle ikon bindirilmiş Input hizasızdı. */}
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Onay no / talep ara…"
              className="ml-auto w-full sm:w-72"
            />
          </div>
          {allLoading ? (
            <div className="overflow-hidden card">
              <ListSkeleton rows={4} />
            </div>
          ) : allError ? (
            <ErrorState onRetry={() => refetchAll()} />
          ) : filtered.length === 0 ? (
            <Empty
              text={
                chip === "pending"
                  ? "Bekleyen istek yok."
                  : chip === "mine"
                    ? "Başlattığınız istek yok."
                    : chip === "done"
                      ? "Sonuçlanan istek yok."
                      : "Kayıt bulunamadı — firmadaki tüm onay istekleri burada listelenir."
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((h) => (
                <RequestCard
                  key={h.id}
                  h={h}
                  canCancel={h.mine || isManager}
                  onCancel={cancelRequest}
                  cancelPending={cancel.isPending && actingId === h.id}
                  canOpenListing={canOpenListing}
                />
              ))}
            </div>
          )}
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
