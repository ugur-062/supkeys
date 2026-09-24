"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { useRoleLabel } from "@/i18n/domain";
import { formatDate } from "@/lib/format-date";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
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
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
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
import { isValidPhone } from "@/lib/company/phone";
import { InviteUserDialog } from "./invite-user-dialog";
import { PermissionTable } from "@/components/company/permission-table";

export function CompanyUsersSection({
  canManage,
  meId,
}: {
  canManage: boolean;
  meId: string | undefined;
}) {
  const t = useTranslations("web.panel.settings.companyUsersSection");
  const locale = useLocale() as Locale;
  const { data: users, isLoading, isError, refetch } = useCompanyUsers();
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
      toast.success(u.isActive ? t("pasifYapildi") : t("tekrarAktifEdildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("islemBasarisiz")));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await removeUser.mutateAsync(deleting.id);
      toast.success(t("kullaniciCikarildi"));
      setDeleting(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("cikarilamadi")));
    }
  };

  return (
    <div className="overflow-hidden card">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-zinc-500" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-900">
            {t("kullanicilar", { length: (users ?? []).length })}
          </h3>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>{t("uyeDavetEt")}</Button>
        ) : null}
      </header>

      {/* Faz K — koltuk barı: SA/ST taşıyan aktif kişi sayısı / paket limiti. */}
      {seats && seats.limit != null ? (
        <div className="border-b border-zinc-950/5 px-5 py-2.5 text-xs text-zinc-600">
          {t.rich("koltuk", {
            strong: (c) => <strong>{c}</strong>,
            used: seats.used,
            limit: seats.limit,
          })}
          <span className="ml-1 text-zinc-500">
            {seats.pendingSeatInvites > 0
              ? t("koltukKirilimiBekleyenDavet", {
                  usedBuy: seats.usedBuy,
                  usedSell: seats.usedSell,
                  pending: seats.pendingSeatInvites,
                })
              : t("koltukKirilimi", { usedBuy: seats.usedBuy, usedSell: seats.usedSell })}
          </span>
          <span className="ml-1 text-zinc-500">
            {t("satinalmaVeSatisIslemYetkisi")}
          </span>
        </div>
      ) : null}
      {seats && seats.overflow > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <span>
            {t.rich("paketinizdeKoltukVarFazla", {
              strong: (c) => <strong>{c}</strong>,
              // `overflow > 0` iken limit her zaman doludur; tip daraltması için yedek.
              limit: seats.limit ?? 0,
              overflow: seats.overflow,
            })}
          </span>
          {meIsOwner ? (
            <Button
              onClick={() => {
                setKeep([]);
                setSeatSelOpen(true);
              }}
            >
              {t("kalacakKoltuklariSec")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <p className="px-5 py-6 text-sm text-zinc-500">{t("yukleniyor")}</p>
      ) : isError ? (
        <p role="alert" className="px-5 py-6 text-sm text-rose-800">
          {t("kullanicilarYuklenemedi")}{" "}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-2">
            {t("yenidenDene")}
          </button>
        </p>
      ) : (users ?? []).length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-500">{t("henuzKullaniciYokEkibiniziDavet")}</p>
      ) : (
        <div className="px-2 [--gutter:--spacing(5)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>{t("kullanici")}</TableHeader>
                <TableHeader>{t("roller")}</TableHeader>
                <TableHeader>{t("durum")}</TableHeader>
                <TableHeader>{t("sonGiris")}</TableHeader>
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
                              <span className="ml-1.5 text-xs uppercase text-zinc-500">
                                {t("siz")}
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
                          <Badge color="zinc">{t("goruntuleyici")}</Badge>
                        ) : u.isOwner ? null : (
                          <span className="text-xs text-zinc-500">{t("yetkiYok")}</span>
                        )}
                        {u.custom ? (
                          <Badge color="amber" title={t("hazirSettenFarkliKisiyeOzel")}>
                            {t("ozel")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge color="lime">{t("aktif")}</Badge>
                      ) : (
                        <Badge color="zinc">{t("pasif")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt, "relative", locale) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <Dropdown>
                          <DropdownButton plain aria-label={t("aksiyonlar")}>
                            <MoreVertical className="h-4 w-4" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => setEditing(u)}>
                              <Pencil data-slot="icon" />
                              <DropdownLabel>{t("duzenle")}</DropdownLabel>
                            </DropdownItem>
                            {/* Yıkıcı aksiyonlar kendine ve kurucuya kapalı —
                                backend setActive/remove self-guard'larının aynası. */}
                            {!u.isOwner && !isMe ? (
                              <DropdownItem onClick={() => handleToggleActive(u)}>
                                {u.isActive ? (
                                  <>
                                    <PowerOff data-slot="icon" />
                                    <DropdownLabel>{t("pasifYap")}</DropdownLabel>
                                  </>
                                ) : (
                                  <>
                                    <Power data-slot="icon" />
                                    <DropdownLabel>{t("tekrarAktifEt")}</DropdownLabel>
                                  </>
                                )}
                              </DropdownItem>
                            ) : null}
                            {!u.isOwner && !isMe ? (
                              <>
                                <DropdownDivider />
                                <DropdownItem onClick={() => setDeleting(u)}>
                                  <Trash2 data-slot="icon" />
                                  <DropdownLabel>{t("cikar")}</DropdownLabel>
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
          isSelf={editing.id === meId}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} size="md">
        <DialogTitle>{t("kullaniciyiCikar")}</DialogTitle>
        <DialogDescription>{t("buIslemGeriAlinamaz")}</DialogDescription>
        <DialogBody>
          {deleting ? (
            <>
              <p className="text-sm text-zinc-700">
                {t.rich("ekiptenCikarilsinMi", {
                  strong: (c) => <strong className="text-zinc-900">{c}</strong>,
                  name: `${deleting.firstName} ${deleting.lastName}`,
                  email: deleting.email,
                })}
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs text-zinc-600">
                <li>{t("kullaniciSistemeGirisYapamaz")}</li>
                <li>{t("actigiSatinAlmaTalepleriVe")}</li>
                <li>{t("ePostaTekrarDavetIcin")}</li>
              </ul>
            </>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDeleting(null)}>
            {t("vazgec")}
          </Button>
          <Button color="red" onClick={handleDelete} disabled={removeUser.isPending}>
            {t("cikar")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Faz K — kurucu koltuk seçimi: aşkın durumda kalacak SA/ST sahipleri. */}
      <Dialog
        open={seatSelOpen}
        onClose={() => setSeatSelOpen(false)}
        size="lg"
      >
        <DialogTitle>{t("kalacakKoltuklariSec")}</DialogTitle>
        <DialogDescription>
          {t("paketinizdeKoltukVarKalacak", { limit: seats?.limit ?? 0 })}
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
                    on ? "bg-zinc-100 ring-2 ring-zinc-900" : "ring-zinc-950/10"
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
                      {u.isOwner ? ` ${t("kurucu")}` : ""}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {u.email} · {g === "buy" ? t("satinalmaKoltugu") : t("satisKoltugu")}
                    </span>
                  </span>
                </label>
              );
            })}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setSeatSelOpen(false)}>
            {t("vazgec")}
          </Button>
          <Button
            disabled={seatSelection.isPending || keep.length === 0}
            onClick={async () => {
              try {
                const res = await seatSelection.mutateAsync(keep);
                toast.success(
                  t("koltukSecimiUygulandiKisininIslem", { droppedCount: res.droppedCount }),
                );
                setSeatSelOpen(false);
              } catch (err) {
                toast.error(extractErrorMessage(err, t("uygulanamadi")));
              }
            }}
          >
            {t("uygula")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** Bekleyen davetler — iptal / yeniden gönder (eski sistem paritesi). */
function PendingInvitations() {
  const t = useTranslations("web.panel.settings.companyUsersSection");
  const locale = useLocale() as Locale;
  const roleLabel = useRoleLabel();
  const { data: invitations } = useCompanyInvitations();
  const cancel = useCancelInvitation();
  const resend = useResendInvitation();

  if (!invitations || invitations.length === 0) return null;

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast.success(t("davetIptalEdildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("iptalEdilemedi")));
    }
  };
  const handleResend = async (id: string) => {
    try {
      await resend.mutateAsync(id);
      toast.success(t("davetYenidenGonderildiSureUzatildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("gonderilemedi")));
    }
  };

  return (
    <div className="border-t border-zinc-950/5">
      <header className="flex items-center gap-2 px-5 pb-1 pt-4">
        <MailPlus className="h-4 w-4 text-zinc-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-900">
          {t("bekleyenDavetler", { length: invitations.length })}
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
                      {roleLabel(r)}
                    </Badge>
                  ))}
                  {expired ? (
                    <Badge color="red">{t("suresiDoldu")}</Badge>
                  ) : (
                    <Badge color="amber">{t("bekliyor")}</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {t("davetEtti", { name: inv.invitedByName })} ·{" "}
                  {expired
                    ? t("yenidenGonderilebilir")
                    : t("sonaErer", { when: formatDate(inv.expiresAt, "relative", locale) })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  plain
                  onClick={() => handleResend(inv.id)}
                  disabled={resend.isPending}
                >
                  {t("yenidenGonder")}
                </Button>
                <Button
                  plain
                  aria-label={t("davetiIptalEt")}
                  title={t("davetiIptalEt")}
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
  isSelf,
  onClose,
}: {
  user: CompanyTeamUser;
  viewerIsOwner: boolean;
  /** Kendi satırı: Kurucu dışında kimse kendi yetkisini düzenleyemez (backend assertNotSelf aynası). */
  isSelf: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("web.panel.settings.companyUsersSection");
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
  // Satınalma yetkisi yalnız GOLD'da verilebilir — talep açma/kazandırma
  // ücretsiz pakette kapalı. Backend `assertSeatAvailable` aynı kuralı
  // uyguluyor; buradaki yalnız aynası (kullanıcı kilidin sebebini görsün).
  const canGrantBuy = tierAtLeast(seats?.tier ?? "STANDART", BUYING_TIER);
  const seatsFull = freeSeats === 0;
  const permsChanged =
    perms.length !== initialPerms.length ||
    perms.some((k) => !initialPerms.includes(k));
  // Kendi yetkisini düzenleyemez — Kurucu hariç (o yalnız işlem tiklerini).
  const permsLocked = isSelf && !user.isOwner;
  const [touched, setTouched] = useState(false);
  const infoChanged =
    firstName.trim() !== user.firstName ||
    lastName.trim() !== user.lastName ||
    phone.trim() !== (user.phone ?? "");
  const dirty = infoChanged || permsChanged;
  // Satır içi hatalar (Ayarlar denetimi 2026-09-10: toast değil, alanda).
  const firstNameError = firstName.trim().length < 2 ? t("adEnAz2Karakter") : null;
  const lastNameError = lastName.trim().length < 2 ? t("soyadEnAz2Karakter") : null;
  const phoneError = isValidPhone(phone) ? null : t("gecerliBirTelefonNumarasiGirin");
  const permsError = !user.isOwner && perms.length === 0 ? t("enAzBirYetkiSecin") : null;
  const hasError = Boolean(firstNameError || lastNameError || phoneError || permsError);

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
      toast.success(t("kuruculukDevredildi"));
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kuruculukDevredilemedi")));
    }
  };

  const save = async () => {
    setTouched(true);
    if (hasError || !dirty) return;
    try {
      if (infoChanged) {
        await update.mutateAsync({
          id: user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        });
      }
      if (permsChanged && !permsLocked) {
        await setPermissions.mutateAsync({ id: user.id, permissions: perms });
      }
      toast.success(t("kullaniciGuncellendi"));
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("guncellenemedi")));
    }
  };

  const busy = update.isPending || setPermissions.isPending;

  return (
    <Dialog open onClose={onClose} size="3xl">
      <DialogTitle>{t("kullaniciyiDuzenle")}</DialogTitle>
      <DialogDescription>{user.email}</DialogDescription>
      {/* Uzun içerik (yetki tablosu) viewport'u aşıp üstü header altında
          kalmasın diye body iç scroll ile sınırlanır; pr/-mr çifti içeriğin
          scrollbar'a yapışmasını önler. */}
      <DialogBody className="-mr-3 max-h-[70vh] space-y-5 overflow-y-auto pr-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{t("kisiBilgileri")}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field>
              <Label>{t("ad")}</Label>
              <Input
                value={firstName}
                invalid={touched && Boolean(firstNameError)}
                onChange={(e) => setFirstName(e.target.value)}
              />
              {touched && firstNameError ? <ErrorMessage>{firstNameError}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>{t("soyad")}</Label>
              <Input
                value={lastName}
                invalid={touched && Boolean(lastNameError)}
                onChange={(e) => setLastName(e.target.value)}
              />
              {touched && lastNameError ? <ErrorMessage>{lastNameError}</ErrorMessage> : null}
            </Field>
          </div>
          <Field className="mt-3">
            <Label>{t("telefon")}</Label>
            <PhoneInput value={phone} onChange={setPhone} />
            {touched && phoneError ? <ErrorMessage>{phoneError}</ErrorMessage> : null}
          </Field>
        </div>

        {/* Yetki tablosu (Faz 4): rol çipleri hazır seti işaretler, tikler
            kişiye özel. Kurucu satırında yalnız işlem tikleri düzenlenir. */}
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900">{t("yetkiler")}</p>
            {permsLocked ? (
              <p className="text-xs text-zinc-500">
                {t("kendiYetkileriniziDuzenleyemezsinizKurucuVey")}
              </p>
            ) : seatsFull ? (
              <p className="text-xs text-amber-700">
                {t("kullaniciHakkiDoluYeniKoltuk")}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                {t("satinalmaSatisIslemTikleriKoltuk")}
              </p>
            )}
          </div>
          {user.isOwner ? (
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Crown className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-zinc-900">{t("kurucu2")}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">
                  {t("yonetimOnayVeGoruntulemeYetkileri")}
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
                canGrantBuy={canGrantBuy}
                hadGroups={hadGroups}
                disabled={permsLocked}
              />
            ) : (
              <p className="text-sm text-zinc-500">{t("yetkiKataloguYukleniyor")}</p>
            )}
            {touched && permsError ? (
              <p className="mt-1 text-xs text-red-600">{permsError}</p>
            ) : null}
          </div>
          {/* Kuruculuk devri — yalnız mevcut Kurucu, başka bir kullanıcıya. */}
          {viewerIsOwner && !user.isOwner ? (
            transferOpen ? (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">
                  {t("kuruculuguKisisineDevret", { firstName: user.firstName, lastName: user.lastName })}
                </p>
                <p className="text-xs text-amber-800">
                  {t("buIslemGeriAlinamazFatura")}
                </p>
                <p className="text-xs text-amber-800">
                  {t.rich("devirdenSonraSizinRolunuz", { strong: (c) => <strong>{c}</strong> })}
                </p>
                <SelectMenu
                  value={myNewRole}
                  onChange={(v) => setMyNewRole(v as typeof myNewRole)}
                  ariaLabel={t("devirSonrasiRolunuz")}
                  options={[
                    { value: "YONETICI", label: t("yoneticiYonetimIslemYok") },
                    { value: "SATIN_ALMACI", label: t("satinAlmaciYalnizAlis") },
                    { value: "SATISCI", label: t("satisciYalnizSatis") },
                    { value: "BOTH", label: t("satinAlmaciSatisci") },
                  ]}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button color="amber" onClick={confirmTransfer} disabled={update.isPending}>
                    <Crown data-slot="icon" />
                    {update.isPending ? t("devrediliyor") : t("devret")}
                  </Button>
                  <Button plain onClick={() => setTransferOpen(false)}>
                    {t("vazgec")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button outline className="mt-3" onClick={() => setTransferOpen(true)}>
                <Crown data-slot="icon" />
                {t("kuruculuguBuKullaniciyaDevret")}
              </Button>
            )
          ) : null}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? t("kaydediliyor") : t("kaydet")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
