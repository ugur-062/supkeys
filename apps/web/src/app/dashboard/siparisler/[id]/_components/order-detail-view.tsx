"use client";

import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { useOrderDetail } from "@/hooks/use-tenant-orders";
import type { OrderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Package,
} from "lucide-react";
import Link from "next/link";

function formatMoney(value: string | number, currency: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}

function formatNumber(value: string | number | null): string {
  if (value === null) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OrderDetailView({ id }: { id: string }) {
  const query = useOrderDetail(id);

  if (query.isLoading && !query.data) {
    return (
      <div className="py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Sipariş yükleniyor…</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">Sipariş bulunamadı</p>
          <Link href="/dashboard/siparisler">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Siparişler
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const order = query.data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb orderNumber={order.orderNumber} />

      <Header order={order} />

      <KpiCards order={order} />

      <Section title="Tedarikçi">
        <SupplierFields order={order} />
      </Section>

      <Section title="Bağlı İhale">
        <TenderLink order={order} />
      </Section>

      <Section title="Kazandırılan Kalemler">
        <ItemsTable order={order} />
      </Section>

      {(order.bid.notes || (order.bid.attachments?.length ?? 0) > 0) ? (
        <Section title="Teklif Detayları">
          <NotesAndAttachments order={order} />
        </Section>
      ) : null}
    </div>
  );
}

function Breadcrumb({ orderNumber }: { orderNumber: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
      <Link
        href="/dashboard"
        className="hover:text-brand-700 hover:underline"
      >
        Dashboard
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <Link
        href="/dashboard/siparisler"
        className="hover:text-brand-700 hover:underline"
      >
        Siparişler
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-brand-700 font-mono font-semibold">
        {orderNumber}
      </span>
    </nav>
  );
}

function Header({ order }: { order: OrderDetail }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              {order.orderNumber}
            </p>
            <h1 className="font-display font-bold text-2xl text-brand-900 mt-0.5">
              {order.tender.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <OrderStatusBadge status={order.status} />
              <span className="text-xs text-slate-500">
                Oluşturulma:{" "}
                {format(new Date(order.createdAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCards({ order }: { order: OrderDetail }) {
  const winningCount = order.bid.items.length;
  const totalItems = order.tender.items.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Kpi
        label="Toplam Tutar"
        value={formatMoney(order.totalAmount, order.currency)}
        valueClass="text-success-700 text-xl"
      />
      <Kpi
        label="Kazandırılan Kalem"
        value={`${winningCount} / ${totalItems}`}
      />
      <Kpi
        label="Para Birimi"
        value={order.currency}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
        {label}
      </p>
      <p
        className={`mt-2 font-bold text-brand-900 ${valueClass ?? "text-2xl"}`}
      >
        {value}
      </p>
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

function SupplierFields({ order }: { order: OrderDetail }) {
  const supplier = order.supplier;
  if (!supplier) return null;
  const primaryUser = supplier.users[0];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <p className="font-bold text-brand-900">{supplier.companyName}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            VKN: {supplier.taxNumber}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {supplier.city ? <Field label="Şehir" value={supplier.city} /> : null}
        {supplier.industry ? (
          <Field label="Sektör" value={supplier.industry} />
        ) : null}
        {primaryUser ? (
          <>
            <Field
              label="Yetkili"
              value={`${primaryUser.firstName} ${primaryUser.lastName}`}
            />
            <Field label="E-posta" value={primaryUser.email} />
            {primaryUser.phone ? (
              <Field label="Telefon" value={primaryUser.phone} />
            ) : null}
          </>
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

function TenderLink({ order }: { order: OrderDetail }) {
  return (
    <Link
      href={`/dashboard/ihaleler/${order.tender.id}`}
      className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-300 transition group"
    >
      <p className="font-mono text-xs text-slate-500">
        {order.tender.tenderNumber}
      </p>
      <p className="font-bold text-brand-900 group-hover:text-brand-700 mt-1">
        {order.tender.title}
      </p>
    </Link>
  );
}

function ItemsTable({ order }: { order: OrderDetail }) {
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
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-40">
                Birim Fiyat
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-44">
                Toplam
              </th>
            </tr>
          </thead>
          <tbody>
            {order.bid.items.map((bi) => (
              <tr
                key={bi.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-3 align-top">
                  <p className="font-medium text-slate-900">
                    {bi.tenderItem.name}
                  </p>
                  {bi.tenderItem.materialCode ? (
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      {bi.tenderItem.materialCode}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 align-top">
                  {Number(bi.tenderItem.quantity).toLocaleString("tr-TR")}{" "}
                  {bi.tenderItem.unit}
                </td>
                <td className="px-4 py-3 text-right tabular-nums align-top">
                  {bi.unitPrice
                    ? `${bi.currency} ${formatNumber(bi.unitPrice)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right font-bold text-brand-900 tabular-nums align-top">
                  {bi.totalPrice
                    ? formatMoney(bi.totalPrice, bi.currency)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-brand-50 border-t-2 border-brand-300">
            <tr>
              <td
                colSpan={3}
                className="px-4 py-3 text-right font-bold text-brand-900"
              >
                TOPLAM
              </td>
              <td className="px-4 py-3 text-right font-bold text-brand-900 text-lg tabular-nums">
                {formatMoney(order.totalAmount, order.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function NotesAndAttachments({ order }: { order: OrderDetail }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
      {order.bid.notes ? (
        <div>
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide mb-2">
            Tedarikçi Notu
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
            {order.bid.notes}
          </p>
        </div>
      ) : null}

      {order.bid.attachments && order.bid.attachments.length > 0 ? (
        <div>
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide mb-2">
            Teklif Dosyaları ({order.bid.attachments.length})
          </p>
          <div className="space-y-2">
            {order.bid.attachments.map((att) => (
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
