"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { CountdownTimer } from "@/components/countdown-timer";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Inbox, Mail, MessageSquare } from "lucide-react";
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

function fullName(t: TenderListItem) {
  return `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim();
}

/** Açılış tarihi + (açıksa) kapanış geri sayımı — kompakt iki satır. */
function DateCell({ t }: { t: TenderListItem }) {
  return (
    <div className="space-y-0.5 text-xs">
      <div className="text-zinc-500">Açılış: {formatDate(t.publishedAt)}</div>
      <div className="text-zinc-700">
        {t.status === "OPEN" && t.bidsCloseAt ? (
          <CountdownTimer deadline={t.bidsCloseAt} className="text-xs" />
        ) : (
          <>Kapanış: {formatDate(t.bidsCloseAt)}</>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Masaüstü: Catalyst tablo ───────────────────────── */

function DesktopTable({ items }: { items: TenderListItem[] }) {
  return (
    <div className="hidden lg:block">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>İhale</TableHeader>
            <TableHeader>Usul</TableHeader>
            <TableHeader>Durum</TableHeader>
            <TableHeader>Açan</TableHeader>
            <TableHeader className="text-center">Davet / Teklif</TableHeader>
            <TableHeader>Tarih</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((t) => (
            <TableRow
              key={t.id}
              href={`/company/ilan/${t.id}`}
              title={t.title}
            >
              <TableCell>
                <div className="font-mono text-[11px] font-semibold text-zinc-400">
                  {t.tenderNumber}
                </div>
                <div className="mt-0.5 max-w-[22rem] truncate font-medium text-zinc-950">
                  {t.title}
                </div>
              </TableCell>
              <TableCell>
                <TenderTypeBadge format={t.format} />
              </TableCell>
              <TableCell>
                <TenderStatusBadge status={t.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <AvatarInitials name={fullName(t)} size="sm" />
                  <span className="text-sm text-zinc-700">{fullName(t)}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-4 text-sm text-zinc-600">
                  <span
                    className="inline-flex items-center gap-1"
                    title={`${t.invitationCount} davetli`}
                  >
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    {t.invitationCount}
                  </span>
                  <span
                    className="inline-flex items-center gap-1"
                    title={`${t.bidCount} teklif`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                    {t.bidCount}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <DateCell t={t} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DesktopSkeleton({ rows }: { rows: number }) {
  return (
    <div className="hidden lg:block">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>İhale</TableHeader>
            <TableHeader>Usul</TableHeader>
            <TableHeader>Durum</TableHeader>
            <TableHeader>Açan</TableHeader>
            <TableHeader className="text-center">Davet / Teklif</TableHeader>
            <TableHeader>Tarih</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
                <div className="mt-1.5 h-4 w-52 animate-pulse rounded bg-zinc-100" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-100" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-100" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-100" />
                  <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
                </div>
              </TableCell>
              <TableCell>
                <div className="mx-auto h-3 w-16 animate-pulse rounded bg-zinc-100" />
              </TableCell>
              <TableCell>
                <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
                <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-zinc-100" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ───────────────────────── Mobil: kart listesi ───────────────────────── */

function MobileCard({ t }: { t: TenderListItem }) {
  return (
    <Link
      href={`/company/ilan/${t.id}`}
      className="block rounded-xl border border-zinc-950/10 bg-white p-4 transition hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold text-zinc-400">
            {t.tenderNumber}
          </div>
          <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug text-zinc-950">
            {t.title}
          </h3>
        </div>
        <TenderStatusBadge status={t.status} className="shrink-0" />
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
        <AvatarInitials name={fullName(t)} size="sm" />
        <span className="truncate">{fullName(t)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <TenderTypeBadge format={t.format} />
        <span className="inline-flex items-center gap-1">
          <Mail className="h-3.5 w-3.5 text-zinc-400" />
          {t.invitationCount} davetli
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
          {t.bidCount} teklif
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-950/5 pt-2.5 text-xs">
        <span className="text-zinc-500">
          Açılış: {formatDate(t.publishedAt)}
        </span>
        <span className="text-zinc-700">
          {t.status === "OPEN" && t.bidsCloseAt ? (
            <CountdownTimer deadline={t.bidsCloseAt} className="text-xs" />
          ) : (
            <>Kapanış: {formatDate(t.bidsCloseAt)}</>
          )}
        </span>
      </div>
    </Link>
  );
}

function MobileSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-3 lg:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-950/10 bg-white p-4"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
          <div className="mt-2 h-5 w-2/3 animate-pulse rounded bg-zinc-100" />
          <div className="mt-3 flex gap-4">
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Birleşik bileşen ───────────────────────── */

export function TendersTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
}: TendersTableProps) {
  if (isError) {
    return (
      <div className="rounded-xl border border-zinc-950/10 bg-white px-6 py-16 text-center">
        <p className="font-medium text-zinc-900">Veri alınamadı.</p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Tekrar dene
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading && items.length === 0) {
    const n = Math.min(pageSize, 6);
    return (
      <>
        <DesktopSkeleton rows={n} />
        <MobileSkeleton count={n} />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-950/10 bg-white py-16 text-center">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <Inbox className="h-6 w-6" />
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
    <>
      <DesktopTable items={items} />
      <div className="flex flex-col gap-3 lg:hidden">
        {items.map((t) => (
          <MobileCard key={t.id} t={t} />
        ))}
      </div>
    </>
  );
}
