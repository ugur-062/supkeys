"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Text } from "@/components/catalyst/text";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  NOTIFICATION_PREFS,
  TRANSACTIONAL_NOTIFICATIONS,
  useChangePassword,
  useUpdateMe,
  useUpdateNotificationPrefs,
} from "@/hooks/use-company-account";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  Check,
  Eye,
  EyeOff,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const card = "rounded-xl border border-zinc-950/10 bg-white p-5";

const ROLE_LABEL: Record<CompanyRole, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

/** Hesap Bilgileri — profil başlık kartı + salt-okunur/düzenle. */
export function AccountInfoSection() {
  const { user } = useCompanyAuth();
  const updateMe = useUpdateMe();
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState({ firstName: "", lastName: "", phone: "" });

  useEffect(() => {
    if (user) {
      setInfo({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
      });
    }
  }, [user]);

  const save = async () => {
    if (!info.firstName.trim() || !info.lastName.trim()) {
      toast.error("Ad ve soyad boş olamaz");
      return;
    }
    const phone = info.phone.trim();
    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) {
      toast.error("Geçerli bir telefon numarası giriniz");
      return;
    }
    try {
      await updateMe.mutateAsync(info);
      toast.success("Bilgiler güncellendi");
      setEditing(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
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
                <Badge color="amber">Kurucu</Badge>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
              <Mail className="h-3.5 w-3.5" />
              {user?.email}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(user?.roles ?? []).map((r) => (
                <Badge key={r} color="zinc">
                  {ROLE_LABEL[r] ?? r}
                </Badge>
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
              Kişisel Bilgiler
            </h3>
            <Text className="mt-0.5 text-sm text-zinc-500">
              {editing
                ? "Bilgilerinizi güncelleyip kaydedin."
                : "Düzenlemek için sağdaki butonu kullanın."}
            </Text>
          </div>
          {!editing ? (
            <Button outline onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Düzenle
            </Button>
          ) : null}
        </div>

        {!editing ? (
          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <ReadRow label="Ad" value={user?.firstName} />
            <ReadRow label="Soyad" value={user?.lastName} />
            <ReadRow
              label="Telefon"
              value={user?.phone}
              icon={<Phone className="h-3.5 w-3.5 text-zinc-400" />}
            />
            <ReadRow
              label="E-posta"
              value={user?.email}
              icon={<Mail className="h-3.5 w-3.5 text-zinc-400" />}
            />
          </dl>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <Label>Ad</Label>
                <Input
                  value={info.firstName}
                  onChange={(e) =>
                    setInfo({ ...info, firstName: e.target.value })
                  }
                />
              </Field>
              <Field>
                <Label>Soyad</Label>
                <Input
                  value={info.lastName}
                  onChange={(e) =>
                    setInfo({ ...info, lastName: e.target.value })
                  }
                />
              </Field>
              <Field>
                <Label>Telefon</Label>
                <PhoneInput
                  value={info.phone}
                  onChange={(v) => setInfo({ ...info, phone: v })}
                />
              </Field>
              <Field>
                <Label>E-posta</Label>
                <Input value={user?.email ?? ""} disabled />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button plain onClick={() => setEditing(false)}>
                Vazgeç
              </Button>
              <Button onClick={save} disabled={updateMe.isPending}>
                Kaydet
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
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-900">
        {icon}
        {value || "—"}
      </dd>
    </div>
  );
}

const PW_REQUIREMENTS: { key: string; label: string; test: (p: string) => boolean }[] =
  [
    { key: "min", label: "En az 8 karakter", test: (p) => p.length >= 8 },
    { key: "upper", label: "En az 1 büyük harf (A-Z)", test: (p) => /[A-Z]/.test(p) },
    { key: "lower", label: "En az 1 küçük harf (a-z)", test: (p) => /[a-z]/.test(p) },
    { key: "digit", label: "En az 1 rakam", test: (p) => /\d/.test(p) },
  ];

function pwStrength(p: string): { score: number; label: string; color: string } {
  if (!p) return { score: 0, label: "—", color: "bg-zinc-200" };
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  s = Math.min(4, s);
  if (s <= 1) return { score: s, label: "Zayıf", color: "bg-red-500" };
  if (s === 2) return { score: s, label: "Orta", color: "bg-amber-500" };
  if (s === 3) return { score: s, label: "İyi", color: "bg-blue-500" };
  return { score: s, label: "Güçlü", color: "bg-emerald-500" };
}

/** Şifre Değiştir — göster/gizle + güç ölçer + gereksinim listesi. */
export function PasswordSection() {
  const changePassword = useChangePassword();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });

  const strength = pwStrength(pw.next);
  const allMet = PW_REQUIREMENTS.every((r) => r.test(pw.next));

  const save = async () => {
    if (!allMet) {
      toast.error("Yeni parola tüm gereksinimleri karşılamalı");
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error("Yeni parolalar eşleşmiyor");
      return;
    }
    if (pw.current === pw.next) {
      toast.error("Yeni parola eski parolayla aynı olamaz");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      toast.success("Parola değiştirildi");
      setPw({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Parola değiştirilemedi"));
    }
  };

  const fields: { key: keyof typeof pw; label: string; auto: string }[] = [
    { key: "current", label: "Mevcut Şifre", auto: "current-password" },
    { key: "next", label: "Yeni Şifre", auto: "new-password" },
    { key: "confirm", label: "Yeni Şifre (Tekrar)", auto: "new-password" },
  ];

  return (
    <section className={card}>
      <div className="space-y-4">
        {fields.map((fld) => (
          <Field key={fld.key}>
            <Label>{fld.label}</Label>
            <div className="relative">
              <Input
                type={show[fld.key] ? "text" : "password"}
                autoComplete={fld.auto}
                value={pw[fld.key]}
                onChange={(e) => setPw({ ...pw, [fld.key]: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShow({ ...show, [fld.key]: !show[fld.key] })}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700"
                aria-label={show[fld.key] ? "Gizle" : "Göster"}
              >
                {show[fld.key] ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

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
                  <span className="min-w-[3.5rem] text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {strength.label}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {PW_REQUIREMENTS.map((req) => {
                    const ok = req.test(pw.next);
                    return (
                      <li key={req.key} className="flex items-center gap-1.5 text-xs">
                        {ok ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-zinc-300" />
                        )}
                        <span className={ok ? "text-zinc-700" : "text-zinc-400"}>
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
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Parolanız şifrelenmiş olarak saklanır.
        </p>
        <Button
          onClick={save}
          disabled={
            changePassword.isPending || !pw.current || !pw.next || !pw.confirm
          }
        >
          Şifreyi Değiştir
        </Button>
      </div>
    </section>
  );
}

/** Bildirim Tercihleri — switch'ler + toplu aç/kapat. */
export function NotificationPrefsSection() {
  const { user } = useCompanyAuth();
  const updatePrefs = useUpdateNotificationPrefs();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = user?.notificationPrefs ?? null;
    const init: Record<string, boolean> = {};
    for (const p of NOTIFICATION_PREFS) init[p.key] = stored?.[p.key] ?? true;
    setPrefs(init);
  }, [user]);

  const setAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    for (const p of NOTIFICATION_PREFS) next[p.key] = val;
    setPrefs(next);
  };

  const save = async () => {
    try {
      await updatePrefs.mutateAsync(prefs);
      toast.success("Bildirim tercihleri kaydedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text className="text-sm text-zinc-500">
          Hangi durumlarda e-posta bildirimi almak istediğini seç.
        </Text>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-lg border border-zinc-950/10 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
          >
            Hepsini Aç
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="rounded-lg border border-zinc-950/10 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
          >
            Hepsini Kapat
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
              onClick={() => setPrefs({ ...prefs, [p.key]: !on })}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-50"
            >
              <span className="text-sm text-zinc-900">{p.label}</span>
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

      <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Her zaman gönderilir
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Aşağıdaki bildirimler işlem güvenliği/kritikliği nedeniyle kapatılamaz:
        </p>
        <ul className="mt-2 space-y-1">
          {TRANSACTIONAL_NOTIFICATIONS.map((t) => (
            <li key={t} className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={updatePrefs.isPending}>
          Tercihleri Kaydet
        </Button>
      </div>
    </section>
  );
}
