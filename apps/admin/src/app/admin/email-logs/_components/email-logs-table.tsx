"use client";

import { Button } from "@/components/ui/button";
import { EmailStatusBadge } from "@/components/ui/email-status-badge";
import { getTemplateLabel } from "@/lib/email-logs/status";
import type { EmailLog } from "@/lib/email-logs/types";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight, Mail } from "lucide-react";

interface EmailLogsTableProps {
  items: EmailLog[];
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

function SkeletonRow() {
  return (
    <tr className="border-t border-admin-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function EmailLogsTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
  onSelect,
}: EmailLogsTableProps) {
  if (isError) {
    return (
      <div className="px-6 py-16 text-center space-y-3">
        <p className="text-admin-text font-medium">Veri alınamadı.</p>
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
              Tarih
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Şablon
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Alıcı
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Durum
            </th>
            <th className="px-4 py-3 font-medium text-admin-text-muted text-xs uppercase tracking-wide">
              Provider
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
                <div className="flex flex-col items-center gap-3 text-admin-text-muted">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-admin-text">
                      E-posta logu yok
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
              <td className="px-4 py-3 text-admin-text-muted whitespace-nowrap">
                {formatRelative(item.queuedAt)}
              </td>
              <td className="px-4 py-3 text-admin-text">
                {getTemplateLabel(item.template)}
              </td>
              <td className="px-4 py-3 text-admin-text-muted">
                {item.toEmail}
              </td>
              <td className="px-4 py-3">
                <EmailStatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3 text-admin-text-muted font-mono text-xs">
                {item.provider}
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
