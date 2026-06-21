"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DemoRequest } from "@/lib/demo-requests/types";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight, Inbox } from "lucide-react";

interface DemoRequestsTableProps {
  items: DemoRequest[];
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

export function DemoRequestsTable({
  items,
  isLoading,
  isError,
  pageSize,
  onRetry,
  onSelect,
}: DemoRequestsTableProps) {
  if (isError) {
    return (
      <div className="px-6 py-16 text-center space-y-3">
        <p className="text-zinc-900 font-medium">Veri alınamadı.</p>
        <p className="text-sm text-zinc-500">
          Bir hata oluştu, lütfen tekrar deneyin.
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const showEmpty = !isLoading && items.length === 0;
  const showSkeleton = isLoading && items.length === 0;

  return (
    <div className="px-2 [--gutter:--spacing(4)]">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>Firma</TableHeader>
            <TableHeader>İlgili Kişi</TableHeader>
            <TableHeader>E-posta</TableHeader>
            <TableHeader>Statü</TableHeader>
            <TableHeader>Atanmış</TableHeader>
            <TableHeader>Tarih</TableHeader>
            <TableHeader className="text-right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {showSkeleton &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-zinc-100 rounded animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {showEmpty && (
            <TableRow>
              <TableCell colSpan={7} className="py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-zinc-500">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">
                      Henüz demo talebi yok
                    </p>
                    <p className="text-sm">
                      Filtreleri temizleyerek tekrar deneyebilirsin.
                    </p>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          )}

          {items.map((item) => (
            <TableRow
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="cursor-pointer"
            >
              <TableCell className="font-medium text-zinc-900">
                {item.companyName}
              </TableCell>
              <TableCell className="text-zinc-700">
                {item.contactName}
                {item.jobTitle && (
                  <div className="text-xs text-zinc-500">{item.jobTitle}</div>
                )}
              </TableCell>
              <TableCell className="text-zinc-500">
                <a
                  href={`mailto:${item.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-zinc-900 hover:underline"
                >
                  {item.email}
                </a>
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell className="text-zinc-500">
                {item.assignedTo
                  ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
                  : "—"}
              </TableCell>
              <TableCell className="text-zinc-500 whitespace-nowrap">
                {formatRelative(item.createdAt)}
              </TableCell>
              <TableCell className="text-right">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
