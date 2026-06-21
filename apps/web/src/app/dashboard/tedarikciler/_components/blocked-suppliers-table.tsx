"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { EmptyState } from "@/components/list";
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
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 bg-zinc-100 rounded animate-pulse" />
        </TableCell>
      ))}
    </TableRow>
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
        <p className="text-zinc-900 font-medium">Veri alınamadı.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const showEmpty = !isLoading && items.length === 0;

  return (
    <div className="px-2 [--gutter:--spacing(4)]">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>Firma</TableHeader>
            <TableHeader>Vergi No</TableHeader>
            <TableHeader>Engelleme Sebebi</TableHeader>
            <TableHeader>Engellenme Tarihi</TableHeader>
            <TableHeader className="text-right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading &&
            items.length === 0 &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <SkeletonRow key={i} cols={COLS} />
            ))}

          {showEmpty && (
            <TableRow>
              <TableCell colSpan={COLS}>
                <EmptyState
                  icon={ShieldOff}
                  variant="no-results"
                  title="Engellenmiş tedarikçi yok"
                  description="Henüz hiçbir tedarikçiyi engellememişsiniz."
                />
              </TableCell>
            </TableRow>
          )}

          {items.map((row) => (
            <TableRow
              key={row.relationId}
              onClick={() => onSelect(row.relationId)}
              className="cursor-pointer hover:bg-zinc-950/2.5"
            >
              <TableCell className="font-medium text-zinc-900">
                {row.supplier.companyName}
              </TableCell>
              <TableCell className="text-zinc-900 font-mono text-xs">
                {row.supplier.taxNumber}
              </TableCell>
              <TableCell className="text-zinc-600">
                {row.blockedReason ? (
                  <span title={row.blockedReason}>
                    {truncate(row.blockedReason, 60)}
                  </span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 whitespace-nowrap">
                {formatDate(row.blockedAt)}
              </TableCell>
              <TableCell className="text-right">
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyId === row.relationId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnblock(row.relationId, row.supplier.companyName);
                    }}
                  >
                    Engeli Kaldır
                  </Button>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
