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
  useSetUserActive,
  useUpdateUser,
  useUpdateUserPermissions,
  type CompanyTeamUser,
} from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
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

const ROLES: { key: CompanyRole; label: string; desc: string }[] = [
  { key: "YONETICI", label: "Yönetici", desc: "Hesap, kullanıcı, ayar ve bağlantı yönetimi" },
  { key: "SATIN_ALMACI", label: "Satın Almacı", desc: "Alım ihaleleri açma, teklif değerlendirme, kazandırma" },
  { key: "SATISCI", label: "Satışçı", desc: "Satış ilanları, ihalelere teklif verme" },
  { key: "ONAYLAYICI", label: "Onaylayıcı", desc: "Onay zincirinde onay/ret" },
];
const ROLE_LABEL: Record<CompanyRole, string> = {
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

export function CompanyUsersSection({
  canManage,
  meId,
}: {
  canManage: boolean;
  meId: string | undefined;
}) {
  const { data: users, isLoading } = useCompanyUsers();
  const setActive = useSetUserActive();
  const removeUser = useRemoveUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyTeamUser | null>(null);
  const [deleting, setDeleting] = useState<CompanyTeamUser | null>(null);

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
    <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white">
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
                              <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-600">
                                Sahip
                              </span>
                            ) : null}
                            {isMe ? (
                              <span className="ml-1.5 text-[10px] uppercase text-zinc-400">
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
                          <span className="text-xs text-zinc-400">—</span>
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
                      {canManage && !isMe ? (
                        <Dropdown>
                          <DropdownButton plain aria-label="Aksiyonlar">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => setEditing(u)}>
                              <Pencil data-slot="icon" />
                              <DropdownLabel>Düzenle</DropdownLabel>
                            </DropdownItem>
                            {!u.isOwner ? (
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
                            {!u.isOwner ? (
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

  // Kural: tek rol; istisna Satın Almacı + Satışçı birlikte. Rol değişince
  // izinler yeni rolün varsayılanına SIFIRLANIR (eski sistem davranışı).
  const toggleRole = (r: CompanyRole) => {
    let next: CompanyRole[];
    if (roles.includes(r)) next = roles.filter((x) => x !== r);
    else if (r === "YONETICI" || r === "ONAYLAYICI") next = [r];
    else
      next = [
        ...roles.filter((x) => x === "SATIN_ALMACI" || x === "SATISCI"),
        r,
      ];
    setRoles(next);
    if (next.length > 0) applyDefaults(next);
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
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
      <DialogDescription>{user.email}</DialogDescription>
      <DialogBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>Ad</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field>
            <Label>Soyad</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>Telefon</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="opsiyonel"
          />
        </Field>

        {/* Roller (çoklu) */}
        <div>
          <span className="block text-sm font-medium text-zinc-950">Roller</span>
          <div className="mt-2 space-y-2">
            {ROLES.map((r) => {
              const on = roles.includes(r.key);
              const lockOwnerAdmin = user.isOwner && r.key === "YONETICI";
              return (
                <label
                  key={r.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg p-2.5 text-sm ring-1 transition ${
                    on ? "bg-zinc-50 ring-2 ring-zinc-900" : "bg-white ring-zinc-950/10"
                  } ${lockOwnerAdmin ? "opacity-70" : ""}`}
                >
                  <Checkbox
                    checked={on}
                    disabled={lockOwnerAdmin}
                    onChange={() => !lockOwnerAdmin && toggleRole(r.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold text-zinc-900">{r.label}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {r.desc}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
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
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    {group}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
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
                            <span className="text-[10px] font-semibold uppercase text-amber-600">
                              +
                            </span>
                          ) : isDefault && !on ? (
                            <span className="text-[10px] font-semibold uppercase text-red-600">
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
