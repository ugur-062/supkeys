"use client";

import { ApplicationStatusBadge } from "@/components/ui/application-status-badge";
import { Button } from "@/components/ui/button";
import { COMPANY_TYPE_SHORT_LABEL } from "@/lib/applications/company-type";
import type { SupplierApplicationListItem } from "@/lib/applications/types";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight, Inbox, Mail, User } from "lucide-react";

interface SupplierApplicationsTableProps {
  items: SupplierApplicationListItem[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  onRetry: () => void;
  onSelect: (id: string) => void;
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

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-t border-admin-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

const COLUMN_COUNT = 9;

export function SupplierApplicationsTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
  onSelect,
}: SupplierApplicationsTableProps) {
  if (isError) {
    return (
      <div className="px-6 py-16 text-center space-y-3">
        <p className="text-admin-text font-medium">Veri alınamadı.</p>
        <p className="text-sm text-admin-text-muted">
          Bir hata oluştu, lütfen tekrar deneyin.
        </p>
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
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Firma
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Yetkili
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              E-posta
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Tip
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Vergi No
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Statü
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Davet
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Tarih
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            items.length === 0 &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <SkeletonRow key={i} cols={COLUMN_COUNT} />
            ))}

          {showEmpty && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-admin-text-muted">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-admin-text">
                      Henüz tedarikçi başvurusu yok
                    </p>
                    <p className="text-sm">
                      Filtreleri temizleyerek tekrar deneyebilirsin.
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          )}

          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="border-t border-admin-border hover:bg-surface-muted/60 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-medium text-admin-text">
                {item.companyName}
              </td>
              <td className="px-4 py-3 text-admin-text">
                {item.adminFirstName} {item.adminLastName}
              </td>
              <td className="px-4 py-3 text-admin-text-muted">
                <a
                  href={`mailto:${item.adminEmail}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-brand-700 hover:underline"
                >
                  {item.adminEmail}
                </a>
              </td>
              <td className="px-4 py-3 text-admin-text-muted whitespace-nowrap">
                {COMPANY_TYPE_SHORT_LABEL[item.companyType]}
              </td>
              <td className="px-4 py-3 text-admin-text font-mono text-xs">
                {item.taxNumber}
              </td>
              <td className="px-4 py-3">
                <ApplicationStatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">
                {item.invitedByTenant ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium max-w-[180px]"
                    title={`${item.invitedByTenant.name} tarafından davet edildi`}
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.invitedByTenant.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium">
                    <User className="w-3 h-3" />
                    Self
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-admin-text-muted whitespace-nowrap">
                {formatRelative(item.createdAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(item.id);
                  }}
                >
                  Detay
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
