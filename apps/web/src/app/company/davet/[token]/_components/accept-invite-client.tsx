"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AuthShell } from "@/components/marketing/auth-shell";
import {
  useAcceptInvitation,
  useInvitationPreview,
  useSetCompanyAuth,
} from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const PW_RULES = [
  { key: "len", label: "En az 10 karakter", test: (p: string) => p.length >= 10 },
  { key: "lower", label: "Küçük harf", test: (p: string) => /[a-z]/.test(p) },
  { key: "upper", label: "Büyük harf", test: (p: string) => /[A-Z]/.test(p) },
  { key: "digit", label: "Rakam", test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "Özel karakter", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];
const STRENGTH = ["Çok Zayıf", "Zayıf", "Orta", "İyi", "Güçlü", "Çok Güçlü"];

const ROLE_LABEL: Record<string, string> = {
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

/**
 * Token'lı ekip daveti kabulü — davetli adını/parolasını KENDİSİ belirler,
 * sözleşmeleri kendisi onaylar (KVKK/consent). Başarıda oturum açılır.
 */
export function AcceptInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const { data: preview, isLoading, error: previewError } =
    useInvitationPreview(token);
  const accept = useAcceptInvitation(token);
  const setAuth = useSetCompanyAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });
  const [consents, setConsents] = useState({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
    profile: false,
  });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pwScore = useMemo(
    () => PW_RULES.filter((r) => r.test(form.password)).length,
    [form.password],
  );
  const pwOk = pwScore === PW_RULES.length;
  const confirmOk =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;
  const formValid =
    form.firstName.trim().length >= 2 &&
    form.lastName.trim().length >= 2 &&
    pwOk &&
    confirmOk &&
    consents.terms &&
    consents.mediation &&
    consents.kvkk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setError(null);
    try {
      const res = await accept.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        termsAccepted: consents.terms,
        mediationAccepted: consents.mediation,
        kvkkAccepted: consents.kvkk,
        marketingConsent: consents.marketing,
        profileImprovementConsent: consents.profile,
      });
      setAuth({ user: res.user, company: res.company });
      router.replace("/company");
    } catch (err) {
      setError(extractErrorMessage(err, "Davet kabul edilemedi"));
    }
  };

  if (isLoading) {
    return (
      <AuthShell title="Ekip Daveti" subtitle="Davet doğrulanıyor…" footer={null}>
        <p className="py-8 text-center text-sm text-zinc-500">Yükleniyor…</p>
      </AuthShell>
    );
  }

  if (previewError || !preview) {
    return (
      <AuthShell
        title="Davet Geçersiz"
        subtitle="Bu davet linki kullanılamıyor."
        footer={null}
      >
        <div className="space-y-4 py-4">
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractErrorMessage(
              previewError,
              "Davet bulunamadı ya da süresi dolmuş — firmanızdan yeni davet isteyin.",
            )}
          </div>
          <Link
            href="/company/login"
            className="block text-center text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
          >
            Giriş sayfasına dön
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Ekip Daveti"
      subtitle={`${preview.companyName} sizi ekibine davet ediyor.`}
      footer={
        <>
          Zaten hesabınız var mı?{" "}
          <Link href="/company/login" className="font-semibold text-zinc-900 underline">
            Giriş yapın
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900">
              {preview.companyName}
            </span>
            <span className="flex gap-1">
              {preview.roles.map((r) => (
                <Badge key={r} color="zinc">
                  {ROLE_LABEL[r] ?? r}
                </Badge>
              ))}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{preview.email}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>Ad</Label>
            <Input
              autoFocus
              value={form.firstName}
              maxLength={80}
              onChange={(e) => set("firstName")(e.target.value)}
            />
          </Field>
          <Field>
            <Label>Soyad</Label>
            <Input
              value={form.lastName}
              maxLength={80}
              onChange={(e) => set("lastName")(e.target.value)}
            />
          </Field>
        </div>

        <Field>
          <Label>Telefon (opsiyonel)</Label>
          <PhoneInput value={form.phone} onChange={set("phone")} />
        </Field>

        <Field>
          <Label>Şifre</Label>
          <Input
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
          />
        </Field>
        {form.password ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full transition-all ${
                    pwScore <= 2 ? "bg-red-500" : pwScore <= 4 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${(pwScore / PW_RULES.length) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-zinc-600">{STRENGTH[pwScore]}</span>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {PW_RULES.map((r) => {
                const ok = r.test(form.password);
                return (
                  <li key={r.key} className={`flex items-center gap-1 text-xs ${ok ? "text-emerald-600" : "text-zinc-400"}`}>
                    {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {r.label}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <Field>
          <Label>Şifre (tekrar)</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm")(e.target.value)}
          />
          {form.passwordConfirm && !confirmOk ? (
            <p className="mt-1 text-xs text-red-600">Parolalar eşleşmiyor</p>
          ) : null}
        </Field>

        <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <CheckRow
            checked={consents.terms}
            ariaLabel="Kullanıcı sözleşmesini kabul ediyorum"
            onChange={(v) => setConsents((c) => ({ ...c, terms: v }))}
          >
            <Link href="/sozlesmeler/kullanici" target="_blank" className="underline">Kullanıcı sözleşmesini</Link> okudum ve kabul ediyorum
          </CheckRow>
          <CheckRow
            checked={consents.mediation}
            ariaLabel="Platform aracılık ve kullanım sözleşmesini kabul ediyorum"
            onChange={(v) => setConsents((c) => ({ ...c, mediation: v }))}
          >
            <Link href="/sozlesmeler/aracilik" target="_blank" className="underline">Platform aracılık ve kullanım sözleşmesini</Link> kabul ediyorum
          </CheckRow>
          <CheckRow
            checked={consents.kvkk}
            ariaLabel="KVKK Aydınlatma Metni bilgilendirmesini okudum"
            onChange={(v) => setConsents((c) => ({ ...c, kvkk: v }))}
          >
            <Link href="/sozlesmeler/kvkk" target="_blank" className="underline">KVKK Aydınlatma Metni</Link> bilgilendirmesini okudum
          </CheckRow>
          <div className="border-t border-zinc-200/70 pt-2">
            <CheckRow
              checked={consents.profile}
              ariaLabel="Profil ve hizmet iyileştirme (opsiyonel)"
              onChange={(v) => setConsents((c) => ({ ...c, profile: v }))}
            >
              <span className="text-zinc-500">Profil ve hizmet iyileştirme (opsiyonel)</span>
            </CheckRow>
            <CheckRow
              checked={consents.marketing}
              ariaLabel="Pazarlama ve analitik / ticari ileti (opsiyonel)"
              onChange={(v) => setConsents((c) => ({ ...c, marketing: v }))}
            >
              <span className="text-zinc-500">Pazarlama ve analitik / ticari ileti (opsiyonel)</span>
            </CheckRow>
          </div>
        </div>

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={!formValid || accept.isPending}>
          {accept.isPending ? "Katılıyor…" : "Daveti Kabul Et ve Katıl"}
        </Button>
      </form>
    </AuthShell>
  );
}

function CheckRow({
  checked,
  onChange,
  ariaLabel,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700">
      <Checkbox
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        className="mt-0.5"
      />
      <span>{children}</span>
    </label>
  );
}
