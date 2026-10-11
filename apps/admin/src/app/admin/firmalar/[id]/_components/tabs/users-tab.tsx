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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

/**
 * Rol sütunu — firma panelinin Kullanıcılar listesiyle aynı kural (D-305):
 * rolsüz ama izinli üye Görüntüleyici hazır setidir; izinsiz olan "Yetki yok".
 * Rolsüz kurucunun rozeti ad hücresinde — sütun "—" kalır.
 */
function roleText(u: Pick<AdminCompanyUser, "roles" | "permissions" | "isOwner">): string {
  if (u.roles.length) return u.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ");
  if (u.isOwner) return "—";
  return (u.permissions ?? []).length > 0 ? "Görüntüleyici" : "Yetki yok";
}

const ADDABLE_ROLES = [
  { value: "YONETICI", label: "Yönetici" },
  { value: "SATIN_ALMACI", label: "Satın Almacı" },
  { value: "SATISCI", label: "Satışçı" },
  { value: "ONAYLAYICI", label: "Onaylayıcı" },
];

/**
 * Satınalma yetkisi kilidinin nedeni — firma doğrulama durumuna göre
 * (ücretsiz dönem: doğrulama yeterli, satın alınacak bir şey yok).
 */
function buyLockNote(verification: string | undefined): string {
  const base =
    "Satınalma yetkisi (talep açma ve kazandırma) yalnız doğrulanmış firmada verilebilir.";
  if (verification === "PENDING") {
    return `${base} Firmanın doğrulaması inceleniyor — Belgeler sekmesinden sonuçlandırın.`;
  }
  if (verification === "REJECTED") {
    return `${base} Firmanın doğrulaması reddedildi — firma yeniden başvurmalı.`;
  }
  return `${base} Firma henüz doğrulanmadı — Belgeler sekmesinden doğrulayın.`;
}

/** Doğrudan üye ekleme dialog'u — kullanıcıya şifre kurma e-postası gider. */
function AddUserDialog({
  onConfirm,
  onClose,
  pending,
  canGrantBuy,
  verification,
}: {
  onConfirm: (v: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }) => unknown;
  onClose: () => void;
  pending: boolean;
  /** Firma tam yetkili mi — değilse Satın Almacı rolü verilemez (API kapısıyla aynı). */
  canGrantBuy: boolean;
  /** Kilidin nedeni metni için firmanın doğrulama durumu. */
  verification?: string;
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
              maxLength={200}
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
                maxLength={80}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-admin-text-muted text-xs font-medium">
                Soyad
              </span>
              <Input
                value={form.lastName}
                maxLength={80}
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
              {ADDABLE_ROLES.map((r) => {
                const locked = r.value === "SATIN_ALMACI" && !canGrantBuy;
                return (
                  <option key={r.value} value={r.value} disabled={locked}>
                    {locked ? `${r.label} (doğrulama gerekli)` : r.label}
                  </option>
                );
              })}
            </Select>
          </label>
          {!canGrantBuy ? (
            <p className="text-admin-text-muted text-xs">
              {buyLockNote(verification)}
            </p>
          ) : null}
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
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
                toast.error("Geçerli bir e-posta girin");
                return;
              }
              if (!form.firstName.trim() || !form.lastName.trim()) {
                toast.error("Ad ve soyad gerekli");
                return;
              }
              // Promise döner → admin Button iş bitene dek kilitli (FX-00 O-045).
              return onConfirm({
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
export function UsersTab({
  companyId,
  canGrantBuy = true,
  verification,
}: {
  companyId: string;
  /** Firma tam yetkili mi (satınalma yetkisi verilebilir mi). */
  canGrantBuy?: boolean;
  /** Firmanın doğrulama durumu — kilit notu buna göre yazılır. */
  verification?: string;
}) {
  const query = useAdminCompanyUsers(companyId);
  const recovery = useUserRecoveryAction(companyId);
  const setActive = useSetUserActive(companyId);
  const changeEmail = useChangeUserEmail(companyId);
  const addUser = useAddCompanyUser(companyId);
  const [dialog, setDialog] = useState<
    | { kind: "add" }
    | { kind: "email"; user: AdminCompanyUser }
    // Tek tıkla uygulanıyordu — kısa onay (arayüz testi D-209).
    | { kind: "deactivate"; user: AdminCompanyUser }
    | { kind: "dropSessions"; user: AdminCompanyUser }
    | null
  >(null);

  const err = (e: unknown) => toastApiError(e);
  const users = query.data ?? [];

  // Kurtarma eylemleri tek uçuşta: çift tık iki kod/şifre e-postası atmaz
  // (arayüz testi FX-00 D-178).
  const recoveryLock = useSubmitLock();
  const recoveryBusy = recovery.isPending || recoveryLock.locked;
  const runRecovery = (
    userId: string,
    action: "password-reset" | "resend-verification" | "drop-sessions",
    msg: string,
  ) =>
    recoveryLock.run(() =>
      recovery.mutateAsync({ userId, action }).then(() => toast.success(msg), err),
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
                    {roleText(u)}
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
                          disabled={recoveryBusy}
                          onClick={() =>
                            void runRecovery(
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
                                disabled={recoveryBusy}
                                onClick={() =>
                                  void runRecovery(
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
                              disabled={recoveryBusy}
                              onClick={() =>
                                setDialog({ kind: "dropSessions", user: u })
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
                                      setDialog({ kind: "deactivate", user: u })
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
          canGrantBuy={canGrantBuy}
          verification={verification}
          onConfirm={(v) =>
            addUser.mutateAsync(v).then(() => {
              toast.success(
                "Kullanıcı eklendi — şifre kurma e-postası gönderildi",
              );
              setDialog(null);
            }, err)
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
        // Biçim + uzunluk diyalogda doğrulanır; diyalog yalnız başarıda
        // kapanır — hata dalında yazılan adres kaybolmaz (arayüz testi D-204).
        type="email"
        maxLength={200}
        required
        confirmLabel="Değiştir"
        onConfirm={(v) => {
          if (dialog?.kind !== "email") return;
          return changeEmail
            .mutateAsync({ userId: dialog.user.id, email: (v || "").trim() })
            .then((r) => {
              toast.success(`E-posta güncellendi: ${r.email}`);
              setDialog(null);
            }, err);
        }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "deactivate"}
        title="Kullanıcıyı devre dışı bırak"
        confirmLabel="Devre Dışı Bırak"
        danger
        onConfirm={() => {
          if (dialog?.kind !== "deactivate") return;
          return setActive
            .mutateAsync({ userId: dialog.user.id, active: false })
            .then(() => {
              toast.success("Devre dışı bırakıldı — oturumları düşürüldü");
              setDialog(null);
            }, err);
        }}
        onClose={() => setDialog(null)}
      >
        <p>
          <strong>
            {dialog?.kind === "deactivate" ? dialog.user.email : ""}
          </strong>{" "}
          giriş yapamaz ve açık oturumları kapanır. İstediğinizde
          &quot;Aktifleştir&quot; ile geri açabilirsiniz.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "dropSessions"}
        title="Oturumları düşür"
        confirmLabel="Oturumları Düşür"
        danger
        onConfirm={() => {
          if (dialog?.kind !== "dropSessions") return;
          return runRecovery(
            dialog.user.id,
            "drop-sessions",
            "Oturumlar düşürüldü",
          ).then(() => setDialog(null));
        }}
        onClose={() => setDialog(null)}
      >
        <p>
          <strong>
            {dialog?.kind === "dropSessions" ? dialog.user.email : ""}
          </strong>{" "}
          tüm cihazlarda oturumdan çıkarılır; yeniden giriş yapması gerekir.
        </p>
      </ConfirmDialog>
    </div>
  );
}
