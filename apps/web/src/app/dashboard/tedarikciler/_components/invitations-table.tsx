"use client";

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
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
import { INVITATION_STATUS_META } from "@/lib/tedarikciler/status";
import type { InvitationItem } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import {
  format,
  formatDistanceToNow,
  formatDistanceToNowStrict,
} from "date-fns";
import { tr } from "date-fns/locale";
import {
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  MoreHorizontal,
} from "lucide-react";

interface InvitationsTableProps {
  items: InvitationItem[];
  isLoading: boolean;
  isError: boolean;
  pageSize: number;
  canManage: boolean;
  onRetry: () => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
  onReinvite: (item: InvitationItem) => void;
  busyId?: string | null;
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

function formatExpiresAt(expiresAt: string, status: string) {
  if (status !== "PENDING") return "—";
  const d = new Date(expiresAt);
  if (d.getTime() < Date.now()) return "Süresi geçti";
  try {
    return `${formatDistanceToNowStrict(d, { locale: tr })} kaldı`;
  } catch {
    return "—";
  }
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

const COLS = 7;

/**
 * Davet linki / kısa kod takibi: alıcı tarafa "tedarikçi linki açtı mı"
 * göstergesi. /api/registration/supplier/invitation-info çağrıldığında veya
 * accept-invitation transaction'ında openedAt set edilir.
 */
function OpenedBadge({ openedAt }: { openedAt: string | null }) {
  if (!openedAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 text-xs whitespace-nowrap">
        <Clock className="h-3 w-3" />
        Açılmadı
      </span>
    );
  }

  const date = new Date(openedAt);
  const minutesAgo = (Date.now() - date.getTime()) / 60_000;

  if (minutesAgo >= 0 && minutesAgo < 5) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 text-white text-xs whitespace-nowrap animate-pulse">
        <Eye className="h-3 w-3" />
        Şu an inceliyor
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-success-50 text-success-700 text-xs whitespace-nowrap"
      title={format(date, "dd MMM yyyy HH:mm", { locale: tr })}
    >
      <CheckCircle2 className="h-3 w-3" />
      {formatRelative(openedAt)} açıldı
    </span>
  );
}

export function InvitationsTable({
  items,
  isLoading,
  isError,
  pageSize,
  canManage,
  onRetry,
  onResend,
  onCancel,
  onReinvite,
  busyId,
}: InvitationsTableProps) {
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
            <TableHeader>E-posta</TableHeader>
            <TableHeader>Yetkili</TableHeader>
            <TableHeader>Statü</TableHeader>
            <TableHeader>Gönderildi</TableHeader>
            <TableHeader>Geçerlilik</TableHeader>
            <TableHeader>Görüldü mü?</TableHeader>
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
                  icon={Inbox}
                  title="Henüz davet göndermediniz"
                  description="“Yeni Tedarikçi Davet Et” ile başlayın."
                />
              </TableCell>
            </TableRow>
          )}

          {items.map((it) => {
            const meta = INVITATION_STATUS_META[it.status];
            const expired =
              it.status === "PENDING" &&
              new Date(it.expiresAt).getTime() < Date.now();
            return (
              <TableRow key={it.id}>
                <TableCell className="font-medium text-zinc-900 break-all">
                  {it.email}
                </TableCell>
                <TableCell className="text-zinc-600">
                  {it.contactName || <span className="text-zinc-400">—</span>}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                      meta.badgeClass,
                    )}
                  >
                    {expired ? "Süresi Doldu" : meta.label}
                  </span>
                  {it.sentCount > 1 && (
                    <span className="ml-2 text-xs text-zinc-500">
                      ({it.sentCount} kez)
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className="text-zinc-500 whitespace-nowrap"
                  title={format(new Date(it.lastSentAt), "dd MMM yyyy HH:mm", {
                    locale: tr,
                  })}
                >
                  {formatRelative(it.lastSentAt)}
                </TableCell>
                <TableCell className="text-zinc-500 whitespace-nowrap">
                  {formatExpiresAt(it.expiresAt, it.status)}
                </TableCell>
                <TableCell>
                  <OpenedBadge openedAt={it.openedAt} />
                </TableCell>
                <TableCell className="text-right">
                  {canManage ? (
                    <Dropdown>
                      <DropdownButton
                        plain
                        aria-label="Aksiyonlar"
                        disabled={busyId === it.id}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownButton>
                      <DropdownMenu anchor="bottom end">
                        {it.status === "PENDING" && !expired && (
                          <>
                            <DropdownItem onClick={() => onResend(it.id)}>
                              <DropdownLabel>Yeniden Gönder</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem onClick={() => onCancel(it.id)}>
                              <DropdownLabel className="text-danger-600">
                                İptal Et
                              </DropdownLabel>
                            </DropdownItem>
                          </>
                        )}
                        {(it.status === "EXPIRED" || expired) && (
                          <DropdownItem onClick={() => onReinvite(it)}>
                            <DropdownLabel>Yeniden Davet Et</DropdownLabel>
                          </DropdownItem>
                        )}
                        {it.status === "ACCEPTED" && (
                          <div className="px-3.5 py-2 text-xs text-zinc-500 sm:px-3">
                            {it.acceptedBySupplier
                              ? `Kabul: ${it.acceptedBySupplier.companyName}`
                              : "Kabul edildi"}
                          </div>
                        )}
                        {it.status === "CANCELLED" && (
                          <div className="px-3.5 py-2 text-xs text-zinc-500 sm:px-3">
                            İptal edilmiş
                          </div>
                        )}
                      </DropdownMenu>
                    </Dropdown>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
