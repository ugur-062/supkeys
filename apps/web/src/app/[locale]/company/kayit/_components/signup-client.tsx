"use client";

import {
  parseSignupIntent,
  rememberSignupIntent,
  type SignupIntent,
} from "@/lib/company/signup-intent";

import { ConsentRows, type Consents } from "@/components/auth/consent-rows";
import { PasswordStrength } from "@/components/auth/password-strength";
import { AuthShell } from "@/components/marketing/auth-shell";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  useCompanySignup,
  useResendEmailCode,
  useSetCompanyAuth,
  useVerifyEmail,
} from "@/hooks/use-company-auth";
import { usePasswordRules } from "@/lib/company-auth/password-rules";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Crown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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

export function CompanySignupClient() {
  const t = useTranslations("web.auth.signup");
  const tc = useTranslations("web.auth.common");
  const tp = useTranslations("web.auth.password");
  const { rules: PW_RULES, strength } = usePasswordRules();
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const router = useRouter();
  // BK-CONN-1: davet linkinden gelen referral token'ı (`/company/kayit?ref=`) —
  // yalnız bu davet ACTIVE bağlantı olur; diğer davetler PENDING istek kalır.
  const searchParams = useSearchParams();
  const referralToken = searchParams.get("ref") ?? undefined;
  /**
   * Niyet YALNIZ adresten gelir — form artık SORMUYOR (2026-09-14).
   *
   * "Ne yapmak istiyorsunuz?" kutusu kaldırıldı: seçenek bir TERCİH değil
   * PAKET KISITIYDI. Yeni firma STANDART doğuyor ve satınalma paneli GOLD
   * istiyor, yani kullanıcı "alım talebi açmak" diyebiliyor ama yapamıyordu.
   * Kayıt formuna, karşılığı olmayan bir soru eklemek dönüşüm kaybettirir.
   *
   * Mekanizma duruyor: `?intent=vitrin` ürün formuna, `?redirect=` geldiği
   * kayda döndürür. Paket satışı devreye girince soru geri gelebilir.
   */
  const intent: SignupIntent = parseSignupIntent(searchParams.get("intent")) ?? "ikisi";
  // "Teklif ver" / "Bilgi iste"den gelen geri dönüş yolu — kayıt + onboarding
  // sonrası aynı kayda döner (yalnız site içi; sessionStorage'a yazılır).
  const redirect = searchParams.get("redirect");
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
  const [consents, setConsents] = useState<Consents>({
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
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pwScore = useMemo(
    () => PW_RULES.filter((r) => r.test(form.password)).length,
    [PW_RULES, form.password],
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
        setError(t("codeNotSent"));
      } else {
        setCooldown(60);
        toast.success(t("codeSent"));
      }
    } catch (err) {
      setError(extractErrorMessage(err, t("failed")));
    }
  };

  const submitCode = async () => {
    setError(null);
    try {
      const res = await verify.mutateAsync({ email: form.email.trim(), code });
      // Güvenlik: e-posta zaten doğrulanmışsa token DÖNMEZ → normal girişe yönlendir.
      if ("alreadyVerified" in res) {
        toast.info(t("alreadyVerified"));
        router.replace("/company/login");
        return;
      }
      setAuth({ user: res.user, company: res.company });
      rememberSignupIntent(intent, redirect);
      router.replace("/company");
    } catch (err) {
      setError(extractErrorMessage(err, tc("codeVerifyFailed")));
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resend.isPending) return;
    setError(null);
    try {
      await resend.mutateAsync(form.email.trim());
      setCooldown(60);
      toast.success(tc("newCodeSent"));
    } catch (err) {
      setError(extractErrorMessage(err, tc("codeSendFailed")));
    }
  };

  if (step === "verify") {
    return (
      <AuthShell
        title={t("verifyTitle")}
        subtitle={t("verifySubtitle", { email: form.email })}
        footer={null}
      >
        <div className="space-y-4">
          <Field>
            <Label>{tc("code")}</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={tc("codePlaceholder")}
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
            {verify.isPending ? tc("verifying") : tc("verifyAndLogin")}
          </Button>
          <button
            type="button"
            disabled={resend.isPending || cooldown > 0}
            onClick={handleResend}
            className="w-full text-center text-sm text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
          >
            {cooldown > 0
              ? tc("resendIn", { s: cooldown })
              : resend.isPending
                ? tc("sending")
                : t("codeNotReceived")}
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
            {t("changeEmail")}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {tc("haveAccount")}{" "}
          <Link href="/company/login" className="font-semibold text-zinc-900 hover:underline">
            {tc("login")}
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
          <span>{t.rich("founderNote", { b: (chunks) => <strong>{chunks}</strong> })}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>{tc("firstName")}</Label>
            <Input value={form.firstName} maxLength={80} onChange={(e) => set("firstName")(e.target.value)} />
          </Field>
          <Field>
            <Label>{tc("lastName")}</Label>
            <Input value={form.lastName} maxLength={80} onChange={(e) => set("lastName")(e.target.value)} />
          </Field>
        </div>

        <Field>
          <Label>{t("corporateEmail")}</Label>
          <Input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
        </Field>

        <Field>
          <Label>{tc("phone")}</Label>
          <PhoneInput value={form.phone} onChange={set("phone")} />
        </Field>

        <Field>
          <Label>{tc("password")}</Label>
          <PasswordInput autoComplete="new-password" maxLength={72} value={form.password} onChange={(e) => set("password")(e.target.value)} />
        </Field>
        {form.password ? (
          <PasswordStrength password={form.password} rules={PW_RULES} score={pwScore} label={strength(pwScore)} live />
        ) : null}

        <Field>
          <Label>{t("passwordRepeat")}</Label>
          <PasswordInput
            autoComplete="new-password"
            invalid={!!(form.passwordConfirm && !confirmOk)}
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm")(e.target.value)}
          />
          {form.passwordConfirm && !confirmOk ? (
            <ErrorMessage className="mt-1">{tp("mismatch")}</ErrorMessage>
          ) : null}
        </Field>

        <ConsentRows consents={consents} onChange={setConsents} showProviders />

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={!formValid || signup.isPending}>
          {signup.isPending ? t("creating") : t("submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
