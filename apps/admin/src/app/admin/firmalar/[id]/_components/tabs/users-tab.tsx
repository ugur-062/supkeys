"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/catalyst/select";
import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  Dialog,
  DialogActions,
  DialogBody,
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
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAddCompanyUser,
  useAdminCompanyUsers,
  useChangeUserEmail,
  useSetUserActive,
  useUserRecoveryAction,
  type AdminCompanyUser,
} from "@/hooks/use-admin-company-users";
import { safeFormat } from "@/lib/date";
import {
  EllipsisVertical,
  KeyRound,
  LogOut,
  MailCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

const ADDABLE_ROLES = [
  { value: "YONETICI", label: "Yönetici" },
  { value: "SATIN_ALMACI", label: "Satın Almacı" },
  { value: "SATISCI", label: "Satışçı" },
  { value: "ONAYLAYICI", label: "Onaylayıcı" },
];

/** Doğrudan üye ekleme dialog'u — kullanıcıya şifre kurma e-postası gider. */
function AddUserDialog({
  onConfirm,
  onClose,
  pending,
}: {
  onConfirm: (v: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "YONETICI",
  });


  const set = (k: string, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Dialog open onClose={onClose} size="md" aria-label="Kullanıcı ekle">
      <DialogTitle>Kullanıcı Ekle</DialogTitle>
      <DialogBody className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              E-posta
            </span>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-admin-text-muted text-xs font-medium">
                Ad
              </span>
              <Input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-admin-text-muted text-xs font-medium">
                Soyad
              </span>
              <Input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              Rol
            </span>
            <Select
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
            >
              {ADDABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-admin-text-muted text-xs">
            Kullanıcıya şifre belirleme e-postası gönderilir; e-posta
            doğrulama adımı atlanır (kimliği telefonda doğruladınız).
          </p>
      </DialogBody>
      <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            loading={pending}
            onClick={() => {
              if (!form.email.includes("@")) {
                toast.error("Geçerli bir e-posta girin");
                return;
              }
              if (!form.firstName.trim() || !form.lastName.trim()) {
                toast.error("Ad ve soyad gerekli");
                return;
              }
              onConfirm({
                email: form.email.trim(),
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                role: form.role,
              });
            }}
          >
            Ekle
          </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Kullanıcılar — üye listesi + kurtarma aksiyonları (Faz 4). */
export function UsersTab({ companyId }: { companyId: string }) {
  const query = useAdminCompanyUsers(companyId);
  const recovery = useUserRecoveryAction(companyId);
  const setActive = useSetUserActive(companyId);
  const changeEmail = useChangeUserEmail(companyId);
  const addUser = useAddCompanyUser(companyId);
  const [dialog, setDialog] = useState<
    | { kind: "add" }
    | { kind: "email"; user: AdminCompanyUser }
    | null
  >(null);

  const err = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Hata");
  const users = query.data ?? [];

  const runRecovery = (
    userId: string,
    action: "password-reset" | "resend-verification" | "drop-sessions",
    msg: string,
  ) =>
    recovery.mutate(
      { userId, action },
      { onSuccess: () => toast.success(msg), onError: err },
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialog({ kind: "add" })}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Kullanıcı Ekle
        </Button>
      </div>

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Kullanıcı</TableHeader>
              <TableHeader>Rol</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Son giriş</TableHeader>
              <TableHeader className="text-right">İşlemler</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.length === 0 ? (
              <TableStateRow
                colSpan={5}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Kullanıcı yok"
              />
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-admin-text">
                    <span className="font-medium">
                      {u.firstName} {u.lastName}
                    </span>
                    {u.isOwner ? (
                      <Badge color="amber" className="ml-2">
                        Kurucu
                      </Badge>
                    ) : null}
                    <span className="text-admin-text-muted block text-xs">
                      {u.email}
                      {!u.emailVerifiedAt ? (
                        <Badge color="amber" className="ml-1.5">
                          Doğrulanmadı
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-admin-text text-sm">
                    {u.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    {u.deletedAt ? (
                      <Badge color="zinc">Silinmiş</Badge>
                    ) : u.isActive ? (
                      <Badge color="green">Aktif</Badge>
                    ) : (
                      <Badge color="red">Pasif</Badge>
                    )}
                    {u.twoFactorEnabled ? (
                      <Badge color="blue" className="ml-1.5">
                        2FA
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {u.lastLoginAt
                      ? safeFormat(u.lastLoginAt, "d MMM yyyy HH:mm")
                      : "Henüz giriş yapmadı"}
                  </TableCell>
                  <TableCell>
                    {/* En sık kurtarma (Şifre) hızlı buton; kalanı ⋯ menüde. */}
                    {u.deletedAt ? null : (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Şifre sıfırlama e-postası gönder"
                          disabled={recovery.isPending}
                          onClick={() =>
                            runRecovery(
                              u.id,
                              "password-reset",
                              "Şifre sıfırlama e-postası gönderildi",
                            )
                          }
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" /> Şifre
                        </Button>
                        <Dropdown>
                          <DropdownButton
                            plain
                            aria-label={`${u.email} işlemleri`}
                            className="!px-1.5"
                          >
                            <EllipsisVertical className="size-4 text-zinc-500" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            {!u.emailVerifiedAt ? (
                              <DropdownItem
                                onClick={() =>
                                  runRecovery(
                                    u.id,
                                    "resend-verification",
                                    "Doğrulama kodu gönderildi",
                                  )
                                }
                              >
                                <MailCheck data-slot="icon" />
                                <DropdownLabel>
                                  Doğrulama Kodunu Gönder
                                </DropdownLabel>
                              </DropdownItem>
                            ) : null}
                            <DropdownItem
                              onClick={() =>
                                runRecovery(
                                  u.id,
                                  "drop-sessions",
                                  "Oturumlar düşürüldü",
                                )
                              }
                            >
                              <LogOut data-slot="icon" />
                              <DropdownLabel>Oturumları Düşür</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem
                              onClick={() =>
                                setDialog({ kind: "email", user: u })
                              }
                            >
                              <DropdownLabel>
                                E-posta Adresini Değiştir
                              </DropdownLabel>
                            </DropdownItem>
                            {u.isOwner ? null : (
                              <>
                                <DropdownDivider />
                                {u.isActive ? (
                                  <DropdownItem
                                    onClick={() =>
                                      setActive.mutate(
                                        { userId: u.id, active: false },
                                        {
                                          onSuccess: () =>
                                            toast.success(
                                              "Devre dışı bırakıldı — oturumları düşürüldü",
                                            ),
                                          onError: err,
                                        },
                                      )
                                    }
                                  >
                                    <DropdownLabel>
                                      Devre Dışı Bırak
                                    </DropdownLabel>
                                  </DropdownItem>
                                ) : (
                                  <DropdownItem
                                    onClick={() =>
                                      setActive.mutate(
                                        { userId: u.id, active: true },
                                        {
                                          onSuccess: () =>
                                            toast.success("Aktifleştirildi"),
                                          onError: err,
                                        },
                                      )
                                    }
                                  >
                                    <DropdownLabel>Aktifleştir</DropdownLabel>
                                  </DropdownItem>
                                )}
                              </>
                            )}
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {dialog?.kind === "add" ? (
        <AddUserDialog
          pending={addUser.isPending}
          onConfirm={(v) =>
            addUser.mutate(v, {
              onSuccess: () => {
                toast.success(
                  "Kullanıcı eklendi — şifre kurma e-postası gönderildi",
                );
                setDialog(null);
              },
              onError: err,
            })
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      <PromptDialog
        open={dialog?.kind === "email"}
        title="E-posta Adresi Değiştir"
        label={
          dialog?.kind === "email"
            ? `Yeni e-posta (${dialog.user.email} yerine)`
            : "Yeni e-posta"
        }
        placeholder="yeni@firma.com"
        required
        confirmLabel="Değiştir"
        onConfirm={(v) => {
          if (dialog?.kind !== "email") return;
          changeEmail.mutate(
            { userId: dialog.user.id, email: (v || "").trim() },
            {
              onSuccess: (r) =>
                toast.success(`E-posta güncellendi: ${r.email}`),
              onError: err,
            },
          );
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
