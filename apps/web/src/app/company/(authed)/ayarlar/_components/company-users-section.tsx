"use client";

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
  useUpdateUser,
  useUpdateUserPermissions,
  type CompanyTeamUser,
} from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { SelectMenu } from "@/components/ui/select-menu";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardCheck,
  Crown,
  MailPlus,
  MoreVertical,
  Pencil,
  Power,
  PowerOff,
  Settings2,
  ShoppingCart,
  Store,
  Trash2,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { InviteUserDialog } from "./invite-user-dialog";

const ROLES: { key: CompanyRole; label: string; desc: string }[] = [
  { key: "YONETICI", label: "Yönetici", desc: "Hesap, kullanıcı, ayar ve bağlantı yönetimi" },
  { key: "SATIN_ALMACI", label: "Satın Almacı", desc: "Alış ihaleleri açma, teklif değerlendirme, kazandırma" },
  { key: "SATISCI", label: "Satışçı", desc: "Satış ilanları, ihalelere teklif verme" },
  { key: "ONAYLAYICI", label: "Onaylayıcı", desc: "Onay zincirinde onay/ret" },
];
const ROLE_LABEL: Record<CompanyRole, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};
const ROLE_ICON: Record<CompanyRole, LucideIcon> = {
  SAHIP: Crown,
  YONETICI: Settings2,
  SATIN_ALMACI: ShoppingCart,
  SATISCI: Store,
  ONAYLAYICI: ClipboardCheck,
};

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
  const [keepIds, setKeepIds] = useState<string[]>([]);

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
          {seats.pendingSeatInvites > 0
            ? ` · bekleyen davet: ${seats.pendingSeatInvites}`
            : ""}
          <span className="ml-1 text-zinc-400">
            (Satın Almacı/Satışçı rolü taşıyan aktif kişiler)
          </span>
        </div>
      ) : null}
      {seats && seats.overflow > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <span>
            Paketinizde <strong>{seats.limit}</strong> koltuk var,{" "}
            <strong>{seats.overflow}</strong> kişi fazla — yeni Satın Almacı/
            Satışçı atanamaz. Mevcut kullanıcılar çalışmaya devam eder.
          </span>
          {meIsOwner ? (
            <Button
              onClick={() => {
                setKeepIds([]);
                setSeatSelOpen(true);
              }}
            >
              Koltukları Seç
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
                              <span className="ml-1.5 text-xs font-semibold uppercase text-amber-600">
                                Kurucu
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
                        {u.roles.length ? (
                          u.roles.map((r) => (
                            <Badge key={r} color="zinc">
                              {ROLE_LABEL[r] ?? r}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-400">Rol yok</span>
                        )}
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
                <li>Açtığı ihaleler ve onaylar kayıtta kalır</li>
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
        <DialogTitle>Koltukları Seç</DialogTitle>
        <DialogDescription>
          Paketinizde {seats?.limit ?? 0} koltuk var. Kalacak Satın Almacı/
          Satışçı kullanıcılarını seçin — seçilmeyenlerin işlem rolleri
          kaldırılır (hesapları ve diğer yetkileri aynen kalır; açık işlemleri
          kalan ekip tamamlayabilir).
        </DialogDescription>
        <DialogBody className="space-y-2">
          {(users ?? [])
            .filter(
              (u) =>
                u.isActive &&
                u.roles.some(
                  (r) => r === "SATIN_ALMACI" || r === "SATISCI",
                ),
            )
            .map((u) => {
              const on = keepIds.includes(u.id);
              const full =
                !on && seats?.limit != null && keepIds.length >= seats.limit;
              return (
                <label
                  key={u.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 text-sm ring-1 ${
                    on ? "bg-zinc-50 ring-2 ring-zinc-900" : "ring-zinc-950/10"
                  } ${full ? "opacity-50" : ""}`}
                >
                  <Checkbox
                    checked={on}
                    disabled={full}
                    onChange={() =>
                      setKeepIds((cur) =>
                        cur.includes(u.id)
                          ? cur.filter((x) => x !== u.id)
                          : [...cur, u.id],
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="font-semibold text-zinc-900">
                      {u.firstName} {u.lastName}
                      {u.isOwner ? " (Kurucu)" : ""}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {u.email} · {u.roles.map((r) => ROLE_LABEL[r]).join(", ")}
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
            disabled={seatSelection.isPending || keepIds.length === 0}
            onClick={async () => {
              try {
                const res = await seatSelection.mutateAsync(keepIds);
                toast.success(
                  `Koltuk seçimi uygulandı — ${res.droppedCount} kişinin işlem rolleri kaldırıldı`,
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
  const updatePerms = useUpdateUserPermissions();
  const { data: catalogData } = usePermissionCatalog();
  const catalog = useMemo(() => catalogData?.catalog ?? [], [catalogData]);
  const roleDefaultsMap = catalogData?.roleDefaults;

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [roles, setRoles] = useState<CompanyRole[]>(user.roles);

  // İzin editörü (yalnızca sahip, sahip-olmayan hedefte).
  const showPerms = viewerIsOwner && !user.isOwner;

  // Verilen roller için varsayılan izin kümesi (eski ROLE_DEFAULT_PERMISSIONS).
  const defaultsFor = (rs: CompanyRole[]) => {
    const set = new Set<string>();
    for (const r of rs) for (const p of roleDefaultsMap?.[r] ?? []) set.add(p);
    return set;
  };
  const liveDefaults = useMemo(
    () => defaultsFor(roles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, roleDefaultsMap],
  );

  // Açılışta kullanıcının ETKİN izinleri (rol ∪ added − removed).
  const effective = useMemo(() => {
    const set = new Set(user.rolePermissions);
    for (const k of user.permissionsOverride.added) set.add(k);
    for (const k of user.permissionsOverride.removed) set.delete(k);
    return set;
  }, [user]);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const initialPerms = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const c of catalog) m[c.key] = effective.has(c.key);
    return m;
  }, [catalog, effective]);
  const permState = Object.keys(perms).length ? perms : initialPerms;

  const applyDefaults = (rs: CompanyRole[]) => {
    const def = defaultsFor(rs);
    const m: Record<string, boolean> = {};
    for (const c of catalog) m[c.key] = def.has(c.key);
    setPerms(m);
  };

  // Kombo kuralları: SAHIP yalnız SA/ST ile birleşir; YONETICI+ONAYLAYICI
  // birleşemez (Yönetici zaten onay verebilir — backend assertValidRoleCombo
  // ile birebir). SA/ST + ONAYLAYICI serbest (satın alma müdürü deseni).
  // Rol değişince izinler yeni kümenin varsayılanına SIFIRLANIR.
  const toggleRole = (r: CompanyRole) => {
    const hasSahip = roles.includes("SAHIP");
    let next: CompanyRole[] = roles.includes(r)
      ? roles.filter((x) => x !== r)
      : [...roles, r];
    // YONETICI seçilirse ONAYLAYICI düşer (Yönetici onayı zaten kapsar).
    if (r === "YONETICI" && next.includes("YONETICI")) {
      next = next.filter((x) => x !== "ONAYLAYICI");
    }
    if (hasSahip) {
      next = [
        "SAHIP",
        ...next.filter((x) => x === "SATIN_ALMACI" || x === "SATISCI"),
      ];
    }
    setRoles(next);
    if (next.length > 0) applyDefaults(next);
  };

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

  const isCustomized = useMemo(
    () => catalog.some((c) => (permState[c.key] ?? false) !== liveDefaults.has(c.key)),
    [catalog, permState, liveDefaults],
  );

  const groups = useMemo(() => {
    const g = new Map<string, typeof catalog>();
    for (const c of catalog) {
      const arr = g.get(c.group) ?? [];
      arr.push(c);
      g.set(c.group, arr);
    }
    return [...g.entries()];
  }, [catalog]);

  const save = async () => {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error("Ad ve soyad en az 2 karakter");
      return;
    }
    if (roles.length === 0) {
      toast.error("En az bir rol seçin");
      return;
    }
    try {
      await update.mutateAsync({
        id: user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        roles,
      });
      if (showPerms) {
        const added: string[] = [];
        const removed: string[] = [];
        for (const c of catalog) {
          const on = permState[c.key];
          const isDefault = liveDefaults.has(c.key);
          if (on && !isDefault) added.push(c.key);
          if (!on && isDefault) removed.push(c.key);
        }
        await updatePerms.mutateAsync({ id: user.id, added, removed });
      }
      toast.success("Kullanıcı güncellendi");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  return (
    <Dialog open onClose={onClose} size="3xl">
      <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
      <DialogDescription>{user.email}</DialogDescription>
      {/* Uzun içerik (yetki editörü) viewport'u aşıp üstü header altında
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

        {/* Roller (çoklu) */}
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900">Roller</p>
            <p className="text-xs text-zinc-500">Birden fazla seçilebilir</p>
          </div>
          {/* Kurucu ETİKETİ (Faz R): yönetim + billing/silme/devir; İŞLEM
              yetkisi vermez. Kilitli; yalnız devirle değişir. */}
          {user.isOwner ? (
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                <Crown className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-zinc-900">
                  Kurucu
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                    Kilitli
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">
                  Yönetim etiketi — hesap ve kullanıcı yönetimi, faturalama,
                  devir. Tek başına işlem yetkisi vermez; ihale açmak veya
                  teklif vermek için aşağıdan rol ekleyin. Yalnız devirle
                  değişir.
                </span>
              </span>
            </div>
          ) : null}
          {/* Faz R: Kurucu'ya SA/ST eklenebilir (etiket işlem vermez);
              YONETICI etiketini yalnız Kurucu atayabilir. */}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(user.isOwner
              ? ROLES.filter(
                  (r) => r.key === "SATIN_ALMACI" || r.key === "SATISCI",
                )
              : ROLES.filter((r) => r.key !== "YONETICI" || viewerIsOwner)
            ).map((r) => {
              const on = roles.includes(r.key);
              // YONETICI seçiliyken ONAYLAYICI anlamsız (onayı zaten kapsar).
              const onayLocked =
                r.key === "ONAYLAYICI" && roles.includes("YONETICI");
              const Icon = ROLE_ICON[r.key];
              return (
                <label
                  key={r.key}
                  className={`flex items-start gap-3 rounded-xl p-3 text-sm ring-1 transition ${
                    on
                      ? "bg-zinc-50 ring-2 ring-zinc-900"
                      : "bg-white ring-zinc-950/10 hover:ring-zinc-950/25"
                  } ${onayLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                      on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-zinc-900">{r.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                      {onayLocked
                        ? "Yönetici zaten onay verebilir — ayrıca gerekmez"
                        : r.desc}
                    </span>
                  </span>
                  <Checkbox
                    checked={on}
                    disabled={onayLocked}
                    onChange={() => toggleRole(r.key)}
                    className="mt-0.5"
                  />
                </label>
              );
            })}
          </div>
          {/* Kuruculuk devri — yalnız mevcut Kurucu, başka bir kullanıcıya. */}
          {viewerIsOwner && !user.isOwner ? (
            transferOpen ? (
              <div className="mt-3 space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <p className="text-xs font-semibold text-violet-900">
                  Kuruculuğu {user.firstName} {user.lastName} kişisine devret
                </p>
                <p className="text-xs text-violet-700">
                  Devirden sonra <strong>sizin</strong> rolünüz ne olsun? (Yönetim
                  ve operasyon aynı anda seçilemez.)
                </p>
                <SelectMenu
                  value={myNewRole}
                  onChange={(v) => setMyNewRole(v as typeof myNewRole)}
                  ariaLabel="Devir sonrası rolünüz"
                  options={[
                    { value: "YONETICI", label: "Yönetici (yönetim; operasyon yok)" },
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

        {/* Yetkiler (yalnızca firma sahibi) */}
        {showPerms && catalog.length ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Yetkiler</p>
                {isCustomized ? (
                  <p className="mt-0.5 text-xs text-amber-700">
                    Rol varsayılanından farklı (özelleştirilmiş)
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Rolün varsayılan yetkileri uygulanıyor.
                  </p>
                )}
              </div>
              {isCustomized ? (
                <button
                  type="button"
                  onClick={() => applyDefaults(roles)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Varsayılana Dön
                </button>
              ) : null}
            </div>
            <div className="mt-3 space-y-4">
              {groups.map(([group, items]) => (
                <div key={group}>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
                    {group}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(items ?? []).map((c) => {
                      const isDefault = liveDefaults.has(c.key);
                      const on = permState[c.key] ?? false;
                      return (
                        <label
                          key={c.key}
                          className="flex items-center gap-2 text-sm text-zinc-700"
                        >
                          <Checkbox
                            checked={on}
                            onChange={(checked) =>
                              setPerms({ ...permState, [c.key]: checked })
                            }
                          />
                          <span>{c.label}</span>
                          {!isDefault && on ? (
                            <span className="text-xs font-semibold uppercase text-amber-600">
                              +
                            </span>
                          ) : isDefault && !on ? (
                            <span className="text-xs font-semibold uppercase text-red-600">
                              −
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={save} disabled={update.isPending || updatePerms.isPending}>
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
