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
import { EmailStatusBadge } from "@/components/ui/email-status-badge";
import { getTemplateLabel } from "@/lib/email-logs/status";
import type { EmailLog } from "@/lib/email-logs/types";
import { safeFormatDistance } from "@/lib/date";
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
  return safeFormatDistance(date, { addSuffix: true });
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
        <p className="text-zinc-900 font-medium">Veri alınamadı.</p>
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
            <TableHeader>Tarih</TableHeader>
            <TableHeader>Şablon</TableHeader>
            <TableHeader>Alıcı</TableHeader>
            <TableHeader>Durum</TableHeader>
            <TableHeader>Provider</TableHeader>
            <TableHeader className="text-right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {showSkeleton &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-zinc-100 rounded animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {showEmpty && (
            <TableRow>
              <TableCell colSpan={6} className="py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-zinc-500">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">E-posta logu yok</p>
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
              <TableCell className="text-zinc-500 whitespace-nowrap">
                {formatRelative(item.queuedAt)}
              </TableCell>
              <TableCell className="text-zinc-700">
                {getTemplateLabel(item.template)}
              </TableCell>
              <TableCell className="text-zinc-500">{item.toEmail}</TableCell>
              <TableCell>
                <EmailStatusBadge status={item.status} />
              </TableCell>
              <TableCell className="text-zinc-500 font-mono text-xs">
                {item.provider}
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
