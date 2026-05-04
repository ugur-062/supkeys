"use client";

import { CountdownTimer } from "@/components/countdown-timer";
import {
  BidStatusBadge,
  TenderStatusBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import type { SupplierTenderListItem } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight, Building2, Inbox } from "lucide-react";
import Link from "next/link";

const COLS = 7;

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

interface Props {
  items: SupplierTenderListItem[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  onRetry: () => void;
}

export function SupplierTendersTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
}: Props) {
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
              Alıcı
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Statü
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Kapanış
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Teklif Durumum
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
                      Davet edildiğiniz ihale yok
                    </p>
                    <p className="text-sm">
                      Bağlı olduğunuz alıcılar ihale açtığında burada
                      görünecek.
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
                  href={`/supplier/ihaleler/${t.id}`}
                  className="text-brand-700 hover:text-brand-800 font-mono text-xs font-semibold hover:underline"
                >
                  {t.tenderNumber}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/supplier/ihaleler/${t.id}`}
                  className="font-medium text-brand-900 hover:text-brand-700"
                >
                  {t.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {t.tenant.name}
                </span>
              </td>
              <td className="px-4 py-3">
                <TenderStatusBadge status={t.status} />
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
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <BidStatusBadge status={t.myBidStatus} />
                  {t.myBidStatus === "SUBMITTED" && t.myBidVersion ? (
                    <span className="text-[10px] font-semibold text-success-700 bg-success-50 px-1.5 py-0.5 rounded-md border border-success-200">
                      v{t.myBidVersion}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/supplier/ihaleler/${t.id}`}>
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
