"use client";

import { useAdminTenantOrders } from "@/hooks/use-admin-tenants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Package } from "lucide-react";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  IN_DELIVERY: "Teslimatta",
  ACCEPTED: "Kabul Edildi",
  IN_PROGRESS: "Üretimde",
  DELIVERED: "Teslim Edildi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-warning-50 text-warning-800 border-warning-200",
  IN_DELIVERY: "bg-brand-50 text-brand-700 border-brand-200",
  ACCEPTED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  IN_PROGRESS: "bg-zinc-100 text-zinc-700 border-zinc-200",
  DELIVERED: "bg-success-50 text-success-700 border-success-200",
  COMPLETED: "bg-success-50 text-success-700 border-success-200",
  CANCELLED: "bg-danger-50 text-danger-700 border-danger-200",
};

function formatAmount(amount: string | number, currency: string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function OrdersTab({ tenantId }: { tenantId: string }) {
  const [page, setPage] = useState(1);
  const query = useAdminTenantOrders(tenantId, { page });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  const data = query.data;
  if (!data || data.items.length === 0) {
    return (
      <div className="admin-card p-12 text-center">
        <Package className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-semibold text-admin-text">Henüz sipariş yok</p>
        <p className="text-sm text-admin-text-muted">
          Bu tenant'a ait sipariş bulunmuyor.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between">
        <p className="text-sm text-admin-text-muted">
          Toplam {data.pagination.total} sipariş (read-only)
        </p>
      </div>
      <div className="divide-y divide-surface-border">
        {data.items.map((o) => (
          <div
            key={o.id}
            className="px-5 py-3 flex items-start justify-between gap-3 flex-wrap"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono text-xs text-admin-text-muted">
                  {o.orderNumber}
                </p>
                <span
                  className={cn(
                    "inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold",
                    STATUS_COLORS[o.status] ?? "bg-slate-50 border-slate-200",
                  )}
                >
                  {STATUS_LABELS[o.status] ?? o.status}
                </span>
              </div>
              <p className="mt-1 font-semibold text-admin-text truncate">
                {o.tender.title}
              </p>
              <p className="mt-0.5 text-xs text-admin-text-muted">
                Tedarikçi: {o.supplier.companyName} · İhale:{" "}
                {o.tender.tenderNumber}
              </p>
            </div>
            <div className="text-right text-xs text-admin-text-muted flex-shrink-0">
              <p className="font-bold text-admin-text">
                {formatAmount(o.totalAmount, o.currency)}
              </p>
              <p>
                {format(new Date(o.createdAt), "d MMM yyyy", { locale: tr })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {data.pagination.totalPages > 1 ? (
        <div className="px-5 py-3 border-t border-surface-border flex items-center justify-between gap-2">
          <p className="text-xs text-admin-text-muted">
            Sayfa {page} / {data.pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-admin-text hover:bg-slate-50 disabled:opacity-40"
            >
              ← Önceki
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(data.pagination.totalPages, p + 1))
              }
              disabled={page >= data.pagination.totalPages}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-admin-text hover:bg-slate-50 disabled:opacity-40"
            >
              Sonraki →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
