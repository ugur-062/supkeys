"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
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
import { ListSkeleton, Pagination } from "@/components/list";
import { useAuth } from "@/hooks/use-auth";
import { usePagedList } from "@/lib/use-paged-list";
import { useDeleteUser, useUpdateUser } from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
  MoreVertical,
  PowerOff,
  Power,
  Pencil,
  Trash2,
  Users2,
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
  const paged = usePagedList(users, 10);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-zinc-950/5 overflow-hidden">
        <ListSkeleton rows={4} />
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
      <div className="rounded-2xl bg-white ring-1 ring-zinc-950/5 overflow-hidden">
        <header className="px-6 py-4 border-b border-zinc-950/5 flex items-center gap-2">
          <Users2 className="h-4 w-4 text-zinc-500" />
          <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wide">
            Aktif Kullanıcılar ({users.length})
          </h3>
        </header>
        <div className="px-2 [--gutter:--spacing(6)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>Kullanıcı</TableHeader>
                <TableHeader>Rol</TableHeader>
                <TableHeader>Durum</TableHeader>
                <TableHeader>Son Giriş</TableHeader>
                <TableHeader className="text-right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.pageItems.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-zinc-700">
                          {(u.firstName[0] ?? "?").toUpperCase()}
                          {(u.lastName[0] ?? "").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 truncate">
                            {u.firstName} {u.lastName}
                            {isMe ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 font-normal">
                                (Siz)
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge color="zinc">{roleLabel(u.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge color="lime">Aktif</Badge>
                      ) : (
                        <Badge color="zinc">Pasif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {u.lastLoginAt
                        ? formatDistanceToNowStrict(new Date(u.lastLoginAt), {
                            addSuffix: true,
                            locale: tr,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isMe ? (
                        <Dropdown>
                          <DropdownButton plain aria-label="Aksiyonlar">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => setEditing(u)}>
                              <Pencil data-slot="icon" />
                              <DropdownLabel>Düzenle</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleToggleActive(u)}>
                              {u.isActive ? (
                                <>
                                  <PowerOff data-slot="icon" />
                                  <DropdownLabel>Pasif Yap</DropdownLabel>
                                </>
                              ) : (
                                <>
                                  <Power data-slot="icon" />
                                  <DropdownLabel>Tekrar Aktif Et</DropdownLabel>
                                </>
                              )}
                            </DropdownItem>
                            <DropdownDivider />
                            <DropdownItem onClick={() => setDeleting(u)}>
                              <Trash2 data-slot="icon" />
                              <DropdownLabel className="text-danger-700">
                                Sil
                              </DropdownLabel>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      ) : (
                        <span className="text-[11px] text-zinc-400">
                          Kendinizsiniz
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {paged.showPagination ? (
          <div className="px-4 pb-3">
            <Pagination
              variant="bare"
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={paged.pageSize}
              onPageChange={paged.setPage}
            />
          </div>
        ) : null}
      </div>

      <EditUserModal user={editing} onClose={() => setEditing(null)} />

      <Dialog
        open={Boolean(deleting)}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleting(null);
        }}
        size="md"
      >
        <DialogTitle>Kullanıcıyı Sil</DialogTitle>
        <DialogDescription>Bu işlem geri alınamaz.</DialogDescription>
        <DialogBody>
          {deleting ? (
            <>
              <p className="text-sm text-zinc-700">
                <strong className="text-zinc-900">
                  {deleting.firstName} {deleting.lastName}
                </strong>{" "}
                ({deleting.email}) kullanıcısını ekipten çıkarmak istediğinize
                emin misiniz?
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-zinc-600 list-disc pl-4">
                <li>Kullanıcı sisteme giriş yapamaz</li>
                <li>Listede görünmez ve davet edilemez</li>
                <li>Açtığı ihaleler ve onayladığı süreçler kayıtta kalır</li>
                <li>
                  E-posta tekrar kullanılabilir (yeni kullanıcı davet
                  edebilirsiniz)
                </li>
              </ul>
            </>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button
            plain
            onClick={() => setDeleting(null)}
            disabled={deleteMutation.isPending}
          >
            Vazgeç
          </Button>
          <Button
            color="red"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 data-slot="icon" />
            Sil
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
