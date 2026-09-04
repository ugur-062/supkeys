"use client";

import {
  SIGNUP_INTENTS,
  parseSignupIntent,
  rememberSignupIntent,
  type SignupIntent,
} from "@/lib/company/signup-intent";

import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  useCompanySignup,
  useResendEmailCode,
  useSetCompanyAuth,
  useVerifyEmail,
} from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, Crown, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// TR: +90 5XX XXX XX XX otomatik maske. Uluslararası (+XX, +90 dışı): olduğu
// gibi bırakılır (yabancı firma kullanıcıları).
export function formatPhone(raw: string): string {
  let s = raw.replace(/[^\d+\s()]/g, "");
  // Uluslararası "00" öneki → "+" (ör. 0049… → +49…)
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+") && !s.startsWith("+90")) return s.slice(0, 20);
  const d = s.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "").slice(0, 10);
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(
    Boolean,
  );
  return d ? `+90 ${p.join(" ")}`.trim() : s;
}

const PW_RULES = [
  { key: "len", label: "En az 10 karakter", test: (p: string) => p.length >= 10 },
  { key: "lower", label: "Küçük harf", test: (p: string) => /[a-z]/.test(p) },
  { key: "upper", label: "Büyük harf", test: (p: string) => /[A-Z]/.test(p) },
  { key: "digit", label: "Rakam", test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "Özel karakter", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];
const STRENGTH = ["Çok Zayıf", "Zayıf", "Orta", "İyi", "Güçlü", "Çok Güçlü"];

export function CompanySignupClient() {
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const router = useRouter();
  // BK-CONN-1: davet linkinden gelen referral token'ı (`/company/kayit?ref=`) —
  // yalnız bu davet ACTIVE bağlantı olur; diğer davetler PENDING istek kalır.
  const searchParams = useSearchParams();
  const referralToken = searchParams.get("ref") ?? undefined;
  // Anasayfa CTA'sından gelen niyet (`?intent=talep|ilan|vitrin`) ön seçili;
  // ziyaretçi değiştirebilir. Doğrulama bitince sessionStorage'a yazılır,
  // `/company` kökü okuyup ilgili sihirbaza yönlendirir.
  const [intent, setIntent] = useState<SignupIntent>(
    parseSignupIntent(searchParams.get("intent")) ?? "ikisi",
  );
  const signup = useCompanySignup();
  const verify = useVerifyEmail();
  const resend = useResendEmailCode();
  const setAuth = useSetCompanyAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
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
  const [step, setStep] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (isHydrated && user) router.replace("/company");
  }, [isHydrated, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pwScore = useMemo(
    () => PW_RULES.filter((r) => r.test(form.password)).length,
    [form.password],
  );
  const pwOk = pwScore === PW_RULES.length;
  const confirmOk =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;
  const allConsents = consents.terms && consents.mediation && consents.kvkk;
  const formValid =
    form.firstName.trim().length >= 2 &&
    form.lastName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.replace(/\D/g, "").length >= 10 && // TR (90+10) veya uluslararası
    pwOk &&
    confirmOk &&
    allConsents;

  const submitForm = async () => {
    setError(null);
    try {
      const res = await signup.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone,
        password: form.password,
        termsAccepted: consents.terms,
        mediationAccepted: consents.mediation,
        kvkkAccepted: consents.kvkk,
        marketingConsent: consents.marketing,
        profileImprovementConsent: consents.profile,
        referralToken,
      });
      setStep("verify");
      // Hesap oluştu; kod adımına geçilir. Ama backend kod e-postasının GİDİP
      // gitmediğini bildiriyor (emailSent). Gitmediyse "gönderildi" yalanı yerine
      // hata göster ve cooldown'ı atla → kullanıcı hemen "Tekrar Gönder"sin.
      if (res.emailSent === false) {
        setCooldown(0);
        setError(
          "Doğrulama kodu şu anda gönderilemedi. Aşağıdan 'Tekrar Gönder' ile yeniden deneyin; sorun sürerse birkaç dakika sonra tekrar deneyin.",
        );
      } else {
        setCooldown(60);
        toast.success("Doğrulama kodu e-postanıza gönderildi");
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Kayıt başarısız"));
    }
  };

  const submitCode = async () => {
    setError(null);
    try {
      const res = await verify.mutateAsync({ email: form.email.trim(), code });
      // Güvenlik: e-posta zaten doğrulanmışsa token DÖNMEZ → normal girişe yönlendir.
      if ("alreadyVerified" in res) {
        toast.info("E-postanız zaten doğrulanmış. Lütfen giriş yapın.");
        router.replace("/company/login");
        return;
      }
      setAuth({ user: res.user, company: res.company });
      rememberSignupIntent(intent);
      router.replace("/company");
    } catch (err) {
      setError(extractErrorMessage(err, "Kod doğrulanamadı"));
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resend.isPending) return;
    setError(null);
    try {
      await resend.mutateAsync(form.email.trim());
      setCooldown(60);
      toast.success("Yeni kod gönderildi");
    } catch (err) {
      setError(extractErrorMessage(err, "Kod gönderilemedi"));
    }
  };

  if (step === "verify") {
    return (
      <AuthShell
        title="E-postanı doğrula"
        subtitle={`${form.email} adresine gönderilen 6 haneli kodu girin`}
        footer={null}
      >
        <div className="space-y-4">
          <Field>
            <Label>Doğrulama kodu</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button
            className="w-full"
            disabled={code.length !== 6 || verify.isPending}
            onClick={submitCode}
          >
            {verify.isPending ? "Doğrulanıyor…" : "Doğrula ve Giriş Yap"}
          </Button>
          <button
            type="button"
            disabled={resend.isPending || cooldown > 0}
            onClick={handleResend}
            className="w-full text-center text-sm text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
          >
            {cooldown > 0
              ? `Yeniden gönder (${cooldown}sn)`
              : resend.isPending
                ? "Gönderiliyor…"
                : "Kod gelmedi mi? Yeniden gönder"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setCode("");
              setError(null);
            }}
            className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600"
          >
            ← E-posta adresini değiştir
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Hesabını aç"
      subtitle="İlk satın alma talebinizi 10 dakikada başlatın. Kredi kartı gerekmez."
      footer={
        <>
          Zaten hesabınız var mı?{" "}
          <Link href="/company/login" className="font-semibold text-zinc-900 hover:underline">
            Giriş yap
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formValid) void submitForm();
        }}
        className="space-y-3"
      >
        {/* Kurucu bilgilendirmesi — ilk kullanıcı firmanın Kurucusu olur. */}
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-800">
          <Crown className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Firmayı ilk siz açtığınız için hesabınız <strong>Kurucu</strong>su
            olarak size atanır — tüm yetkilere sahip olursunuz. Dilerseniz
            sonradan başka bir kullanıcıya devredebilirsiniz.
          </span>
        </div>
        {/* Ne yapmak istiyorsunuz? — kayıt sonrası ilk sayfayı belirler. */}
        <fieldset>
          <legend className="text-sm font-medium text-zinc-900">Ne yapmak istiyorsunuz?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(SIGNUP_INTENTS) as SignupIntent[]).map((k) => {
              const on = intent === k;
              return (
                <label
                  key={k}
                  className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-left transition ${
                    on ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white hover:border-zinc-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={k}
                    checked={on}
                    onChange={() => setIntent(k)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{SIGNUP_INTENTS[k].label}</span>
                  <span className={`mt-0.5 text-xs ${on ? "text-zinc-300" : "text-zinc-500"}`}>
                    {SIGNUP_INTENTS[k].hint}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>Ad</Label>
            <Input value={form.firstName} maxLength={80} onChange={(e) => set("firstName")(e.target.value)} />
          </Field>
          <Field>
            <Label>Soyad</Label>
            <Input value={form.lastName} maxLength={80} onChange={(e) => set("lastName")(e.target.value)} />
          </Field>
        </div>

        <Field>
          <Label>Kurumsal e-posta</Label>
          <Input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
        </Field>

        <Field>
          <Label>Telefon</Label>
          <PhoneInput value={form.phone} onChange={set("phone")} />
        </Field>

        <Field>
          <Label>Şifre</Label>
          <Input type="password" autoComplete="new-password" maxLength={72} value={form.password} onChange={(e) => set("password")(e.target.value)} />
        </Field>
        {form.password ? (
          <div className="space-y-1.5" role="status" aria-live="polite">
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
            invalid={!!(form.passwordConfirm && !confirmOk)}
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm")(e.target.value)}
          />
          {form.passwordConfirm && !confirmOk ? (
            <ErrorMessage className="mt-1">Parolalar eşleşmiyor</ErrorMessage>
          ) : null}
        </Field>

        <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <CheckRow checked={consents.terms} ariaLabel="Kullanıcı sözleşmesini kabul ediyorum" onChange={(v) => setConsents((c) => ({ ...c, terms: v }))}>
            <Link href="/sozlesmeler/kullanici" target="_blank" className="underline">Kullanıcı sözleşmesini</Link> okudum ve kabul ediyorum
          </CheckRow>
          <CheckRow checked={consents.mediation} ariaLabel="Platform aracılık ve kullanım sözleşmesini kabul ediyorum" onChange={(v) => setConsents((c) => ({ ...c, mediation: v }))}>
            <Link href="/sozlesmeler/aracilik" target="_blank" className="underline">Platform aracılık ve kullanım sözleşmesini</Link> kabul ediyorum
          </CheckRow>
          <CheckRow checked={consents.kvkk} ariaLabel="KVKK Aydınlatma Metni bilgilendirmesini okudum" onChange={(v) => setConsents((c) => ({ ...c, kvkk: v }))}>
            <Link href="/sozlesmeler/kvkk" target="_blank" className="underline">KVKK Aydınlatma Metni</Link> bilgilendirmesini okudum (yurt dışı sağlayıcılar: Supabase/Vercel/Resend)
          </CheckRow>
          <div className="border-t border-zinc-200/70 pt-2">
            <CheckRow checked={consents.profile} ariaLabel="Profil ve hizmet iyileştirme (opsiyonel)" onChange={(v) => setConsents((c) => ({ ...c, profile: v }))}>
              <span className="text-zinc-500">Profil ve hizmet iyileştirme (opsiyonel)</span>
            </CheckRow>
            <CheckRow checked={consents.marketing} ariaLabel="Pazarlama ve analitik / ticari ileti (opsiyonel)" onChange={(v) => setConsents((c) => ({ ...c, marketing: v }))}>
              <span className="text-zinc-500">Pazarlama ve analitik / ticari ileti (opsiyonel)</span>
            </CheckRow>
          </div>
        </div>

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={!formValid || signup.isPending}>
          {signup.isPending ? "Oluşturuluyor…" : "Hesap Oluştur"}
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
  // Headless UI Checkbox <input> render etmez → native <label> ilişkisi kurmaz.
  // Ekran okuyucular için açık aria-label şart.
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
