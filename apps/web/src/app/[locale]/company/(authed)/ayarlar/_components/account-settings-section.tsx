"use client";

import { useTranslations } from "next-intl";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Text } from "@/components/catalyst/text";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  NOTIFICATION_PREFS,
  useChangePassword,
  useUpdateMe,
  useUpdateNotificationPrefs,
} from "@/hooks/use-company-account";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  Check,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";
import { isValidPhone } from "@/lib/company/phone";
import { PASSWORD_MIN_LENGTH, usePasswordRules } from "@/lib/company-auth/password-rules";

const card = "rounded-xl border border-zinc-950/10 bg-white p-5";

/** Hesap Bilgileri — profil başlık kartı + salt-okunur/düzenle. */
export function AccountInfoSection() {
  const t = useTranslations("web.panel.settings.accountSettingsSection");
  const { user } = useCompanyAuth();
  const updateMe = useUpdateMe();
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState({ firstName: "", lastName: "", phone: "" });
  // Alan hataları SATIR İÇİ (proje kuralı: <Field error>), toast değil.
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});

  const fromUser = () => ({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: user?.phone ?? "",
  });
  useEffect(() => {
    if (user) setInfo(fromUser());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const base = fromUser();
  const dirty =
    info.firstName.trim() !== base.firstName ||
    info.lastName.trim() !== base.lastName ||
    info.phone.trim() !== base.phone;
  // Vazgeç: yarım kalan düzenleme bir sonraki "Düzenle"de geri gelmesin.
  const cancel = () => {
    setInfo(fromUser());
    setErrors({});
    setEditing(false);
  };

  // Çift tık iki istek / iki toast üretmesin (arayüz testi FX-00 D-132).
  const saveLock = useSubmitLock();
  const save = () => saveLock.run(doSave);
  const doSave = async () => {
    const next: typeof errors = {};
    if (!info.firstName.trim()) next.firstName = t("adBosOlamaz");
    if (!info.lastName.trim()) next.lastName = t("soyadBosOlamaz");
    if (!isValidPhone(info.phone)) next.phone = t("gecerliBirTelefonNumarasiGirin");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await updateMe.mutateAsync(info);
      toast.success(t("bilgilerGuncellendi"));
      setEditing(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("guncellenemedi")));
    }
  };

  const fullName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

  return (
    <div className="space-y-4">
      {/* Profil başlık kartı */}
      <section className={card}>
        <div className="flex items-center gap-4">
          <AvatarInitials name={fullName || "?"} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-zinc-950">
                {fullName || "—"}
              </h2>
              {user?.isOwner ? (
                <RoleBadge owner />
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-zinc-500">
              <Mail className="h-3.5 w-3.5" />
              {user?.email}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {/* C49: Kurucu ad yanında rozet olarak var — listede tekrarı gizli. */}
              {(user?.roles ?? [])
                .filter((r) => r !== "SAHIP")
                .map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bilgiler — salt-okunur / düzenle */}
      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              {t("kisiselBilgiler")}
            </h3>
            <Text className="mt-0.5 text-sm text-zinc-500">
              {editing
                ? t("bilgileriniziGuncelleyipKaydedin")
                : t("duzenlemekIcinSagdakiButonuKullanin")}
            </Text>
          </div>
          {!editing ? (
            <Button outline onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t("duzenle")}
            </Button>
          ) : null}
        </div>

        {!editing ? (
          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <ReadRow label={t("ad")} value={user?.firstName} />
            <ReadRow label={t("soyad")} value={user?.lastName} />
            <ReadRow
              label={t("telefon")}
              value={user?.phone}
              icon={<Phone className="h-3.5 w-3.5 text-zinc-400" />}
            />
            <ReadRow
              label={t("ePosta")}
              value={user?.email}
              icon={<Mail className="h-3.5 w-3.5 text-zinc-400" />}
            />
          </dl>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <Label>{t("ad")}</Label>
                <Input
                  value={info.firstName}
                  maxLength={80}
                  invalid={!!errors.firstName}
                  onChange={(e) =>
                    setInfo({ ...info, firstName: e.target.value })
                  }
                />
                {errors.firstName ? <ErrorMessage>{errors.firstName}</ErrorMessage> : null}
              </Field>
              <Field>
                <Label>{t("soyad")}</Label>
                <Input
                  value={info.lastName}
                  maxLength={80}
                  invalid={!!errors.lastName}
                  onChange={(e) =>
                    setInfo({ ...info, lastName: e.target.value })
                  }
                />
                {errors.lastName ? <ErrorMessage>{errors.lastName}</ErrorMessage> : null}
              </Field>
              <Field>
                <Label>{t("telefon")}</Label>
                <PhoneInput
                  value={info.phone}
                  onChange={(v) => setInfo({ ...info, phone: v })}
                />
                {errors.phone ? <ErrorMessage>{errors.phone}</ErrorMessage> : null}
              </Field>
              <Field>
                <Label>{t("ePosta")}</Label>
                <Input value={user?.email ?? ""} disabled />
                <Text className="mt-1 text-xs text-zinc-500">
                  {t("girisKimliginizdirDegistirmekIcinDestek")}
                </Text>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button plain onClick={cancel}>
                {t("vazgec")}
              </Button>
              <Button onClick={() => void save()} disabled={updateMe.isPending || !dirty || saveLock.locked}>
                {updateMe.isPending || saveLock.locked ? t("kaydediliyor") : t("kaydet")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReadRow({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-2 text-sm text-zinc-900">
        {icon}
        {value || "—"}
      </dd>
    </div>
  );
}

// Şifre gereksinimleri kayıt/davetle ORTAK kaynaktan (`usePasswordRules`) —
// buradaki ayrı kopya 8 karakter + özel karaktersiz kabul ediyordu (yayın
// denetimi 2026-09-28 Bölüm 9).

/** Güç etiketi `pwStrength.<label>` katalog anahtarı; boş şifrede etiket yok ("—"). */
type PwStrengthKey = "zayif" | "orta" | "iyi" | "guclu";

function pwStrength(p: string): { score: number; label: PwStrengthKey | null; color: string } {
  if (!p) return { score: 0, label: null, color: "bg-zinc-200" };
  let s = 0;
  if (p.length >= PASSWORD_MIN_LENGTH) s++;
  if (p.length >= PASSWORD_MIN_LENGTH + 4) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  s = Math.min(4, s);
  if (s <= 1) return { score: s, label: "zayif", color: "bg-red-500" };
  if (s === 2) return { score: s, label: "orta", color: "bg-amber-500" };
  if (s === 3) return { score: s, label: "iyi", color: "bg-blue-500" };
  return { score: s, label: "guclu", color: "bg-emerald-500" };
}

/** Şifre Değiştir — göster/gizle + güç ölçer + gereksinim listesi. */
export function PasswordSection() {
  const t = useTranslations("web.panel.settings.accountSettingsSection");
  const changePassword = useChangePassword();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const { rules: pwRules } = usePasswordRules();
  const strength = pwStrength(pw.next);
  const allMet = pwRules.every((r) => r.test(pw.next));
  // Alan hataları SATIR İÇİ (gereksinim listesi zaten görünür; toast tekrar etmez).
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  const saveLock = useSubmitLock();
  const save = () => saveLock.run(doSave);
  const doSave = async () => {
    const next: typeof errors = {};
    if (!pw.current) next.current = t("mevcutSifreniziGirin");
    if (!allMet) next.next = t("yeniSifreAsagidakiGereksinimlerinTumunuKarsilamali");
    else if (pw.current && pw.current === pw.next) next.next = t("yeniSifreEskiSifreyleAyniOlamaz");
    if (pw.next !== pw.confirm) next.confirm = t("yeniSifrelerEslesmiyor");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await changePassword.mutateAsync({
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      toast.success(t("sifreDegistirildi"));
      setPw({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(extractErrorMessage(err, t("sifreDegistirilemedi")));
    }
  };

  const fields: { key: keyof typeof pw; label: string; auto: string }[] = [
    { key: "current", label: t("mevcutSifre"), auto: "current-password" },
    { key: "next", label: t("yeniSifre"), auto: "new-password" },
    { key: "confirm", label: t("yeniSifreTekrar"), auto: "new-password" },
  ];

  return (
    <section className={card}>
      <div className="space-y-4">
        {fields.map((fld) => (
          <Field key={fld.key}>
            <Label>{fld.label}</Label>
            {/* Ortak şifre alanı: göz düğmesi klavyeyle erişilir ve kutunun
                içinde durur (arayüz testi D-306; kendi kopyası tabIndex=-1 idi). */}
            <PasswordInput
              autoComplete={fld.auto}
              value={pw[fld.key]}
              maxLength={72}
              invalid={!!errors[fld.key]}
              onChange={(e) => setPw({ ...pw, [fld.key]: e.target.value })}
            />

            {errors[fld.key] ? <ErrorMessage>{errors[fld.key]}</ErrorMessage> : null}
            {/* Yeni şifre altında güç ölçer + gereksinimler */}
            {fld.key === "next" && pw.next ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          strength.score > i ? strength.color : "bg-zinc-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="min-w-[3.5rem] text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {strength.label ? t(`pwStrength.${strength.label}` as never) : "—"}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {pwRules.map((req) => {
                    const ok = req.test(pw.next);
                    return (
                      <li key={req.key} className="flex items-center gap-2 text-xs">
                        {ok ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-zinc-300" />
                        )}
                        <span className={ok ? "text-zinc-700" : "text-zinc-500"}>
                          {req.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </Field>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          {t("sifrenizSifrelenmisOlarakSaklanirEkibimiz")}
        </p>
        <Button
          onClick={() => void save()}
          disabled={
            changePassword.isPending || saveLock.locked || !pw.current || !pw.next || !pw.confirm
          }
        >
          {t("sifreyiDegistir")}
        </Button>
      </div>
    </section>
  );
}

/**
 * Transactional bildirimler — kapatılamaz, bilgi olarak listelenir. Metin
 * `transactional.<key>` katalog anahtarında (hook'taki Türkçe
 * `TRANSACTIONAL_NOTIFICATIONS` listesiyle aynı üç madde).
 */
const TRANSACTIONAL_KEYS = ["bidWon", "orderStatus", "accountMail"] as const;

/** Bildirim Tercihleri — switch'ler + toplu aç/kapat. */
export function NotificationPrefsSection() {
  const t = useTranslations("web.panel.settings.accountSettingsSection");
  const { user } = useCompanyAuth();
  const updatePrefs = useUpdateNotificationPrefs();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = user?.notificationPrefs ?? null;
    const init: Record<string, boolean> = {};
    for (const p of NOTIFICATION_PREFS) init[p.key] = stored?.[p.key] ?? true;
    // Bayrak (tür değil): kategori e-postalarının hepsi anında — varsayılan KAPALI
    // (günde 3 anında, fazlası akşam özeti; 2026-09-27, Faz 2).
    init.categoryMatchInstant = stored?.categoryMatchInstant === true;
    setPrefs(init);
  }, [user]);

  const setAll = (val: boolean) => {
    const next: Record<string, boolean> = { ...prefs };
    for (const p of NOTIFICATION_PREFS) next[p.key] = val;
    setPrefs(next);
  };

  const saveLock = useSubmitLock();
  const save = () => saveLock.run(doSave);
  const doSave = async () => {
    try {
      await updatePrefs.mutateAsync(prefs);
      toast.success(t("bildirimTercihleriKaydedildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text className="text-sm text-zinc-500">
          {t("hangiDurumlardaEPostaBildirimi")}
        </Text>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-lg border border-zinc-950/10 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
          >
            {t("hepsiniAc")}
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="rounded-lg border border-zinc-950/10 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
          >
            {t("hepsiniKapat")}
          </button>
        </div>
      </div>

      <div className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-100">
        {NOTIFICATION_PREFS.map((p) => {
          const on = prefs[p.key] ?? true;
          return (
            <button
              key={p.key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => setPrefs({ ...prefs, [p.key]: !on })}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-100"
            >
              <span className="text-sm text-zinc-900">
                {t(`notificationPref.${p.key}` as never)}
              </span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                  on ? "bg-zinc-900" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                    on ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* Kategori e-postası sıklığı (2026-09-27, Faz 2): kapalıyken günde 3
          anında + akşam özeti; açıkken her talep anında. */}
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-100 px-4 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-zinc-300"
          checked={!!prefs.categoryMatchInstant}
          disabled={prefs.categoryMatch === false}
          onChange={(e) => setPrefs({ ...prefs, categoryMatchInstant: e.target.checked })}
        />
        <span className="min-w-0">
          <span className="block text-sm text-zinc-900">{t("categoryMatchInstant")}</span>
          <span className="mt-0.5 block text-xs text-zinc-600">{t("categoryMatchInstantHint")}</span>
        </span>
      </label>

      <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-100/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t("herZamanGonderilir")}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {t("asagidakiBildirimlerIslemGuvenligiKritikligi")}
        </p>
        <ul className="mt-2 space-y-1">
          {TRANSACTIONAL_KEYS.map((k) => (
            <li key={k} className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              {t(`transactional.${k}` as never)}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()} disabled={updatePrefs.isPending || saveLock.locked}>
          {t("tercihleriKaydet")}
        </Button>
      </div>
    </section>
  );
}
