"use client";

import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { useSupplierOrderDetail } from "@/hooks/use-supplier-orders";
import type { OrderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Loader2,
  Package,
  Trophy,
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

export function SupplierOrderDetailView({ id }: { id: string }) {
  const query = useSupplierOrderDetail(id);

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
          <Link href="/supplier/siparisler">
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
  const winningCount = order.bid.items.length;
  const totalItems = order.tender.items.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href="/supplier/siparisler"
          className="hover:text-brand-700 hover:underline"
        >
          Siparişler
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-brand-700 font-mono font-semibold">
          {order.orderNumber}
        </span>
      </nav>

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-success-50 via-white to-emerald-50/40 border border-success-200 p-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-success-100 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-6 h-6 text-success-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-success-700 uppercase tracking-wide font-semibold">
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

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi
          label="Toplam Tutar"
          value={formatMoney(order.totalAmount, order.currency)}
          valueClass="text-success-700 text-xl"
        />
        <Kpi
          label="Kazandığınız Kalem"
          value={`${winningCount} / ${totalItems}`}
        />
        <Kpi label="Para Birimi" value={order.currency} />
      </div>

      {/* Tenant info */}
      <Section title="Alıcı">
        <TenantCard order={order} />
      </Section>

      {/* Tender link */}
      <Section title="Bağlı İhale">
        <Link
          href={`/supplier/ihaleler/${order.tender.id}`}
          className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-300 transition group"
        >
          <p className="font-mono text-xs text-slate-500">
            {order.tender.tenderNumber}
          </p>
          <p className="font-bold text-brand-900 group-hover:text-brand-700 mt-1">
            {order.tender.title}
          </p>
        </Link>
      </Section>

      {/* Items */}
      <Section title="Kazandığınız Kalemler">
        <ItemsTable order={order} />
      </Section>

      {order.bid.notes ? (
        <Section title="Teklif Notunuz">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {order.bid.notes}
            </p>
          </div>
        </Section>
      ) : null}
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

function TenantCard({ order }: { order: OrderDetail }) {
  if (!order.tenant) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <p className="font-bold text-brand-900">{order.tenant.name}</p>
          {order.tenant.city ? (
            <p className="text-xs text-slate-500 mt-0.5">
              {order.tenant.city}
              {order.tenant.district ? ` / ${order.tenant.district}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
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
          <tfoot className="bg-success-50 border-t-2 border-success-300">
            <tr>
              <td
                colSpan={3}
                className="px-4 py-3 text-right font-bold text-success-900"
              >
                TOPLAM
              </td>
              <td className="px-4 py-3 text-right font-bold text-success-900 text-lg tabular-nums">
                {formatMoney(order.totalAmount, order.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// avoid unused import warning until status workflow lands in V1.5
void Package;
