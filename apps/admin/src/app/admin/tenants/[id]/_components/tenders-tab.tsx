"use client";

import { useAdminTenantTenders } from "@/hooks/use-admin-tenants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { FileText } from "lucide-react";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onayda (Yayın)",
  OPEN_FOR_BIDS: "Tekliflere Açık",
  IN_AWARD: "Kazandırma",
  IN_AWARD_APPROVAL: "Onayda (Kazandırma)",
  AWARDED: "Kazandırıldı",
  CANCELLED: "İptal",
  CLOSED_NO_AWARD: "Kazandırılmadı",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  IN_APPROVAL: "bg-warning-50 text-warning-800 border-warning-200",
  OPEN_FOR_BIDS: "bg-brand-50 text-brand-700 border-brand-200",
  IN_AWARD: "bg-indigo-50 text-indigo-700 border-indigo-200",
  IN_AWARD_APPROVAL: "bg-warning-50 text-warning-800 border-warning-200",
  AWARDED: "bg-success-50 text-success-700 border-success-200",
  CANCELLED: "bg-danger-50 text-danger-700 border-danger-200",
  CLOSED_NO_AWARD: "bg-slate-100 text-slate-600 border-slate-200",
};

export function TendersTab({ tenantId }: { tenantId: string }) {
  const [page, setPage] = useState(1);
  const query = useAdminTenantTenders(tenantId, { page });

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
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-semibold text-admin-text">Henüz ihale yok</p>
        <p className="text-sm text-admin-text-muted">
          Bu tenant hiç ihale açmamış.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between">
        <p className="text-sm text-admin-text-muted">
          Toplam {data.pagination.total} ihale (read-only)
        </p>
      </div>
      <div className="divide-y divide-surface-border">
        {data.items.map((t) => (
          <div
            key={t.id}
            className="px-5 py-3 flex items-start justify-between gap-3 flex-wrap"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono text-xs text-admin-text-muted">
                  {t.tenderNumber}
                </p>
                <span
                  className={cn(
                    "inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold",
                    STATUS_COLORS[t.status] ?? "bg-slate-50 border-slate-200",
                  )}
                >
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
              <p className="mt-1 font-semibold text-admin-text truncate">
                {t.title}
              </p>
              <p className="mt-0.5 text-xs text-admin-text-muted">
                {t.createdBy.firstName} {t.createdBy.lastName} ·{" "}
                {t._count.items} kalem · {t._count.invitations} davet ·{" "}
                {t._count.bids} teklif · {t.primaryCurrency}
              </p>
            </div>
            <div className="text-right text-xs text-admin-text-muted flex-shrink-0">
              <p>
                Açılış:{" "}
                {format(new Date(t.createdAt), "d MMM yyyy", { locale: tr })}
              </p>
              <p>
                Kapanış:{" "}
                {format(new Date(t.bidsCloseAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
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
