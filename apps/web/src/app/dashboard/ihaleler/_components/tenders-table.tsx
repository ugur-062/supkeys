"use client";

import { CountdownTimer } from "@/components/countdown-timer";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import type { TenderListItem } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowRight,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

interface TendersTableProps {
  items: TenderListItem[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  onRetry: () => void;
}

const COLS = 8;

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMM yyyy", { locale: tr });
  } catch {
    return "—";
  }
}

function SkeletonRow() {
  return (
    <tr className="border-t border-surface-border">
      {Array.from({ length: COLS }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function TendersTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
}: TendersTableProps) {
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
              İhale No
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Adı
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Tip
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Statü
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Davetli
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Teklif
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Açılış
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Kapanış
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
              <td colSpan={COLS + 1} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-brand-900">
                      Henüz ihale yok
                    </p>
                    <p className="text-sm">
                      İlk ihalenizi açmak için &ldquo;Yeni İhale Aç&rdquo;
                      butonunu kullanın.
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          )}

          {items.map((t) => (
            <tr
              key={t.id}
              className="border-t border-surface-border hover:bg-surface-muted/60 transition-colors"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/ihaleler/${t.id}`}
                  className="text-brand-700 hover:text-brand-800 font-mono text-xs font-semibold hover:underline"
                >
                  {t.tenderNumber}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/ihaleler/${t.id}`}
                  className="font-medium text-brand-900 hover:text-brand-700"
                >
                  {t.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <TenderTypeBadge type={t.type} />
              </td>
              <td className="px-4 py-3">
                <TenderStatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {t.invitationCount}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                  {t.bidCount}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {formatDate(t.publishedAt)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {t.status === "OPEN_FOR_BIDS" ? (
                  <CountdownTimer
                    deadline={t.bidsCloseAt}
                    className="text-xs"
                  />
                ) : (
                  <span className="text-slate-500 text-xs">
                    {formatDate(t.bidsCloseAt)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/dashboard/ihaleler/${t.id}`}>
                  <Button variant="ghost" size="sm">
                    Detay
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// silence unused
export const _FileText = FileText;
