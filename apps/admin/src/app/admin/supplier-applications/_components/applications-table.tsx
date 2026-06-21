"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
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
            <TableHeader>Yetkili</TableHeader>
            <TableHeader>E-posta</TableHeader>
            <TableHeader>Tip</TableHeader>
            <TableHeader>Vergi No</TableHeader>
            <TableHeader>Statü</TableHeader>
            <TableHeader>Davet</TableHeader>
            <TableHeader>Tarih</TableHeader>
            <TableHeader className="text-right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {showSkeleton &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: COLUMN_COUNT }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-zinc-100 rounded animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {showEmpty && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-zinc-500">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">
                      Henüz tedarikçi başvurusu yok
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
                {item.adminFirstName} {item.adminLastName}
              </TableCell>
              <TableCell className="text-zinc-500">
                <a
                  href={`mailto:${item.adminEmail}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-zinc-900 hover:underline"
                >
                  {item.adminEmail}
                </a>
              </TableCell>
              <TableCell className="text-zinc-500 whitespace-nowrap">
                {COMPANY_TYPE_SHORT_LABEL[item.companyType]}
              </TableCell>
              <TableCell className="text-zinc-700 font-mono text-xs">
                {item.taxNumber}
              </TableCell>
              <TableCell>
                <ApplicationStatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                {item.invitedByTenant ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200 text-xs font-medium max-w-[180px]"
                    title={`${item.invitedByTenant.name} tarafından davet edildi`}
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.invitedByTenant.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-50 text-zinc-500 border border-zinc-200 text-xs font-medium">
                    <User className="w-3 h-3" />
                    Self
                  </span>
                )}
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
