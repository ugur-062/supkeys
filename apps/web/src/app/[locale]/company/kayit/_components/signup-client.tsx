"use client";

import {
  parseSignupIntent,
  rememberSignupIntent,
  signupIntentTarget,
  type SignupIntent,
} from "@/lib/company/signup-intent";

import { ConsentRows, type Consents } from "@/components/auth/consent-rows";
import { PasswordStrength } from "@/components/auth/password-strength";
import { SessionCheck } from "@/components/auth/session-check";
import { AuthShell } from "@/components/marketing/auth-shell";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/catalyst/button";
import { Description, ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  useChangeSignupEmail,
  useCompanySignup,
  useResendEmailCode,
  useSetCompanyAuth,
  useVerifyEmail,
} from "@/hooks/use-company-auth";
import { useCompanySessionWait } from "@/hooks/use-company-session-wait";
import { isPlausibleEmail } from "@/lib/company-auth/email";
import { loginLinkFromSignup } from "@/lib/company-auth/next-path";
import {
  firstUnmetPasswordRule,
  PASSWORD_ERROR_KEY,
  PASSWORD_MAX_LENGTH,
} from "@/lib/company-auth/password-rules";
import { normalizeOtpCode, OTP_LENGTH } from "@/lib/company-auth/otp-code";
import { resendDisabledClass, resendEmailCodeOutcome } from "@/lib/company-auth/resend-code";
import { clearSignupDraft, readSignupDraft, saveSignupDraft } from "@/lib/company-auth/signup-draft";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useFocusFirstInvalid } from "@/lib/company-auth/use-focus-first-invalid";
import { extractErrorMessage } from "@/lib/tenders/error";
import { api } from "@/lib/api";
import { saveInvitePrefill, type InvitePrefill } from "@/lib/company-auth/invite-prefill";
import { Link } from "@/i18n/navigation";
import { isValidPhoneNumber } from "@rothern/shared";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";

/**
 * Kod adımının ikincil bağlantıları (yeniden gönder, adresi değiştir, vazgeç):
 * metin en az zinc-500 (12 px zinc-400 beyazda 2,6:1'di) ve dokunma alanı en
 * az 32 px yüksek (arayüz testi 2026-10 signup-tr-20, login-10). Pasif görünüm
 * düğmenin kendisinde (`resendDisabledClass`): geri sayım metni soluklaşmaz
 * (relogin-3).
 */
const SECONDARY_LINK =
  // `-mt-2` / `last:-mb-2`: dolgu dokunma alanını büyütür, form uzamaz.
  "-mt-2 w-full py-2 text-center text-zinc-500 last:-mb-2 enabled:hover:text-zinc-800";

export function CompanySignupClient() {
  const t = useTranslations("web.auth.signup");
  const tc = useTranslations("web.auth.common");
  const tp = useTranslations("web.auth.password");
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  // Girişli ziyaretçi formu GÖRMEZ (arayüz testi 2026-10 relogin-4): giriş
  // sayfasıyla AYNI kural ve aynı yükleme durumu — eskiden tam kayıt formu
  // ~300 ms görünüyor, sonra panele gidiliyordu. Oturum durumu bilinene dek
  // ve aşağıdaki "zaten girişli" yönlendirmesi sürerken form çizilmez.
  const waiting = useCompanySessionWait();
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
  const intentParam = parseSignupIntent(searchParams.get("intent"));
  const intent: SignupIntent = intentParam ?? "ikisi";
  // "Teklif ver" / "Bilgi iste"den gelen geri dönüş yolu — kayıt + onboarding
  // sonrası aynı kayda döner (yalnız site içi; sessionStorage'a yazılır).
  const redirect = searchParams.get("redirect");
  // Hesabı olan ziyaretçi için giriş bağlantısı dönüş hedefini taşır: davet
  // e-postasından gelen kişi girişten sonra davet edildiği talebi açar
  // (arayüz testi 2026-10 code-auth-8).
  const loginHref = loginLinkFromSignup({ target: redirect, ref: referralToken, intent: intentParam });
  const signup = useCompanySignup();
  const verify = useVerifyEmail();
  const resend = useResendEmailCode();
  const changeEmail = useChangeSignupEmail();
  const setAuth = useSetCompanyAuth();

  // Misafir bilgi talebi bağlantıları (`talep-onayla`, yanıt e-postası CTA'sı)
  // kaydı `?email=` ile açar: talepler hesaba E-POSTA eşleşmesiyle bağlanır,
  // alan boş gelirse başka adresle kaydolup yanıtı kaybediyordu (derin
  // denetim LU-22). Kullanıcı yine değiştirebilir.
  const emailSeed = (searchParams.get("email") ?? "").trim().slice(0, 254);
  const [form, setForm] = useState(() => ({
    firstName: "",
    lastName: "",
    email: emailSeed,
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
  // "Hesap Oluştur"a basıldı: geçersiz her alan iletisini gösterir (arayüz
  // testi 2026-10 signup-tr-8 — düğme eskiden sessizce pasif kalıyordu).
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  // Kod adımında e-posta düzeltme (null = kapalı). Forma dönüp YENİDEN kayıt
  // açmak ikinci firma + yetim hesap bırakıyordu; artık aynı hesabın adresi
  // değişir (derin denetim LU-22).
  const [newEmail, setNewEmail] = useState<string | null>(null);
  // Geri yüklenen kod adımında şifre bellekte yoktur (taslağa ASLA yazılmaz);
  // adres düzeltme formu onu yeniden sorar.
  const [changePassword, setChangePassword] = useState("");
  const [changeTried, setChangeTried] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Kayıtta e-posta zaten kayıtlı (409): hata yanında giriş bağlantısı —
  // doğrulanmamış hesap girişte kod adımına geçer (arayüz testi D-066).
  const [accountExists, setAccountExists] = useState(false);
  // Kod doğrulandı, oturum bu formda AÇILDI: yönlendirme `doSubmitCode`un
  // (`/company` kökü niyeti onboarding'den sonra okur); aşağıdaki "zaten
  // girişli" kestirmesi devreye girip onboarding'i atlatmasın.
  const justVerified = useRef(false);

  /**
   * TASLAK (arayüz testi 2026-10 code-auth-5/10, signup-enru-1, signup-tr-15):
   * dil değişimi ve yenileme aynı duruma döner — alanlar, onaylar ve açıksa
   * kod adımı. Şifreler yazılmaz. Geri yükleme bağlandıktan SONRA efektte
   * (ilk çizim sunucu HTML'iyle aynı kalır → hidrasyon uyuşmazlığı yok);
   * yazma efekti geri yükleme bitmeden çalışmaz, yoksa boş ilk durum taslağı
   * ezerdi. Ayrıntı: `lib/company-auth/signup-draft.ts`.
   */
  const [draftReady, setDraftReady] = useState(false);
  const draftClosed = useRef(false);
  useEffect(() => {
    const draft = readSignupDraft();
    if (draft) {
      // Yeni bir `?email=` bağlantısıyla gelindiyse bağlantıdaki adres kazanır.
      const keepTypedEmail = draft.emailSeed === emailSeed;
      setForm((f) => ({
        ...f,
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.verifyEmail ?? ((keepTypedEmail ? draft.email : "") || f.email || draft.email),
        phone: draft.phone,
      }));
      setConsents(draft.consents);
      if (draft.verifyEmail) setStep("verify");
    }
    setDraftReady(true);
    // Yalnız bağlanırken: taslak bu sekmenin önceki durumudur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftReady || draftClosed.current) return;
    saveSignupDraft({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      consents,
      verifyEmail: step === "verify" ? form.email.trim() : null,
      emailSeed,
    });
  }, [draftReady, form.firstName, form.lastName, form.email, form.phone, consents, step, emailSeed]);
  /** Hesap doğrulandı / zaten doğrulanmış: taslak kapanır, yeniden yazılmaz. */
  const closeDraft = () => {
    draftClosed.current = true;
    clearSignupDraft();
  };

  // ZATEN GİRİŞLİ ziyaretçi (arayüz testi O-113): "Teklif ver" / "Bilgi iste"
  // gibi kayıt CTA'larından geldiyse `redirect`e (yoksa niyetin hedefine)
  // gider; eskiden hep `/company`ye atılıyor, tıkladığı talep kayboluyordu.
  useEffect(() => {
    if (!isHydrated || !user || justVerified.current) return;
    router.replace(signupIntentTarget(intent, redirect) ?? "/company");
  }, [isHydrated, user, router, intent, redirect]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Kurallar TEK kaynaktan (`password-rules.ts`): kayıt, sıfırlama, davet aynı.
  const pwUnmet = firstUnmetPasswordRule(form.password);
  const confirmOk =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;
  const allConsents = consents.terms && consents.mediation && consents.kvkk;
  // Ülke seçilmeden numara yazıldı (İngilizce arayüzde varsayılan ülke yok):
  // hata "seçili ülke için geçerli numara" değil "önce ülke kodunu seçin"
  // (arayüz testi son tur webA-1).
  const [phoneNeedsCountry, setPhoneNeedsCountry] = useState(false);
  // Ülke koduna göre ulusal uzunluk — API DTO ile TEK KAYNAK (2026-09-27;
  // eskiden "en az 10 hane": Andorra/Lüksemburg reddediliyordu).
  const phoneValid = isValidPhoneNumber(form.phone);
  const firstNameOk = form.firstName.trim().length >= 1;
  const lastNameOk = form.lastName.trim().length >= 1;
  // Girişle AYNI gevşek kural (`isPlausibleEmail`); asıl doğrulama API'de.
  const emailOk = isPlausibleEmail(form.email);
  const formValid =
    firstNameOk && lastNameOk && emailOk && phoneValid && pwUnmet === null && confirmOk && allConsents;

  /**
   * Alan hataları. Düğmeye basılana dek yalnız eskiden de canlı olan ikisi
   * görünür (telefon: alandan çıkınca; şifre tekrarı: yazarken); basıldıktan
   * sonra geçersiz HER alan iletisini taşır ve düzeltildikçe kendiliğinden
   * kalkar. İleti alanın `<Field>`i içinde `ErrorMessage`dır → Headless onu
   * girdinin `aria-describedby`ına bağlar; `invalid` → `aria-invalid`.
   */
  const fieldError = {
    firstName: submitted && !firstNameOk ? t("firstNameRequired") : null,
    lastName: submitted && !lastNameOk ? t("lastNameRequired") : null,
    email: submitted && !emailOk ? t("emailInvalid") : null,
    // Üç ayrı durum, üç ayrı ileti (kayıt denetimi 2026-10 resignup-5): ülke
    // seçilmeden rakam yazıldı → "önce ülke kodu"; alan BOŞ → "numaranızı
    // girin" (İngilizce arayüzde seçili ülke yokken "seçili ülke için geçerli
    // numara" deniyordu); numara var ama ülkesine uymuyor → "seçili ülke için".
    phone:
      (submitted || phoneTouched) && !phoneValid
        ? phoneNeedsCountry
          ? tc("phoneCountryRequired")
          : form.phone.trim()
            ? t("phoneInvalid")
            : t("phoneRequired")
        : null,
    password: submitted && pwUnmet ? tp(PASSWORD_ERROR_KEY[pwUnmet]) : null,
    passwordConfirm:
      form.passwordConfirm && !confirmOk
        ? tp("mismatch")
        : submitted && !form.passwordConfirm
          ? t("passwordRepeatRequired")
          : null,
    consents: submitted && !allConsents ? t("consentRequired") : null,
  };

  const signupForm = useFocusFirstInvalid();
  const changeForm = useFocusFirstInvalid();
  const codeInput = useRef<HTMLInputElement>(null);
  const newEmailInput = useRef<HTMLInputElement>(null);
  const changePasswordInput = useRef<HTMLInputElement>(null);

  // Kayıt / kod doğrulama / yeniden gönder / e-posta düzeltme tek uçuşta: çift
  // tık ikinci istek atıp başarının yanına "zaten hesap var" hatası koymaz
  // (arayüz testi FX-00 O-116).
  const lock = useSubmitLock();
  const submitForm = () => lock.run(doSubmitForm);
  const doSubmitForm = async () => {
    setError(null);
    setAccountExists(false);
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
      setError(null);
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
      const exists = axios.isAxiosError(err) && err.response?.status === 409;
      setAccountExists(exists);
      // 409'da tam cümle istemcinin kataloğundan: API iletisi noktasız
      // biter ve arkasına eklenen giriş bağlantısıyla tek cümle gibi
      // okunuyordu ("…already exists Log in; …", webA-02 yeniden doğrulama).
      setError(exists ? t("accountExists") : extractErrorMessage(err, t("failed")));
    }
  };

  const submitCode = () => lock.run(doSubmitCode);
  const doSubmitCode = async () => {
    setError(null);
    try {
      const res = await verify.mutateAsync({ email: form.email.trim(), code });
      // Güvenlik: e-posta zaten doğrulanmışsa token DÖNMEZ → normal girişe yönlendir.
      if ("alreadyVerified" in res) {
        closeDraft();
        toast.info(t("alreadyVerified"));
        router.replace(loginHref);
        return;
      }
      justVerified.current = true;
      closeDraft();
      rememberSignupIntent(intent, redirect);
      setAuth({ user: res.user, company: res.company });
      router.replace("/company");
    } catch (err) {
      setError(extractErrorMessage(err, tc("codeVerifyFailed")));
      // Düğme istek sürerken pasifleşip odağı <body>'ye düşürür; hata sonrası
      // odak kod alanına döner — giriş sayfasıyla aynı (resignup-4).
      codeInput.current?.focus();
    }
  };

  const handleResend = () => lock.run(doResend);
  const doResend = async () => {
    if (cooldown > 0 || resend.isPending) return;
    setError(null);
    try {
      // "Gönderildi" yalnız kod GERÇEKTEN çıktıysa (arayüz testi 2026-10
      // code-auth-3): saatlik tavanda ya da gönderim hatasında API
      // `sent: false` döner; başarı toast'ı ve 60 sn bekleme YOK.
      const outcome = resendEmailCodeOutcome(await resend.mutateAsync(form.email.trim()));
      if (outcome === "sent") {
        setCooldown(60);
        toast.success(tc("newCodeSent"));
      } else {
        setError(outcome === "capped" ? t("codeCapped") : tc("codeSendFailed"));
      }
    } catch (err) {
      setError(extractErrorMessage(err, tc("codeSendFailed")));
    }
  };

  // E-posta düzeltme formu: şifre bellekteyse (kayıt bu sayfa yüklemesinde
  // yapıldı) sorulmaz; geri yüklenen kod adımında sorulur.
  const needsPassword = !form.password;
  const newEmailValue = newEmail ?? "";
  const newEmailError = !changeTried
    ? null
    : !isPlausibleEmail(newEmailValue)
      ? t("emailInvalid")
      : newEmailValue.trim().toLowerCase() === form.email.trim().toLowerCase()
        ? t("newEmailSame")
        : null;
  const changePasswordError = changeTried && needsPassword && !changePassword ? t("passwordRequired") : null;
  const changeValid =
    isPlausibleEmail(newEmailValue) &&
    newEmailValue.trim().toLowerCase() !== form.email.trim().toLowerCase() &&
    (!needsPassword || changePassword.length > 0);

  const submitNewEmail = () => lock.run(doSubmitNewEmail);
  const doSubmitNewEmail = async () => {
    if (newEmail == null || changeEmail.isPending) return;
    setError(null);
    try {
      const password = form.password || changePassword;
      const res = await changeEmail.mutateAsync({
        email: form.email.trim(),
        password,
        newEmail: newEmail.trim(),
      });
      // Şifre doğrulandı → bellekte tutulur (yalnız bellekte; ikinci bir
      // düzeltmede yeniden sorulmaz).
      setForm((f) => ({ ...f, email: res.email, password: f.password || password }));
      setNewEmail(null);
      setChangePassword("");
      setChangeTried(false);
      setCode("");
      setCodeError(null);
      if (res.emailSent === false) {
        setCooldown(0);
        setError(t("codeNotSent"));
      } else {
        setCooldown(60);
        toast.success(t("codeSent"));
      }
    } catch (err) {
      setError(extractErrorMessage(err, t("changeEmailFailed")));
      // Odak <body>'de kalmaz (resignup-4): şifre soruluyorsa şifre alanına
      // (ret çoğunlukla yanlış şifredir), sorulmuyorsa yeni adres alanına.
      (needsPassword ? changePasswordInput : newEmailInput).current?.focus();
    }
  };

  const loginFooter = (
    <>
      {tc("haveAccount")}{" "}
      <Link href={loginHref} className="font-semibold text-zinc-900 hover:underline">
        {tc("login")}
      </Link>
    </>
  );

  if (waiting) {
    return (
      <AuthShell title={t("title")} subtitle={t("subtitle")} footer={loginFooter}>
        <SessionCheck />
      </AuthShell>
    );
  }

  if (step === "verify" && newEmail != null) {
    return (
      <AuthShell title={t("changeEmailTitle")} subtitle={t("changeEmailSubtitle")} footer={null} hideLanguageSwitcher>
        <form
          ref={changeForm.ref}
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!changeValid) {
              setChangeTried(true);
              changeForm.focusFirstInvalid();
              return;
            }
            void submitNewEmail();
          }}
        >
          <Field>
            <Label>{t("newEmail")}</Label>
            <Input
              ref={newEmailInput}
              type="email"
              autoComplete="email"
              autoFocus
              invalid={!!newEmailError}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            {newEmailError ? <ErrorMessage>{newEmailError}</ErrorMessage> : null}
          </Field>
          {needsPassword ? (
            <Field>
              <Label>{tc("password")}</Label>
              <Description className="text-xs/5! sm:text-xs/5!">{t("changeEmailPasswordHint")}</Description>
              <PasswordInput
                ref={changePasswordInput}
                autoComplete="current-password"
                maxLength={PASSWORD_MAX_LENGTH}
                invalid={!!changePasswordError}
                value={changePassword}
                onChange={(e) => setChangePassword(e.target.value)}
              />
              {changePasswordError ? <ErrorMessage>{changePasswordError}</ErrorMessage> : null}
            </Field>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={changeEmail.isPending || lock.locked}>
            {changeEmail.isPending ? tc("sending") : t("sendToNewEmail")}
          </Button>
          <button
            type="button"
            onClick={() => {
              setNewEmail(null);
              setChangePassword("");
              setChangeTried(false);
              setError(null);
            }}
            className={`${SECONDARY_LINK} text-xs`}
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
        hideLanguageSwitcher
      >
        {/* `<form>`: Enter kodu gönderir (arayüz testi D-090). */}
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== OTP_LENGTH) {
              setCodeError(t("codeLength"));
              codeInput.current?.focus();
              return;
            }
            void submitCode();
          }}
        >
          <Field>
            <Label>{tc("code")}</Label>
            <Input
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              // Adım açılınca odak kod alanında (arayüz testi 2026-10 login-8).
              autoFocus
              placeholder={tc("codePlaceholder")}
              invalid={!!codeError}
              value={code}
              onChange={(e) => {
                setCode(normalizeOtpCode(e.target.value));
                setCodeError(null);
              }}
            />
            {codeError ? <ErrorMessage>{codeError}</ErrorMessage> : null}
          </Field>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={verify.isPending || lock.locked}>
            {verify.isPending ? tc("verifying") : tc("verifyAndLogin")}
          </Button>
          <button
            type="button"
            disabled={resend.isPending || cooldown > 0 || lock.locked}
            onClick={() => void handleResend()}
            className={`${SECONDARY_LINK} text-sm ${resendDisabledClass(cooldown > 0)}`}
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
              setChangeTried(false);
              setError(null);
            }}
            className={`${SECONDARY_LINK} text-xs`}
          >
            {t("changeEmail")}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={loginFooter}
    >
      {/* `noValidate`: tarayıcının kendi baloncuğu (tarayıcı dilinde, sayfa
          dilinde değil) çıkmaz; hatalar alanın altında, sayfa dilinde. */}
      <form
        ref={signupForm.ref}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!formValid) {
            setSubmitted(true);
            signupForm.focusFirstInvalid();
            return;
          }
          void submitForm();
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>{tc("firstName")}</Label>
            <Input
              autoComplete="given-name"
              value={form.firstName}
              maxLength={80}
              invalid={!!fieldError.firstName}
              onChange={(e) => set("firstName")(e.target.value)}
            />
            {fieldError.firstName ? <ErrorMessage>{fieldError.firstName}</ErrorMessage> : null}
          </Field>
          <Field>
            <Label>{tc("lastName")}</Label>
            <Input
              autoComplete="family-name"
              value={form.lastName}
              maxLength={80}
              invalid={!!fieldError.lastName}
              onChange={(e) => set("lastName")(e.target.value)}
            />
            {fieldError.lastName ? <ErrorMessage>{fieldError.lastName}</ErrorMessage> : null}
          </Field>
        </div>

        <Field>
          <Label>{t("corporateEmail")}</Label>
          <Input
            type="email"
            autoComplete="email"
            maxLength={254}
            invalid={!!fieldError.email}
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
          />
          {fieldError.email ? <ErrorMessage>{fieldError.email}</ErrorMessage> : null}
        </Field>

        <Field>
          <Label>{tc("phone")}</Label>
          {/* Kök `<Field>`in DOĞRUDAN çocuğu: etiket boşluğu (data-slot) ve
              etiket/hata bağı Headless'tan gelir (arayüz testi 2026-10
              code-auth-11, signup-enru-9). "Alandan çıkış" `onBlur` prop'uyla. */}
          <PhoneInput
            value={form.phone}
            onChange={set("phone")}
            onCountryMissingChange={setPhoneNeedsCountry}
            onBlur={() => setPhoneTouched(true)}
            invalid={!!fieldError.phone}
          />
          {fieldError.phone ? <ErrorMessage>{fieldError.phone}</ErrorMessage> : null}
        </Field>

        <Field>
          <Label>{tc("password")}</Label>
          <PasswordInput
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            invalid={!!fieldError.password}
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
          />
          {fieldError.password ? <ErrorMessage>{fieldError.password}</ErrorMessage> : null}
        </Field>
        {form.password || submitted ? (
          <PasswordStrength password={form.password} live />
        ) : null}

        <Field>
          <Label>{t("passwordRepeat")}</Label>
          {/* İki alanda AYNI tavan: tekrar alanı sınırsızken 72 karakterden uzun
              şifre ilkinde kesiliyor, ikincisinde kesilmiyor ve "eşleşmiyor"
              diyordu (arayüz testi 2026-10 code-auth-12, signup-tr-19). */}
          <PasswordInput
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            invalid={!!fieldError.passwordConfirm}
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm")(e.target.value)}
          />
          {fieldError.passwordConfirm ? <ErrorMessage>{fieldError.passwordConfirm}</ErrorMessage> : null}
        </Field>

        <ConsentRows
          consents={consents}
          onChange={setConsents}
          showProviders
          requiredError={fieldError.consents}
        />

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            {accountExists ? (
              <>
                {" "}
                <Link href={loginHref} className="font-semibold underline underline-offset-2">
                  {t("accountExistsLogin")}
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={signup.isPending || lock.locked}>
          {signup.isPending || lock.locked ? t("creating") : t("submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
