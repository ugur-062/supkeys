"use client";

import { CountdownTimer } from "@/components/countdown-timer";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Inbox, Mail, MessageSquare, User as UserIcon } from "lucide-react";
import Link from "next/link";

interface TendersTableProps {
  items: TenderListItem[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  onRetry: () => void;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMM yyyy", { locale: tr });
  } catch {
    return "—";
  }
}

function SkeletonCard() {
  return (
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-4 shadow-sm animate-pulse">
      <div className="h-3 w-24 bg-zinc-100 rounded mb-2" />
      <div className="h-5 w-2/3 bg-zinc-100 rounded mb-3" />
      <div className="flex gap-4">
        <div className="h-3 w-20 bg-zinc-100 rounded" />
        <div className="h-3 w-16 bg-zinc-100 rounded" />
        <div className="h-3 w-16 bg-zinc-100 rounded" />
      </div>
    </div>
  );
}

function TenderCard({ t }: { t: TenderListItem }) {
  return (
    <Link href={`/company/ilan/${t.id}`} className="block group">
      <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-4 shadow-sm transition-all hover:shadow-md">
        {/* Üst: no + tip + başlık + statü */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-zinc-500 font-mono font-semibold">
                {t.tenderNumber}
              </span>
              <TenderTypeBadge format={t.format} />
            </div>
            <h3 className="font-semibold text-zinc-950 line-clamp-2 mt-1 leading-snug group-hover:text-zinc-700">
              {t.title}
            </h3>
          </div>
          <TenderStatusBadge status={t.status} className="flex-shrink-0" />
        </div>

        {/* Orta: açan + davetli + teklif */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 text-zinc-400" />
            {t.createdBy.firstName} {t.createdBy.lastName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-zinc-400" />
            {t.invitationCount} davetli
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
            {t.bidCount} teklif
          </span>
        </div>

        {/* Alt: açılış · kapanış */}
        <div className="mt-3 pt-3 border-t border-zinc-950/5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-zinc-500">
            Açılış: {formatDate(t.publishedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-600">
            Kapanış:{" "}
            {t.status === "OPEN" && t.bidsCloseAt ? (
              <CountdownTimer deadline={t.bidsCloseAt} className="text-xs" />
            ) : (
              <span className="text-zinc-500">{formatDate(t.bidsCloseAt)}</span>
            )}
          </span>
        </div>
      </div>
    </Link>
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
        <p className="text-zinc-900 font-medium">Veri alınamadı.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl py-16 text-center shadow-sm">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <p className="font-medium text-zinc-900">Henüz ihale yok</p>
            <p className="text-sm">
              İlk ihalenizi açmak için &ldquo;Yeni İhale Aç&rdquo; butonunu
              kullanın.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((t) => (
        <TenderCard key={t.id} t={t} />
      ))}
    </div>
  );
}
