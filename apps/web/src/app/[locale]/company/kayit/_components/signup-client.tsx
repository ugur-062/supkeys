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
  useChangeSignupEmail,
  useCompanySignup,
  useResendEmailCode,
  useSetCompanyAuth,
  useVerifyEmail,
} from "@/hooks/use-company-auth";
import { usePasswordRules } from "@/lib/company-auth/password-rules";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { api } from "@/lib/api";
import { saveInvitePrefill, type InvitePrefill } from "@/lib/company-auth/invite-prefill";
import { Link } from "@/i18n/navigation";
import { isValidPhoneNumber } from "@rothern/shared";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
  // Davet bağlantısı açıldı → ilgi sinyali (2026-09-27): bu adrese yeni talep
  // davetleri 7 günlük sıklık freni beklemeden gider. Sessiz, bir kez.
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
  const changeEmail = useChangeSignupEmail();
  const setAuth = useSetCompanyAuth();

  // Misafir bilgi talebi bağlantıları (`talep-onayla`, yanıt e-postası CTA'sı)
  // kaydı `?email=` ile açar: talepler hesaba E-POSTA eşleşmesiyle bağlanır,
  // alan boş gelirse başka adresle kaydolup yanıtı kaybediyordu (derin
  // denetim LU-22). Kullanıcı yine değiştirebilir.
  const [form, setForm] = useState(() => ({
    firstName: "",
    lastName: "",
    email: (searchParams.get("email") ?? "").trim().slice(0, 254),
    phone: "",
    password: "",
    passwordConfirm: "",
  }));
  // Davetle gelen firma: e-posta hazır gelir, firma bilgileri onboarding'e
  // saklanır (2026-09-27, Faz 3 — adresin kendi firması, AI keşfinin bulduğu).
  useEffect(() => {
    if (!referralToken) return;
    void api
      .post<InvitePrefill>("/public/referral-visit", { token: referralToken })
      .then(({ data }) => {
        saveInvitePrefill(data);
        if (data?.email) setForm((f) => (f.email ? f : { ...f, email: data.email! }));
      })
      .catch(() => undefined);
  }, [referralToken]);
  const [consents, setConsents] = useState<Consents>({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
    profile: false,
  });
  const [error, setError] = useState<string | null>(null);
  // Telefon hatası alandan ÇIKINCA gösterilir (yazarken her hanede uyarı çıkmasın).
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");
  // Kod adımında e-posta düzeltme (null = kapalı). Forma dönüp YENİDEN kayıt
  // açmak ikinci firma + yetim hesap bırakıyordu; artık aynı hesabın adresi
  // değişir (derin denetim LU-22).
  const [newEmail, setNewEmail] = useState<string | null>(null);
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
  const phoneValid = isValidPhoneNumber(form.phone);
  const formValid =
    form.firstName.trim().length >= 1 &&
    form.lastName.trim().length >= 1 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    // Ülke koduna göre ulusal uzunluk — API DTO ile TEK KAYNAK (2026-09-27;
    // eskiden "en az 10 hane": Andorra/Lüksemburg reddediliyordu).
    phoneValid &&
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

  const submitNewEmail = async () => {
    if (newEmail == null || changeEmail.isPending) return;
    setError(null);
    try {
      const res = await changeEmail.mutateAsync({
        email: form.email.trim(),
        password: form.password,
        newEmail: newEmail.trim(),
      });
      setForm((f) => ({ ...f, email: res.email }));
      setNewEmail(null);
      setCode("");
      if (res.emailSent === false) {
        setCooldown(0);
        setError(t("codeNotSent"));
      } else {
        setCooldown(60);
        toast.success(t("codeSent"));
      }
    } catch (err) {
      setError(extractErrorMessage(err, t("changeEmailFailed")));
    }
  };

  if (step === "verify" && newEmail != null) {
    return (
      <AuthShell title={t("changeEmailTitle")} subtitle={t("changeEmailSubtitle")} footer={null}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitNewEmail();
          }}
        >
          <Field>
            <Label>{t("newEmail")}</Label>
            <Input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </Field>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={
              changeEmail.isPending ||
              !/\S+@\S+\.\S+/.test(newEmail) ||
              newEmail.trim().toLowerCase() === form.email.trim().toLowerCase()
            }
          >
            {changeEmail.isPending ? tc("sending") : t("sendToNewEmail")}
          </Button>
          <button
            type="button"
            onClick={() => {
              setNewEmail(null);
              setError(null);
            }}
            className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600"
          >
            {t("cancelChangeEmail")}
          </button>
        </form>
      </AuthShell>
    );
  }

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
              setNewEmail(form.email);
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
          <div
            onBlur={(e) => {
              // Ülke seçiciden numara kutusuna geçiş "alandan çıkış" sayılmaz.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPhoneTouched(true);
            }}
          >
            <PhoneInput
              value={form.phone}
              onChange={set("phone")}
              invalid={phoneTouched && !phoneValid}
            />
          </div>
          {phoneTouched && !phoneValid ? <ErrorMessage>{t("phoneInvalid")}</ErrorMessage> : null}
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
