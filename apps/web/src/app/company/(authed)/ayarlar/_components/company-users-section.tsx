"use client";

import { ROLE_LABELS } from "@/lib/company/labels";
import { RoleBadge } from "@/components/ui/role-badge";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
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
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import {
  useCancelInvitation,
  useCompanyInvitations,
  useCompanyUsers,
  usePermissionCatalog,
  useRemoveUser,
  useResendInvitation,
  useSeats,
  useSeatSelection,
  useSetUserActive,
  useSetUserPermissions,
  useUpdateUser,
  type CompanyTeamUser,
  type SeatKeep,
} from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { SelectMenu } from "@/components/ui/select-menu";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Crown,
  MailPlus,
  MoreVertical,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  Users2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { InviteUserDialog } from "./invite-user-dialog";
import { PermissionTable } from "@/components/company/permission-table";

const ROLE_LABEL = ROLE_LABELS;

export function CompanyUsersSection({
  canManage,
  meId,
}: {
  canManage: boolean;
  meId: string | undefined;
}) {
  const { data: users, isLoading } = useCompanyUsers();
  const { data: seats } = useSeats();
  const seatSelection = useSeatSelection();
  const setActive = useSetUserActive();
  const removeUser = useRemoveUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyTeamUser | null>(null);
  const [deleting, setDeleting] = useState<CompanyTeamUser | null>(null);
  // Faz K — kurucu koltuk seçimi (aşkın durum).
  const [seatSelOpen, setSeatSelOpen] = useState(false);
  const [keep, setKeep] = useState<SeatKeep[]>([]);
  const keepKey = (k: SeatKeep) => `${k.userId}:${k.group}`;

  const meIsOwner = (users ?? []).find((u) => u.id === meId)?.isOwner ?? false;

  const handleToggleActive = async (u: CompanyTeamUser) => {
    try {
      await setActive.mutateAsync({ id: u.id, active: !u.isActive });
      toast.success(u.isActive ? "Pasif yapıldı" : "Tekrar aktif edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await removeUser.mutateAsync(deleting.id);
      toast.success("Kullanıcı çıkarıldı");
      setDeleting(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Çıkarılamadı"));
    }
  };

  return (
    <div className="overflow-hidden card">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-zinc-500" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-900">
            Kullanıcılar ({(users ?? []).length})
          </h3>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>Üye Davet Et</Button>
        ) : null}
      </header>

      {/* Faz K — koltuk barı: SA/ST taşıyan aktif kişi sayısı / paket limiti. */}
      {seats && seats.limit != null ? (
        <div className="border-b border-zinc-950/5 px-5 py-2.5 text-xs text-zinc-600">
          Koltuk: <strong>{seats.used}/{seats.limit}</strong>
          <span className="ml-1 text-zinc-400">
            (satınalma {seats.usedBuy} · satış {seats.usedSell}
            {seats.pendingSeatInvites > 0
              ? ` · bekleyen davet ${seats.pendingSeatInvites}`
              : ""}
            )
          </span>
          <span className="ml-1 text-zinc-400">
            — satınalma ve satış işlem yetkisi ayrı koltuk sayar
          </span>
        </div>
      ) : null}
      {seats && seats.overflow > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <span>
            Paketinizde <strong>{seats.limit}</strong> koltuk var,{" "}
            <strong>{seats.overflow}</strong> koltuk fazla — yeni işlem yetkisi
            verilemez. Mevcut kullanıcılar çalışmaya devam eder.
          </span>
          {meIsOwner ? (
            <Button
              onClick={() => {
                setKeep([]);
                setSeatSelOpen(true);
              }}
            >
              Kalacak Koltukları Seç
            </Button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <p className="px-5 py-6 text-sm text-zinc-500">Yükleniyor…</p>
      ) : (
        <div className="px-2 [--gutter:--spacing(5)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>Kullanıcı</TableHeader>
                <TableHeader>Roller</TableHeader>
                <TableHeader>Durum</TableHeader>
                <TableHeader>Son Giriş</TableHeader>
                <TableHeader className="text-right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {(users ?? []).map((u) => {
                const isMe = u.id === meId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <AvatarInitials
                          name={`${u.firstName} ${u.lastName}`}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900">
                            {u.firstName} {u.lastName}
                            {u.isOwner ? (
                              <span className="ml-1.5 align-middle">
                                <RoleBadge owner />
                              </span>
                            ) : null}
                            {isMe ? (
                              <span className="ml-1.5 text-xs uppercase text-zinc-400">
                                (Siz)
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.filter((r) => !(u.isOwner && r === "SAHIP")).length ? (
                          // C49: Kurucu ad yanında rozet — listede tekrarlamaz.
                          u.roles
                            .filter((r) => !(u.isOwner && r === "SAHIP"))
                            .map((r) => (
                            <RoleBadge key={r} role={r} />
                          ))
                        ) : (u.permissions ?? []).length > 0 && !u.isOwner ? (
                          <Badge color="zinc">Görüntüleyici</Badge>
                        ) : u.isOwner ? null : (
                          <span className="text-xs text-zinc-400">Yetki yok</span>
                        )}
                        {u.custom ? (
                          <Badge color="amber" title="Hazır setten farklı, kişiye özel yetkiler">
                            Özel
                          </Badge>
                        ) : null}
                      </div>
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
                      {canManage ? (
                        <Dropdown>
                          <DropdownButton plain aria-label="Aksiyonlar">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => setEditing(u)}>
                              <Pencil data-slot="icon" />
                              <DropdownLabel>Düzenle</DropdownLabel>
                            </DropdownItem>
                            {/* Yıkıcı aksiyonlar kendine ve kurucuya kapalı —
                                backend setActive/remove self-guard'larının aynası. */}
                            {!u.isOwner && !isMe ? (
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
                            ) : null}
                            {!u.isOwner && !isMe ? (
                              <>
                                <DropdownDivider />
                                <DropdownItem onClick={() => setDeleting(u)}>
                                  <Trash2 data-slot="icon" />
                                  <DropdownLabel>Çıkar</DropdownLabel>
                                </DropdownItem>
                              </>
                            ) : null}
                          </DropdownMenu>
                        </Dropdown>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canManage ? <PendingInvitations /> : null}

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {editing ? (
        <EditUserModal
          user={editing}
          viewerIsOwner={meIsOwner}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} size="md">
        <DialogTitle>Kullanıcıyı Çıkar</DialogTitle>
        <DialogDescription>Bu işlem geri alınamaz.</DialogDescription>
        <DialogBody>
          {deleting ? (
            <>
              <p className="text-sm text-zinc-700">
                <strong className="text-zinc-900">
                  {deleting.firstName} {deleting.lastName}
                </strong>{" "}
                ({deleting.email}) ekipten çıkarılsın mı?
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs text-zinc-600">
                <li>Kullanıcı sisteme giriş yapamaz</li>
                <li>Açtığı satın alma talepleri ve onaylar kayıtta kalır</li>
                <li>E-posta tekrar davet için kullanılabilir</li>
              </ul>
            </>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDeleting(null)}>
            Vazgeç
          </Button>
          <Button color="red" onClick={handleDelete} disabled={removeUser.isPending}>
            Çıkar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Faz K — kurucu koltuk seçimi: aşkın durumda kalacak SA/ST sahipleri. */}
      <Dialog
        open={seatSelOpen}
        onClose={() => setSeatSelOpen(false)}
        size="lg"
      >
        <DialogTitle>Kalacak Koltukları Seç</DialogTitle>
        <DialogDescription>
          Paketinizde {seats?.limit ?? 0} koltuk var. Kalacak koltukları
          (kişi · satınalma/satış) seçin — seçilmeyen koltuğun o gruptaki
          işlem yetkileri kaldırılır; hesap, görüntüleme ve diğer yetkiler
          aynen kalır, açık işleri kalan ekip tamamlayabilir.
        </DialogDescription>
        <DialogBody className="space-y-2">
          {(users ?? [])
            .filter((u) => u.isActive)
            .flatMap((u) =>
              (["buy", "sell"] as const)
                .filter((g) =>
                  u.roles.includes(g === "buy" ? "SATIN_ALMACI" : "SATISCI"),
                )
                .map((g) => ({ u, g })),
            )
            .map(({ u, g }) => {
              const k = { userId: u.id, group: g };
              const on = keep.some((x) => keepKey(x) === keepKey(k));
              const full =
                !on && seats?.limit != null && keep.length >= seats.limit;
              return (
                <label
                  key={keepKey(k)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 text-sm ring-1 ${
                    on ? "bg-zinc-50 ring-2 ring-zinc-900" : "ring-zinc-950/10"
                  } ${full ? "opacity-50" : ""}`}
                >
                  <Checkbox
                    checked={on}
                    disabled={full}
                    onChange={() =>
                      setKeep((cur) =>
                        cur.some((x) => keepKey(x) === keepKey(k))
                          ? cur.filter((x) => keepKey(x) !== keepKey(k))
                          : [...cur, k],
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="font-semibold text-zinc-900">
                      {u.firstName} {u.lastName}
                      {u.isOwner ? " (Kurucu)" : ""}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {u.email} · {g === "buy" ? "Satınalma koltuğu" : "Satış koltuğu"}
                    </span>
                  </span>
                </label>
              );
            })}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setSeatSelOpen(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={seatSelection.isPending || keep.length === 0}
            onClick={async () => {
              try {
                const res = await seatSelection.mutateAsync(keep);
                toast.success(
                  `Koltuk seçimi uygulandı — ${res.droppedCount} kişinin işlem yetkileri kaldırıldı`,
                );
                setSeatSelOpen(false);
              } catch (err) {
                toast.error(extractErrorMessage(err, "Uygulanamadı"));
              }
            }}
          >
            Uygula
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** Bekleyen davetler — iptal / yeniden gönder (eski sistem paritesi). */
function PendingInvitations() {
  const { data: invitations } = useCompanyInvitations();
  const cancel = useCancelInvitation();
  const resend = useResendInvitation();

  if (!invitations || invitations.length === 0) return null;

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast.success("Davet iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    }
  };
  const handleResend = async (id: string) => {
    try {
      await resend.mutateAsync(id);
      toast.success("Davet yeniden gönderildi — süre uzatıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Gönderilemedi"));
    }
  };

  return (
    <div className="border-t border-zinc-950/5">
      <header className="flex items-center gap-2 px-5 pb-1 pt-4">
        <MailPlus className="h-4 w-4 text-zinc-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-900">
          Bekleyen Davetler ({invitations.length})
        </h3>
      </header>
      <ul className="divide-y divide-zinc-100 px-5 pb-3">
        {invitations.map((inv) => {
          const expired = inv.status === "EXPIRED";
          return (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {inv.email}
                  </span>
                  {inv.roles.map((r) => (
                    <Badge key={r} color="zinc">
                      {ROLE_LABEL[r] ?? r}
                    </Badge>
                  ))}
                  {expired ? (
                    <Badge color="red">Süresi doldu</Badge>
                  ) : (
                    <Badge color="amber">Bekliyor</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {inv.invitedByName} davet etti ·{" "}
                  {expired
                    ? "yeniden gönderilebilir"
                    : `${formatDistanceToNowStrict(new Date(inv.expiresAt), {
                        locale: tr,
                      })} içinde sona erer`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  plain
                  onClick={() => handleResend(inv.id)}
                  disabled={resend.isPending}
                >
                  Yeniden Gönder
                </Button>
                <Button
                  plain
                  onClick={() => handleCancel(inv.id)}
                  disabled={cancel.isPending}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditUserModal({
  user,
  viewerIsOwner,
  onClose,
}: {
  user: CompanyTeamUser;
  viewerIsOwner: boolean;
  onClose: () => void;
}) {
  const update = useUpdateUser();
  const setPermissions = useSetUserPermissions();
  const { data: catalog } = usePermissionCatalog();
  const { data: seats } = useSeats();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  // Yetki tablosu: açılışta kişinin EFEKTİF izin listesi (Kurucuda örtükler dahil).
  const initialPerms = useMemo(
    () => user.permissions ?? user.rolePermissions,
    [user],
  );
  const [perms, setPerms] = useState<string[]>(initialPerms);
  const freeSeats =
    seats?.limit == null
      ? null
      : Math.max(0, seats.limit - seats.used - seats.pendingSeatInvites);
  const hadGroups = {
    buy: user.roles.includes("SATIN_ALMACI"),
    sell: user.roles.includes("SATISCI"),
  };
  const seatsFull = freeSeats === 0;
  const permsChanged =
    perms.length !== initialPerms.length ||
    perms.some((k) => !initialPerms.includes(k));

  // Kuruculuk devri — panel açılır, eski Kurucu (siz) yeni rolünü seçer.
  const [transferOpen, setTransferOpen] = useState(false);
  const [myNewRole, setMyNewRole] = useState<
    "YONETICI" | "SATIN_ALMACI" | "SATISCI" | "BOTH"
  >("YONETICI");
  const NEW_ROLE_MAP: Record<typeof myNewRole, CompanyRole[]> = {
    YONETICI: ["YONETICI"],
    SATIN_ALMACI: ["SATIN_ALMACI"],
    SATISCI: ["SATISCI"],
    BOTH: ["SATIN_ALMACI", "SATISCI"],
  };
  const confirmTransfer = async () => {
    try {
      await update.mutateAsync({
        id: user.id,
        roles: ["SAHIP" as CompanyRole],
        previousOwnerRoles: NEW_ROLE_MAP[myNewRole],
      });
      toast.success("Kuruculuk devredildi");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kuruculuk devredilemedi",
      );
    }
  };

  const save = async () => {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error("Ad ve soyad en az 2 karakter");
      return;
    }
    if (!user.isOwner && perms.length === 0) {
      toast.error("En az bir yetki seçin");
      return;
    }
    try {
      await update.mutateAsync({
        id: user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      if (permsChanged) {
        await setPermissions.mutateAsync({ id: user.id, permissions: perms });
      }
      toast.success("Kullanıcı güncellendi");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  const busy = update.isPending || setPermissions.isPending;

  return (
    <Dialog open onClose={onClose} size="3xl">
      <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
      <DialogDescription>{user.email}</DialogDescription>
      {/* Uzun içerik (yetki tablosu) viewport'u aşıp üstü header altında
          kalmasın diye body iç scroll ile sınırlanır; pr/-mr çifti içeriğin
          scrollbar'a yapışmasını önler. */}
      <DialogBody className="-mr-3 max-h-[70vh] space-y-5 overflow-y-auto pr-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Kişi Bilgileri</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field>
              <Label>Ad</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field>
              <Label>Soyad</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <Field className="mt-3">
            <Label>Telefon</Label>
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
        </div>

        {/* Yetki tablosu (Faz 4): rol çipleri hazır seti işaretler, tikler
            kişiye özel. Kurucu satırında yalnız işlem tikleri düzenlenir. */}
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900">Yetkiler</p>
            {seatsFull ? (
              <p className="text-xs text-amber-700">
                Kullanıcı hakkı dolu — yeni koltuk verilemez.
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Satınalma/satış işlem tikleri koltuk sayar.
              </p>
            )}
          </div>
          {user.isOwner ? (
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                <Crown className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-zinc-900">Kurucu</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">
                  Yönetim, onay ve görüntüleme yetkileri Kurucuda örtüktür ve
                  kısılamaz. Yalnız işlem (koltuk) tiklerini değiştirebilirsiniz;
                  kuruculuk yalnız devirle değişir.
                </span>
              </span>
            </div>
          ) : null}
          <div className="mt-2">
            {catalog ? (
              <PermissionTable
                catalog={catalog}
                value={perms}
                onChange={setPerms}
                viewerIsOwner={viewerIsOwner}
                targetIsOwner={user.isOwner}
                freeSeats={freeSeats}
                hadGroups={hadGroups}
              />
            ) : (
              <p className="text-sm text-zinc-500">Yetki kataloğu yükleniyor…</p>
            )}
          </div>
          {/* Kuruculuk devri — yalnız mevcut Kurucu, başka bir kullanıcıya. */}
          {viewerIsOwner && !user.isOwner ? (
            transferOpen ? (
              <div className="mt-3 space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <p className="text-xs font-semibold text-violet-900">
                  Kuruculuğu {user.firstName} {user.lastName} kişisine devret
                </p>
                <p className="text-xs text-violet-700">
                  Devirden sonra <strong>sizin</strong> rolünüz ne olsun?
                </p>
                <SelectMenu
                  value={myNewRole}
                  onChange={(v) => setMyNewRole(v as typeof myNewRole)}
                  ariaLabel="Devir sonrası rolünüz"
                  options={[
                    { value: "YONETICI", label: "Yönetici (yönetim; işlem yok)" },
                    { value: "SATIN_ALMACI", label: "Satın Almacı (yalnız alış)" },
                    { value: "SATISCI", label: "Satışçı (yalnız satış)" },
                    { value: "BOTH", label: "Satın Almacı + Satışçı" },
                  ]}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={confirmTransfer}
                    disabled={update.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Crown className="h-3.5 w-3.5" />
                    {update.isPending ? "Devrediliyor…" : "Devret"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100"
              >
                <Crown className="h-3.5 w-3.5" />
                Kuruculuğu bu kullanıcıya devret
              </button>
            )
          ) : null}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={save} disabled={busy}>
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
