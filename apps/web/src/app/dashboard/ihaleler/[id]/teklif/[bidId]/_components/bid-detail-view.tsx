"use client";

import { Button } from "@/components/ui/button";
import { useBidDetail, useTenderDetail } from "@/hooks/use-tenant-tenders";
import type { BidDetailExpanded } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Package,
  Trophy,
  Wallet,
} from "lucide-react";
import Link from "next/link";

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

  if (bidQuery.isError || !bidQuery.data) {
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

      <DetailHeader bid={bid} tenderTitle={tender?.title} />

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
    </div>
  );
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
  tenderTitle,
}: {
  bid: BidDetailExpanded;
  tenderTitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-900">
          Teklif Bilgileri
        </h1>
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

      <Button variant="primary" disabled title="E.5 / E.6'da aktif olacak">
        Tüm İşlemler
        <ChevronDown className="h-4 w-4" />
        <span className="ml-1 px-1.5 py-0.5 bg-white text-brand-700 text-[10px] rounded font-bold uppercase tracking-wide">
          Yakında
        </span>
      </Button>
    </div>
  );
}

function KpiCards({ bid }: { bid: BidDetailExpanded }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* KPI 1: Son Teklif */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-success-700 mb-3">
          v{bid.version} / {bid.version} Son Teklif
        </p>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Wallet className="h-6 w-6 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-brand-900 tabular-nums truncate">
              {formatCurrency(bid.totalAmount, bid.currency)}
            </p>
            {bid.isDifferentCurrency ? (
              <p className="text-[11px] text-slate-500 mt-1">
                Bu tedarikçi teklifini {bid.currency} olarak vermiştir.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* KPI 2: Kalem Sayısı */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">
          Teklif Verilen Kalem Sayısı
        </p>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Package className="h-6 w-6 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-brand-900">
            {bid.itemsBidCount}{" "}
            <span className="text-base font-normal text-slate-500">
              / {bid.totalItems}
            </span>
          </p>
        </div>
      </div>

      {/* KPI 3: Sıralama */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">
          Tedarikçinin Teklif Sıralaması
        </p>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Trophy className="h-6 w-6 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-brand-900">
            {bid.rank ?? "—"}{" "}
            <span className="text-base font-normal text-slate-500">
              / {bid.totalBids}
            </span>
          </p>
        </div>
      </div>
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
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Kalem
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-32">
                Miktar
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-32">
                Hedef Fiyat
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-40">
                Birim Fiyat
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-44">
                Toplam
              </th>
            </tr>
          </thead>
          <tbody>
            {(bid.items ?? []).map((bi) => (
              <tr key={bi.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-4 align-top">
                  <p className="font-medium text-slate-900">
                    {bi.tenderItem.name}
                  </p>
                  {bi.tenderItem.customQuestion && bi.customAnswer ? (
                    <div className="mt-2 bg-warning-50 border border-warning-200 rounded p-2 max-w-xl">
                      <p className="text-[10px] font-semibold text-warning-800 uppercase tracking-wide">
                        Soru
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5">
                        {bi.tenderItem.customQuestion}
                      </p>
                      <p className="text-[10px] font-semibold text-warning-800 uppercase tracking-wide mt-2">
                        Cevap
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">
                        {bi.customAnswer}
                      </p>
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-right text-slate-600 align-top">
                  {formatQty(bi.tenderItem.quantity)} {bi.tenderItem.unit}
                </td>
                <td className="px-4 py-4 text-right text-slate-500 align-top">
                  —
                </td>
                <td className="px-4 py-4 text-right font-semibold tabular-nums align-top">
                  {bi.unitPrice
                    ? `${bi.currency} ${formatNumber(bi.unitPrice)}`
                    : "—"}
                </td>
                <td className="px-4 py-4 text-right font-bold text-brand-900 tabular-nums align-top">
                  {bi.totalPrice
                    ? formatCurrency(bi.totalPrice, bi.currency)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-brand-50 border-t-2 border-brand-300">
            <tr>
              <td
                colSpan={4}
                className="px-4 py-3 text-right font-bold text-brand-900"
              >
                TOPLAM
              </td>
              <td className="px-4 py-3 text-right font-bold text-brand-900 text-lg tabular-nums">
                {formatCurrency(bid.totalAmount, bid.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
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
