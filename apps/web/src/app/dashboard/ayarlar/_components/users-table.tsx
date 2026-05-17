"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteUser, useUpdateUser } from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { USER_ROLE_LABELS, roleLabel } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertTriangle,
  Loader2,
  MoreVertical,
  PowerOff,
  Power,
  Pencil,
  Trash2,
  Users2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditUserModal } from "./edit-user-modal";

interface Props {
  users: TenantUserListItem[];
  loading: boolean;
}

export function UsersTable({ users, loading }: Props) {
  const { user: me } = useAuth();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const [editing, setEditing] = useState<TenantUserListItem | null>(null);
  const [deleting, setDeleting] = useState<TenantUserListItem | null>(null);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Kullanıcılar yükleniyor…
      </div>
    );
  }

  const handleToggleActive = (user: TenantUserListItem) => {
    updateMutation.mutate(
      { id: user.id, payload: { isActive: !user.isActive } },
      {
        onSuccess: () => {
          toast.success(
            user.isActive
              ? `${user.firstName} pasif yapıldı`
              : `${user.firstName} tekrar aktif edildi`,
          );
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "İşlem başarısız"));
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(`${deleting.firstName} ${deleting.lastName} silindi`);
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(extractErrorMessage(err, "Silme başarısız"));
      },
    });
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <Users2 className="h-4 w-4 text-brand-600" />
          <h3 className="text-xs font-bold text-brand-900 uppercase tracking-wide">
            Aktif Kullanıcılar ({users.length})
          </h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-slate-700">
                  Kullanıcı
                </th>
                <th className="text-left px-6 py-3 font-semibold text-slate-700">
                  Rol
                </th>
                <th className="text-left px-6 py-3 font-semibold text-slate-700">
                  Durum
                </th>
                <th className="text-left px-6 py-3 font-semibold text-slate-700">
                  Son Giriş
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isMe = u.id === me?.id;
                const meta = USER_ROLE_LABELS[u.role];
                return (
                  <tr key={u.id} className="hover:bg-slate-50/40 transition">
                    <td className="px-6 py-3 align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0 text-xs font-bold text-brand-700">
                          {(u.firstName[0] ?? "?").toUpperCase()}
                          {(u.lastName[0] ?? "").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-brand-900 truncate">
                            {u.firstName} {u.lastName}
                            {isMe ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500 font-normal">
                                (Siz)
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 align-middle">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold border",
                          meta.pillClass,
                        )}
                      >
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-6 py-3 align-middle">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-success-700 font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Pasif
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 align-middle text-xs text-slate-500">
                      {u.lastLoginAt
                        ? formatDistanceToNowStrict(new Date(u.lastLoginAt), {
                            addSuffix: true,
                            locale: tr,
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-3 align-middle text-right">
                      {!isMe ? (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
                              aria-label="Aksiyonlar"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              sideOffset={6}
                              className="z-50 min-w-[200px] rounded-xl bg-white p-1.5 shadow-xl border border-slate-200"
                            >
                              <DropdownMenu.Item
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setEditing(u);
                                }}
                                className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-brand-900 hover:bg-brand-50 focus:bg-brand-50"
                              >
                                <Pencil className="h-4 w-4" />
                                Düzenle
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleToggleActive(u);
                                }}
                                className={cn(
                                  "px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2",
                                  u.isActive
                                    ? "text-warning-700 hover:bg-warning-50 focus:bg-warning-50"
                                    : "text-success-700 hover:bg-success-50 focus:bg-success-50",
                                )}
                              >
                                {u.isActive ? (
                                  <>
                                    <PowerOff className="h-4 w-4" />
                                    Pasif Yap
                                  </>
                                ) : (
                                  <>
                                    <Power className="h-4 w-4" />
                                    Tekrar Aktif Et
                                  </>
                                )}
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
                              <DropdownMenu.Item
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setDeleting(u);
                                }}
                                className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-danger-700 hover:bg-danger-50 focus:bg-danger-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                Sil
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          Kendinizsiniz
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <EditUserModal
        user={editing}
        onClose={() => setEditing(null)}
      />

      <Dialog.Root
        open={Boolean(deleting)}
        onOpenChange={(o) => {
          if (!o && !deleteMutation.isPending) setDeleting(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/60" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2",
              "w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-white shadow-2xl outline-none",
            )}
          >
            <header className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-danger-50">
                  <AlertTriangle className="h-5 w-5 text-danger-600" />
                </div>
                <div>
                  <Dialog.Title className="font-display text-lg font-bold text-brand-900">
                    Kullanıcıyı Sil
                  </Dialog.Title>
                  <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                    Bu işlem geri alınamaz.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Kapat"
                  disabled={deleteMutation.isPending}
                  className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-600 disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </header>

            <div className="px-5 py-5">
              {deleting ? (
                <>
                  <p className="text-sm text-slate-700">
                    <strong className="text-brand-900">
                      {deleting.firstName} {deleting.lastName}
                    </strong>{" "}
                    ({deleting.email}) kullanıcısını ekipten çıkarmak istediğinize
                    emin misiniz?
                  </p>
                  <ul className="mt-3 space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    <li>Kullanıcı sisteme giriş yapamaz</li>
                    <li>Listede görünmez ve davet edilemez</li>
                    <li>
                      Açtığı ihaleler ve onayladığı süreçler kayıtta kalır
                    </li>
                    <li>
                      E-posta tekrar kullanılabilir (yeni kullanıcı davet
                      edebilirsiniz)
                    </li>
                  </ul>
                </>
              ) : null}
            </div>

            <footer className="flex items-center gap-2 border-t border-surface-border px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleting(null)}
                disabled={deleteMutation.isPending}
                className="flex-1"
              >
                Vazgeç
              </Button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-danger-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Sil
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
