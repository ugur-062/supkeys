"use client";

import { Button } from "@/components/ui/button";
import { INVITATION_STATUS_META } from "@/lib/tedarikciler/status";
import type { InvitationItem } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
    <tr className="border-t border-surface-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs whitespace-nowrap">
        <Clock className="h-3 w-3" />
        Açılmadı
      </span>
    );
  }

  const date = new Date(openedAt);
  const minutesAgo = (Date.now() - date.getTime()) / 60_000;

  if (minutesAgo >= 0 && minutesAgo < 5) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs whitespace-nowrap animate-pulse">
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
              E-posta
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Yetkili
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Statü
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Gönderildi
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Geçerlilik
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
              Görüldü mü?
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            items.length === 0 &&
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <SkeletonRow key={i} cols={COLS} />
            ))}

          {showEmpty && (
            <tr>
              <td colSpan={COLS} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-brand-900">
                      Henüz davet göndermediniz
                    </p>
                    <p className="text-sm">
                      &ldquo;Yeni Tedarikçi Davet Et&rdquo; ile başlayın.
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          )}

          {items.map((it) => {
            const meta = INVITATION_STATUS_META[it.status];
            const expired =
              it.status === "PENDING" &&
              new Date(it.expiresAt).getTime() < Date.now();
            return (
              <tr
                key={it.id}
                className="border-t border-surface-border hover:bg-surface-muted/60 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-brand-900 break-all">
                  {it.email}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {it.contactName || (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                      meta.badgeClass,
                    )}
                  >
                    {expired ? "Süresi Doldu" : meta.label}
                  </span>
                  {it.sentCount > 1 && (
                    <span className="ml-2 text-xs text-slate-500">
                      ({it.sentCount} kez)
                    </span>
                  )}
                </td>
                <td
                  className="px-4 py-3 text-slate-500 whitespace-nowrap"
                  title={format(new Date(it.lastSentAt), "dd MMM yyyy HH:mm", {
                    locale: tr,
                  })}
                >
                  {formatRelative(it.lastSentAt)}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {formatExpiresAt(it.expiresAt, it.status)}
                </td>
                <td className="px-4 py-3">
                  <OpenedBadge openedAt={it.openedAt} />
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage ? (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-muted text-slate-500 hover:text-brand-700 transition-colors disabled:opacity-50"
                          aria-label="Aksiyonlar"
                          disabled={busyId === it.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={4}
                          className="z-50 min-w-[200px] rounded-lg border border-surface-border bg-white p-1 shadow-lg"
                        >
                          {it.status === "PENDING" && !expired && (
                            <>
                              <DropdownMenu.Item
                                onSelect={() => onResend(it.id)}
                                className="flex items-center px-2 py-1.5 text-sm rounded-md hover:bg-surface-muted cursor-pointer outline-none"
                              >
                                Yeniden Gönder
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onSelect={() => onCancel(it.id)}
                                className="flex items-center px-2 py-1.5 text-sm rounded-md hover:bg-danger-50 text-danger-600 cursor-pointer outline-none"
                              >
                                İptal Et
                              </DropdownMenu.Item>
                            </>
                          )}
                          {(it.status === "EXPIRED" || expired) && (
                            <DropdownMenu.Item
                              onSelect={() => onReinvite(it)}
                              className="flex items-center px-2 py-1.5 text-sm rounded-md hover:bg-surface-muted cursor-pointer outline-none"
                            >
                              Yeniden Davet Et
                            </DropdownMenu.Item>
                          )}
                          {it.status === "ACCEPTED" && (
                            <div className="px-2 py-1.5 text-xs text-slate-500">
                              {it.acceptedBySupplier
                                ? `Kabul: ${it.acceptedBySupplier.companyName}`
                                : "Kabul edildi"}
                            </div>
                          )}
                          {it.status === "CANCELLED" && (
                            <div className="px-2 py-1.5 text-xs text-slate-500">
                              İptal edilmiş
                            </div>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
