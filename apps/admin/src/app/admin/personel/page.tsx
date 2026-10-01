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
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminRoleGate } from "@/components/layout/admin-role-gate";
import { PageHeader } from "@/components/list";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  useCreateStaff,
  useStaff,
  useStaffAction,
  type StaffRow,
} from "@/hooks/use-admin-staff";
import type { AdminRole } from "@/lib/auth/types";
import { safeFormat } from "@/lib/date";
import { Copy, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";

const ROLE_META: Record<
  AdminRole,
  { label: string; color: "red" | "blue" | "zinc" }
> = {
  SUPER_ADMIN: { label: "Süper Admin", color: "red" },
  SALES: { label: "Satış", color: "blue" },
  SUPPORT: { label: "Destek", color: "zinc" },
};

/** Geçici parola tek-seferlik gösterimi — panelde kalmaz, loglanmaz. */
function TempPasswordBanner({
  password,
  onClose,
}: {
  password: string;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
      <p className="text-sm font-medium text-emerald-900">
        Geçici şifre (BİR KEZ gösterilir — personele güvenli kanaldan iletin):
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="rounded bg-white px-2 py-1 font-mono text-sm">
          {password}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(password);
            toast.success("Kopyalandı");
          }}
          className="rounded p-1 text-emerald-800 hover:bg-emerald-100"
          aria-label="Şifreyi kopyala"
        >
          <Copy className="h-4 w-4" />
        </button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Kapat
        </Button>
      </div>
      <p className="mt-1 text-xs text-emerald-800">
        Personel ilk girişte bu geçici şifreyle girer; panel, kendi şifresini
        belirleyene kadar onu Ayarlar → Şifre Değiştir&apos;e yönlendirir.
      </p>
    </div>
  );
}

function AddStaffDialog({
  onConfirm,
  onClose,
  pending,
}: {
  onConfirm: (v: {
    email: string;
    firstName: string;
    lastName: string;
    role: AdminRole;
  }) => unknown;
  onClose: () => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "SUPPORT" as AdminRole,
  });


  const set = (k: string, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Dialog open onClose={onClose} size="md" aria-label="Personel ekle">
      <DialogTitle>Personel Ekle</DialogTitle>
      <DialogBody className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              E-posta
            </span>
            <Input
              type="email"
              autoFocus
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
              <option value="SUPPORT">Destek — salt-okuma + kurtarma</option>
              <option value="SALES">Satış — doğrulama + üyelik + müdahale</option>
              <option value="SUPER_ADMIN">Süper Admin — her şey</option>
            </Select>
          </label>
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
              // Promise döner → admin Button iş bitene dek kilitli; çift tık
              // ikinci personeli/409'u üretmez (arayüz testi FX-00 D-015).
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

function PersonelView() {
  const { admin } = useAdminAuth();
  const staff = useStaff();
  const create = useCreateStaff();
  const act = useStaffAction();
  const [adding, setAdding] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  // Rol değişimi = en riskli aksiyon → tek tık yerine onay dialog'u.
  const [rolePrompt, setRolePrompt] = useState<{
    id: string;
    email: string;
    from: AdminRole;
    to: AdminRole;
  } | null>(null);
  // Şifre sıfırlama da geri alınamaz (parola + 2FA + oturumlar düşer) → onay.
  const [resetPrompt, setResetPrompt] = useState<{
    id: string;
    email: string;
  } | null>(null);
  // Pasifleştirme personeli anında panelden atar (oturumları düşer) → onay
  // (arayüz testi D-222). Aktifleştirme zararsız, tek tık kalır.
  const [deactivatePrompt, setDeactivatePrompt] = useState<{
    id: string;
    email: string;
  } | null>(null);

  const err = (e: unknown) => toastApiError(e);
  const rows = staff.data ?? [];

  // F7: personel yönetimi yalnız SUPER_ADMIN (manageStaff). SALES/SUPPORT
  // deep-link'te sayfa kapısı (`AdminRoleGate`, aşağıda) bu görünümü HİÇ
  // mount etmez → personel sorgusu atılmaz, 403 toast'ı çıkmaz (T-09).

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Personel"
        description="Yönetici hesapları — rol atama, pasifleştirme, şifre sıfırlama."
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Personel Ekle
          </Button>
        }
      />

      {tempPw ? (
        <TempPasswordBanner password={tempPw} onClose={() => setTempPw(null)} />
      ) : null}

      {/* Dar ekranda tablo yatay kayar; ipucusuz Rol/Durum/İşlemler sütunları
          ekran dışında kalıyordu (arayüz testi D-229). */}
      <p className="text-admin-text-muted text-xs sm:hidden">
        Rol, durum ve işlemler için tabloyu yana kaydırın →
      </p>
      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Yönetici</TableHeader>
              <TableHeader>Rol</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Son giriş</TableHeader>
              <TableHeader className="text-right">İşlemler</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableStateRow
                colSpan={5}
                loading={staff.isLoading}
                empty="Kayıt yok"
              />
            ) : (
              rows.map((s: StaffRow) => {
                const rm = ROLE_META[s.role] ?? ROLE_META.SUPPORT;
                const isSelf = s.id === admin?.id;
                return (
                  <TableRow key={s.id}>
                    {/* Uzun e-posta sarar: ilk sütun dar ekranı tek başına
                        doldurmasın, sonraki sütun görünür kalsın (D-229). */}
                    <TableCell className="text-admin-text max-w-[14rem] whitespace-normal sm:max-w-none">
                      <span className="font-medium">
                        {s.firstName} {s.lastName}
                      </span>
                      {isSelf ? (
                        <Badge color="blue" className="ml-2">
                          Siz
                        </Badge>
                      ) : null}
                      <span className="text-admin-text-muted block text-xs break-all">
                        {s.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <select
                        value={s.role}
                        disabled={act.isPending || isSelf}
                        aria-label={`${s.email} rolü`}
                        onChange={(e) =>
                          // Anında mutasyon YOK — onay dialog'u açılır.
                          setRolePrompt({
                            id: s.id,
                            email: s.email,
                            from: s.role,
                            to: e.target.value as AdminRole,
                          })
                        }
                        className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-2 py-1 text-xs"
                      >
                        <option value="SUPPORT">Destek</option>
                        <option value="SALES">Satış</option>
                        <option value="SUPER_ADMIN">Süper Admin</option>
                      </select>
                      <Badge color={rm.color} className="ml-1.5">
                        {rm.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.isActive ? (
                        <Badge color="green">Aktif</Badge>
                      ) : (
                        <Badge color="red">Pasif</Badge>
                      )}
                      {s.twoFactorEnabled ? (
                        <Badge color="blue" className="ml-1.5">
                          2FA
                        </Badge>
                      ) : (
                        <Badge color="amber" className="ml-1.5">
                          2FA yok
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {s.lastLoginAt
                        ? safeFormat(s.lastLoginAt, "d MMM yyyy HH:mm")
                        : "Henüz giriş yapmadı"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Kendi satırında YOK (derin denetim MU-21): kendi
                            şifresini sıfırlayan tek Süper Admin parolasız,
                            2FA'sız ve oturumsuz kalıp panele dönemiyordu.
                            Kendi şifresi → Ayarlar → Şifre Değiştir. */}
                        {isSelf ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() =>
                              setResetPrompt({ id: s.id, email: s.email })
                            }
                          >
                            Şifre Sıfırla
                          </Button>
                        )}
                        {isSelf ? null : s.isActive ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() =>
                              setDeactivatePrompt({ id: s.id, email: s.email })
                            }
                          >
                            Pasifleştir
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() =>
                              act
                                .mutateAsync({ id: s.id, action: "active", active: true })
                                .then(() => toast.success("Aktifleştirildi"), err)
                            }
                          >
                            Aktifleştir
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {rolePrompt ? (
        <Dialog
          open
          onClose={() => setRolePrompt(null)}
          size="sm"
          aria-label="Rol değişikliği onayı"
        >
          <DialogTitle>Rol Değişikliği</DialogTitle>
          <DialogBody>
            <p className="text-admin-text text-sm">
              <strong>{rolePrompt.email}</strong> kullanıcısının rolü{" "}
              <Badge color={ROLE_META[rolePrompt.from].color}>
                {ROLE_META[rolePrompt.from].label}
              </Badge>{" "}
              →{" "}
              <Badge color={ROLE_META[rolePrompt.to].color}>
                {ROLE_META[rolePrompt.to].label}
              </Badge>{" "}
              olarak değiştirilecek.
              {rolePrompt.to === "SUPER_ADMIN"
                ? " DİKKAT: Süper Admin tüm yetkilere sahiptir."
                : ""}
            </p>
          </DialogBody>
          <DialogActions>
            <Button variant="ghost" onClick={() => setRolePrompt(null)}>
              Vazgeç
            </Button>
            <Button
              loading={act.isPending}
              onClick={() =>
                act.mutateAsync({ id: rolePrompt.id, action: "role", role: rolePrompt.to }).then(
                  () => {
                    toast.success("Rol güncellendi");
                    setRolePrompt(null);
                  },
                  (e: unknown) => {
                    err(e);
                    setRolePrompt(null);
                  },
                )
              }
            >
              Onayla
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}

      {resetPrompt ? (
        <Dialog
          open
          onClose={() => setResetPrompt(null)}
          size="sm"
          aria-label="Şifre sıfırlama onayı"
        >
          <DialogTitle>Şifre Sıfırla</DialogTitle>
          <DialogBody>
            <p className="text-admin-text text-sm">
              <strong>{resetPrompt.email}</strong> için yeni geçici şifre
              üretilecek. Mevcut şifre ve 2FA kaldırılır, açık oturumları
              kapanır.
            </p>
          </DialogBody>
          <DialogActions>
            <Button variant="ghost" onClick={() => setResetPrompt(null)}>
              Vazgeç
            </Button>
            <Button
              loading={act.isPending}
              onClick={() =>
                act.mutateAsync({ id: resetPrompt.id, action: "reset-password" }).then(
                  (r) => {
                    if (r.tempPassword) setTempPw(r.tempPassword);
                    toast.success("Şifre sıfırlandı");
                    setResetPrompt(null);
                  },
                  (e: unknown) => {
                    err(e);
                    setResetPrompt(null);
                  },
                )
              }
            >
              Sıfırla
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}

      {deactivatePrompt ? (
        <Dialog
          open
          onClose={() => setDeactivatePrompt(null)}
          size="sm"
          aria-label="Pasifleştirme onayı"
        >
          <DialogTitle>Personeli Pasifleştir</DialogTitle>
          <DialogBody>
            <p className="text-admin-text text-sm">
              <strong>{deactivatePrompt.email}</strong> pasifleştirilecek. Açık
              oturumları hemen kapanır ve yeniden aktifleştirilene kadar panele
              giriş yapamaz.
            </p>
          </DialogBody>
          <DialogActions>
            <Button variant="ghost" onClick={() => setDeactivatePrompt(null)}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              onClick={() =>
                act
                  .mutateAsync({ id: deactivatePrompt.id, action: "active", active: false })
                  .then(
                    () => {
                      toast.success("Pasifleştirildi");
                      setDeactivatePrompt(null);
                    },
                    (e: unknown) => {
                      err(e);
                      setDeactivatePrompt(null);
                    },
                  )
              }
            >
              Pasifleştir
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}

      {adding ? (
        <AddStaffDialog
          pending={create.isPending}
          onConfirm={(v) =>
            // mutateAsync: geçici şifreyi gösteren başarı dalı BU çağrıya bağlı
            // (mutate'in onSuccess'i yalnız son çağrıda çalışır).
            create.mutateAsync(v).then((r) => {
              setTempPw(r.tempPassword);
              setAdding(false);
              toast.success("Personel eklendi");
            }, err)
          }
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

export default function AdminPersonelPage() {
  return (
    <AdminShell>
      <AdminRoleGate action="manageStaff">
        <PersonelView />
      </AdminRoleGate>
    </AdminShell>
  );
}
