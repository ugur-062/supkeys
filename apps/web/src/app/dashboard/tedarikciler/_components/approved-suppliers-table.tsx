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
    <TableRow>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 bg-zinc-100 rounded animate-pulse" />
        </TableCell>
      ))}
    </TableRow>
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
            <TableHeader>Üyelik</TableHeader>
            <TableHeader>Firma</TableHeader>
            <TableHeader>Vergi No</TableHeader>
            <TableHeader>İletişim</TableHeader>
            <TableHeader>İlişki Tarihi</TableHeader>
            <TableHeader className="text-right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading &&
            items.length === 0 &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}

          {showEmpty && (
            <TableRow>
              <TableCell colSpan={6}>
                <EmptyState
                  icon={Users2}
                  title="Henüz onaylı tedarikçiniz yok"
                  description="Tedarikçilerinizi davet ederek listenizi oluşturmaya başlayın."
                  action={
                    canInvite ? (
                      <Button onClick={onInvite} size="sm">
                        İlk Tedarikçinizi Davet Edin
                      </Button>
                    ) : null
                  }
                />
              </TableCell>
            </TableRow>
          )}

          {items.map((row) => {
            const meta = MEMBERSHIP_META[row.supplier.membership];
            const primary = row.supplier.users[0];
            return (
              <TableRow
                key={row.relationId}
                onClick={() => onSelect(row.relationId)}
                className="cursor-pointer hover:bg-zinc-950/2.5"
              >
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                      meta.badgeClass,
                    )}
                  >
                    {meta.label}
                  </span>
                </TableCell>
                <TableCell className="text-zinc-900">
                  <div className="font-medium">{row.supplier.companyName}</div>
                  <div className="text-xs text-zinc-500">
                    {COMPANY_TYPE_SHORT_LABEL[row.supplier.companyType]}
                  </div>
                </TableCell>
                <TableCell className="text-zinc-900 font-mono text-xs">
                  {row.supplier.taxNumber}
                </TableCell>
                <TableCell className="text-zinc-600">
                  {primary ? (
                    <>
                      <div>
                        {primary.firstName} {primary.lastName}
                      </div>
                      <a
                        href={`mailto:${primary.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline inline-flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        {primary.email}
                      </a>
                    </>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500 whitespace-nowrap">
                  {formatRelative(row.relationCreatedAt)}
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
