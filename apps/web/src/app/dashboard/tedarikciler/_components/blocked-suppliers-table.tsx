"use client";

import { Button } from "@/components/ui/button";
import type { SupplierWithRelation } from "@/lib/tedarikciler/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ShieldOff } from "lucide-react";

interface BlockedSuppliersTableProps {
  items: SupplierWithRelation[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  canManage: boolean;
  onRetry: () => void;
  onSelect: (relationId: string) => void;
  onUnblock: (id: string, companyName: string) => void;
  busyId?: string | null;
}

function formatDate(date: string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMM yyyy", { locale: tr });
  } catch {
    return "—";
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-t border-surface-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

const COLS = 5;

export function BlockedSuppliersTable({
  items,
  isLoading,
  isError,
  pageSize,
  canManage,
  onRetry,
  onSelect,
  onUnblock,
  busyId,
}: BlockedSuppliersTableProps) {
  if (isError) {
    return (
      <div className="px-6 py-16 text-center space-y-3">
        <p className="text-brand-900 font-medium">Veri alınamadı.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const showEmpty = !isLoading && items.length === 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left">
          <tr>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Firma
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Vergi No
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Engelleme Sebebi
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Engellenme Tarihi
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            items.length === 0 &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <SkeletonRow key={i} cols={COLS} />
            ))}

          {showEmpty && (
            <tr>
              <td colSpan={COLS} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <ShieldOff className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-brand-900">
                      Engellenmiş tedarikçi yok
                    </p>
                    <p className="text-sm">
                      Henüz hiçbir tedarikçiyi engellememişsiniz.
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          )}

          {items.map((row) => (
            <tr
              key={row.relationId}
              onClick={() => onSelect(row.relationId)}
              className="border-t border-surface-border hover:bg-surface-muted/60 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-medium text-brand-900">
                {row.supplier.companyName}
              </td>
              <td className="px-4 py-3 text-brand-900 font-mono text-xs">
                {row.supplier.taxNumber}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.blockedReason ? (
                  <span title={row.blockedReason}>
                    {truncate(row.blockedReason, 60)}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {formatDate(row.blockedAt)}
              </td>
              <td className="px-4 py-3 text-right">
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyId === row.relationId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnblock(row.relationId, row.supplier.companyName);
                    }}
                    className="!text-brand-700 !border-brand-200 hover:!bg-brand-50"
                  >
                    Engeli Kaldır
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
