"use client";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { BidStatusBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useBidDetail, useTenderDetail } from "@/hooks/use-tenant-tenders";
import type { BidDetailExpanded, TenderDetail } from "@/lib/tenders/types";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Info,
  Loader2,
  Package,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EliminateBidModal } from "./eliminate-bid-modal";

function formatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return num.toLocaleString("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value: string | number | null): string {
  if (value === null) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

function formatQty(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BidDetailView({
  tenderId,
  bidId,
}: {
  tenderId: string;
  bidId: string;
}) {
  const tenderQuery = useTenderDetail(tenderId);
  const bidQuery = useBidDetail(tenderId, bidId);

  if (bidQuery.isLoading && !bidQuery.data) {
    return (
      <div className="max-w-6xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm mt-2">Teklif yükleniyor…</p>
      </div>
    );
  }

  if (!bidQuery.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">Teklif bulunamadı</p>
          <p className="text-sm text-slate-500">
            Bu teklif silinmiş veya size ait olmayabilir.
          </p>
          <Link href={`/dashboard/ihaleler/${tenderId}`}>
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              İhaleye Dön
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const bid = bidQuery.data;
  const tender = tenderQuery.data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb
        tenderId={tenderId}
        tenderNumber={tender?.tenderNumber ?? "..."}
      />

      <DetailHeader
        bid={bid}
        tender={tender ?? null}
        tenderId={tenderId}
        tenderTitle={tender?.title}
      />

      <BidStatusBanner bid={bid} />

      <KpiCards bid={bid} />

      <Section title="Firma Bilgileri">
        <CompanyFields bid={bid} />
      </Section>

      <Section title="Kalem Bazlı Teklif">
        <ItemsTable bid={bid} />
      </Section>

      {bid.notes || (bid.attachments?.length ?? 0) > 0 ? (
        <Section title="Teklif Detayları">
          <NotesAndAttachments bid={bid} />
        </Section>
      ) : null}

      <Section title="Teklif Dosyaları">
        <AttachmentList
          surface="tenant"
          scope="BID_RESPONSE"
          scopeRefId={bid.id}
          canDelete={false}
          emptyText="Tedarikçi bu teklif için dosya eklemedi"
        />
      </Section>
    </div>
  );
}

function BidStatusBanner({ bid }: { bid: BidDetailExpanded }) {
  if (bid.status === "LOST" && bid.eliminationReason) {
    return (
      <div className="rounded-xl bg-danger-50 border border-danger-200 p-4 flex gap-3 items-start">
        <Ban className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm space-y-1">
          <p className="font-bold text-danger-800">Bu teklif elendi</p>
          <p className="text-danger-700">
            <strong>Sebep:</strong> {bid.eliminationReason}
          </p>
          {bid.eliminatedAt ? (
            <p className="text-xs text-danger-600 mt-1">
              Eleme:{" "}
              {format(new Date(bid.eliminatedAt), "d MMM yyyy HH:mm", {
                locale: tr,
              })}
            </p>
          ) : null}
          <p className="text-xs text-danger-600 mt-1">
            Tedarikçi yeniden teklif verme hakkına sahip; e-posta ile
            bilgilendirildi.
          </p>
        </div>
      </div>
    );
  }
  if (bid.status === "AWARDED_FULL" || bid.status === "AWARDED_PARTIAL") {
    return (
      <div className="rounded-xl bg-success-50 border border-success-200 p-4 flex gap-3 items-start">
        <Trophy className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-bold text-success-800">
            {bid.status === "AWARDED_FULL"
              ? "Bu teklif tüm kalemleri kazandı"
              : "Bu teklif bazı kalemleri kazandı"}
          </p>
          <p className="text-success-700 mt-0.5">
            Sipariş(ler) /dashboard/siparisler sayfasından izlenebilir.
          </p>
        </div>
      </div>
    );
  }
  if (bid.status === "WITHDRAWN") {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-slate-700">
          <strong>Bu teklif geri çekildi.</strong> Tedarikçi tarafından iptal
          edildi.
        </div>
      </div>
    );
  }
  return null;
}

function Breadcrumb({
  tenderId,
  tenderNumber,
}: {
  tenderId: string;
  tenderNumber: string;
}) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
      <Link
        href="/dashboard/ihaleler"
        className="hover:text-brand-700 hover:underline"
      >
        İhaleler
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <Link
        href={`/dashboard/ihaleler/${tenderId}`}
        className="hover:text-brand-700 hover:underline font-mono"
      >
        {tenderNumber}
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-brand-700 font-semibold">Teklif</span>
    </nav>
  );
}

function DetailHeader({
  bid,
  tender,
  tenderId,
  tenderTitle,
}: {
  bid: BidDetailExpanded;
  tender: TenderDetail | null;
  tenderId: string;
  tenderTitle?: string;
}) {
  const { has } = usePermissions();
  const [eliminateOpen, setEliminateOpen] = useState(false);

  // V2-6.5 RBAC — bid:eliminate yetkisi (default'ta BUYER'da var).
  const canEliminatePerm = has("bid:eliminate");
  const tenderActive =
    tender?.status === "OPEN_FOR_BIDS" || tender?.status === "IN_AWARD";
  const canEliminate =
    canEliminatePerm && tenderActive && bid.status === "SUBMITTED";

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-brand-900">
              Teklif Bilgileri
            </h1>
            <BidStatusBadge status={bid.status} />
            {bid.version > 1 ? (
              <span className="text-xs px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded border border-brand-200 font-mono font-bold">
                v{bid.version}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="font-semibold text-brand-700">
              {bid.supplier.companyName}
            </span>
            {tenderTitle ? (
              <>
                <span className="text-slate-300">•</span>
                <span className="truncate">{tenderTitle}</span>
              </>
            ) : null}
          </p>
        </div>

        {canEliminatePerm ? (
          <Dropdown>
            <DropdownButton
              as={Button}
              variant="primary"
              disabled={!canEliminate}
              title={
                canEliminate
                  ? undefined
                  : bid.status === "LOST"
                    ? "Bu teklif zaten elendi."
                    : bid.status === "AWARDED_FULL" ||
                        bid.status === "AWARDED_PARTIAL"
                      ? "Bu teklif kazandırıldı."
                      : !tenderActive
                        ? "İhale durumu işlem yapmaya uygun değil."
                        : "Bu teklif üzerinde yapılacak işlem yok."
              }
            >
              Tüm İşlemler
              <ChevronDown className="h-4 w-4 ml-1" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="min-w-[220px]">
              <DropdownItem
                disabled={!canEliminate}
                onClick={() => {
                  if (canEliminate) setEliminateOpen(true);
                }}
              >
                <Ban data-slot="icon" />
                <DropdownLabel className="text-danger-700">
                  Teklifi Ele
                </DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : null}
      </div>

      <EliminateBidModal
        open={eliminateOpen}
        onClose={() => setEliminateOpen(false)}
        tenderId={tenderId}
        bidId={bid.id}
        supplierName={bid.supplier.companyName}
      />
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Package;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-950/5 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <Icon className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-950">
            {value}
          </p>
        </div>
      </div>
      {sub ? <div className="mt-2">{sub}</div> : null}
    </div>
  );
}

function KpiCards({ bid }: { bid: BidDetailExpanded }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Toplam teklif — siyah vurgu blok */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
        <div className="bg-zinc-900 p-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Toplam Teklif
          </p>
          <p className="mt-1.5 truncate text-2xl font-bold tabular-nums">
            {formatCurrency(bid.totalAmount, bid.currency)}
          </p>
          {bid.currency !== "TRY" && bid.exchangeRateSnapshot ? (
            <p className="mt-1 text-[11px] tabular-nums text-zinc-400">
              ≈{" "}
              {formatCurrency(
                Number(bid.totalAmount) * bid.exchangeRateSnapshot.rate,
                "TRY",
              )}{" "}
              <span className="text-zinc-500">
                (kur: {bid.exchangeRateSnapshot.rate.toFixed(4)} ·{" "}
                {bid.exchangeRateSnapshot.rateDate} TCMB)
              </span>
            </p>
          ) : bid.isDifferentCurrency ? (
            <p className="mt-1 text-[11px] text-zinc-400">
              Teklif {bid.currency} para biriminde verilmiştir.
            </p>
          ) : null}
        </div>
      </div>

      <StatCard
        icon={Package}
        label="Teklif Verilen Kalem"
        value={
          <>
            {bid.itemsBidCount}
            <span className="text-base font-normal text-slate-500">
              {" "}
              / {bid.totalItems}
            </span>
          </>
        }
      />
      <StatCard
        icon={Trophy}
        label="Sıralama"
        value={
          <>
            {bid.rank ?? "—"}
            <span className="text-base font-normal text-slate-500">
              {" "}
              / {bid.totalBids}
            </span>
          </>
        }
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold text-brand-900 uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CompanyFields({ bid }: { bid: BidDetailExpanded }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Firma Adı" value={bid.supplier.companyName} />
        <Field label="VKN" value={bid.supplier.taxNumber} mono />
        <Field
          label="Yetkili"
          value={`${bid.submittedBy.firstName} ${bid.submittedBy.lastName}`}
        />
        <Field label="E-posta" value={bid.submittedBy.email} />
        {bid.submittedBy.phone ? (
          <Field label="Telefon" value={bid.submittedBy.phone} />
        ) : null}
        {bid.supplier.city ? (
          <Field label="Şehir" value={bid.supplier.city} />
        ) : null}
        {bid.supplier.industry ? (
          <Field label="Sektör" value={bid.supplier.industry} />
        ) : null}
        {bid.submittedAt ? (
          <Field
            label="Gönderildi"
            value={format(new Date(bid.submittedAt), "d MMM yyyy HH:mm", {
              locale: tr,
            })}
          />
        ) : null}
        {bid.deliveryDate ? (
          <Field
            label="Teslim Tarihi"
            value={format(new Date(bid.deliveryDate), "d MMM yyyy", {
              locale: tr,
            })}
          />
        ) : null}
        {bid.validityDays != null ? (
          <Field label="Geçerlilik" value={`${bid.validityDays} gün`} />
        ) : null}
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
        {label}
      </dt>
      <dd
        className={`text-sm text-brand-900 mt-1 break-words ${
          mono ? "font-mono" : "font-medium"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ItemsTable({ bid }: { bid: BidDetailExpanded }) {
  const items = bid.items ?? [];
  return (
    <div className="space-y-2.5">
      {items.map((bi) => {
        const qa: Array<{ q: string; a: string }> =
          bi.tenderItem.questions && bi.tenderItem.questions.length > 0
            ? bi.tenderItem.questions.map((q) => ({
                q: q.text,
                a:
                  bi.answers?.find((a) => a.questionId === q.id)?.value || "—",
              }))
            : bi.tenderItem.customQuestion && bi.customAnswer
              ? [{ q: bi.tenderItem.customQuestion, a: bi.customAnswer }]
              : [];
        return (
          <div
            key={bi.id}
            className="rounded-xl border border-zinc-950/5 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900">
                  {bi.tenderItem.name}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                  {formatQty(bi.tenderItem.quantity)} {bi.tenderItem.unit}
                  {bi.unitPrice
                    ? ` × ${bi.currency} ${formatNumber(bi.unitPrice)}`
                    : ""}
                </p>
              </div>
              <p className="shrink-0 text-base font-bold tabular-nums text-zinc-950">
                {bi.totalPrice ? formatCurrency(bi.totalPrice, bi.currency) : "—"}
              </p>
            </div>

            {qa.length > 0 ? (
              <div className="mt-3 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
                {qa.map((item, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-semibold text-zinc-500">Soru</p>
                    <p className="mt-0.5 text-zinc-700">{item.q}</p>
                    <p className="mt-1 font-semibold text-zinc-500">Cevap</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-zinc-800">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Toplam */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-white">
        <span className="text-sm font-semibold">Toplam Teklif</span>
        <span className="text-lg font-bold tabular-nums">
          {formatCurrency(bid.totalAmount, bid.currency)}
        </span>
      </div>
    </div>
  );
}

function NotesAndAttachments({ bid }: { bid: BidDetailExpanded }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
      {bid.notes ? (
        <div>
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide mb-2">
            Teklif Notu
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
            {bid.notes}
          </p>
        </div>
      ) : null}

      {bid.attachments && bid.attachments.length > 0 ? (
        <div>
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide mb-2">
            Teklif Dosyaları ({bid.attachments.length})
          </p>
          <div className="space-y-2">
            {bid.attachments.map((att) => (
              <a
                key={att.id}
                href={att.fileUrl}
                download={att.fileName}
                className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition border border-slate-100"
              >
                <FileText className="h-5 w-5 text-brand-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-700 hover:underline truncate">
                    {att.fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(att.fileSize)}
                  </p>
                </div>
                <Download className="h-4 w-4 text-slate-400" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
