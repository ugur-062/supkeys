"use client";

import { Button } from "@/components/ui/button";
import {
  COMPANY_TYPE_SHORT_LABEL,
  MEMBERSHIP_META,
} from "@/lib/tedarikciler/membership";
import type { SupplierWithRelation } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight, Mail, Users2 } from "lucide-react";

interface ApprovedSuppliersTableProps {
  items: SupplierWithRelation[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  onRetry: () => void;
  onSelect: (relationId: string) => void;
  onInvite: () => void;
  canInvite: boolean;
}

function formatRelative(date: string) {
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: tr,
    });
  } catch {
    return "—";
  }
}

function SkeletonRow() {
  return (
    <tr className="border-t border-surface-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function ApprovedSuppliersTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
  onSelect,
  onInvite,
  canInvite,
}: ApprovedSuppliersTableProps) {
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
              Üyelik
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Firma
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Vergi No
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              İletişim
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              İlişki Tarihi
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            items.length === 0 &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}

          {showEmpty && (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Users2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-brand-900">
                      Henüz onaylı tedarikçiniz yok
                    </p>
                    <p className="text-sm">
                      Tedarikçilerinizi davet ederek listenizi oluşturmaya
                      başlayın.
                    </p>
                  </div>
                  {canInvite && (
                    <Button onClick={onInvite} size="sm">
                      İlk Tedarikçinizi Davet Edin
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          )}

          {items.map((row) => {
            const meta = MEMBERSHIP_META[row.supplier.membership];
            const primary = row.supplier.users[0];
            return (
              <tr
                key={row.relationId}
                onClick={() => onSelect(row.relationId)}
                className="border-t border-surface-border hover:bg-surface-muted/60 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                      meta.badgeClass,
                    )}
                  >
                    {meta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-brand-900">
                  <div className="font-medium">{row.supplier.companyName}</div>
                  <div className="text-xs text-slate-500">
                    {COMPANY_TYPE_SHORT_LABEL[row.supplier.companyType]}
                  </div>
                </td>
                <td className="px-4 py-3 text-brand-900 font-mono text-xs">
                  {row.supplier.taxNumber}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {primary ? (
                    <>
                      <div>
                        {primary.firstName} {primary.lastName}
                      </div>
                      <a
                        href={`mailto:${primary.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-slate-500 hover:text-brand-700 hover:underline inline-flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        {primary.email}
                      </a>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {formatRelative(row.relationCreatedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row.relationId);
                    }}
                  >
                    Detay
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
