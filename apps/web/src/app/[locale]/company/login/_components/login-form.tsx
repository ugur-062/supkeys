"use client";

import { Button } from "@/components/catalyst/button";
import { PasswordInput } from "@/components/ui/password-input";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import {
  useCompanyLogin,
  useResendEmailCode,
  useSetCompanyAuth,
  useVerifyEmail,
} from "@/hooks/use-company-auth";
import { isPlausibleEmail } from "@/lib/company-auth/email";
import { resendEmailCodeOutcome } from "@/lib/company-auth/resend-code";
import { setCompanyRemember } from "@/lib/company-auth/store";
import { normalizeOtpCode, OTP_LENGTH } from "@/lib/company-auth/otp-code";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Lock, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

/**
 * E-posta ön denetimi kayıtla AYNI gevşek kural (`isPlausibleEmail`; arayüz
 * testi 2026-10 code-auth-7): zod `.email()` kaydın ve API'nin kabul ettiği
 * adresleri (`satis&pazarlama@firma.com`, ASCII dışı alan adı) reddediyor,
 * böyle bir hesap formdan giriş yapamıyordu. Adres kırpılarak gönderilir.
 */
function makeSchema(msg: { emailInvalid: string; passwordRequired: string }) {
  return z.object({
    email: z.string().trim().refine(isPlausibleEmail, msg.emailInvalid),
    password: z.string().min(1, msg.passwordRequired),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

/** Formun gösterdiği adım — sayfa kabuğu kod adımlarında dil seçiciyi gizler. */
export type CompanyLoginStep = "login" | "twoFactor" | "verify";

/**
 * İkincil bağlantılar (yeniden gönder, başka e-posta): metin en az zinc-500
 * (12 px zinc-400 beyazda 2,6:1'di — arayüz testi 2026-10 login-9) ve dokunma
 * alanı en az 32 px yüksek (login-10). `-mt-2` / `last:-mb-2`: dolgu dokunma
 * alanını büyütür, form uzamaz.
 */
const SECONDARY_LINK =
  "-mt-2 w-full py-2 text-center text-zinc-500 last:-mb-2 hover:text-zinc-800 disabled:opacity-50";

export function CompanyLoginForm({
  nextPath,
  onStepChange,
}: {
  nextPath: string;
  onStepChange?: (step: CompanyLoginStep) => void;
}) {
  const t = useTranslations("web.auth.login");
  const tc = useTranslations("web.auth.common");
  const schema = useMemo(
    () => makeSchema({ emailInvalid: t("emailInvalid"), passwordRequired: t("passwordRequired") }),
    [t],
  );
  const router = useRouter();
  const login = useCompanyLogin();
  const verify = useVerifyEmail();
  const resend = useResendEmailCode();
  const setAuth = useSetCompanyAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<
    "email" | "authenticator"
  >("authenticator");
  const [code, setCode] = useState("");
  // Kod alanının kendi hatası (boş/eksik kod): alanın altında, `aria-invalid`
  // + `aria-describedby` ile (arayüz testi 2026-10 code-auth-9).
  const [codeError, setCodeError] = useState<string | null>(null);
  // E-posta doğrulanmamışsa: login yerine doğrulama modu.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyCodeError, setVerifyCodeError] = useState<string | null>(null);
  // Doğrulama moduna geçerken kod gönderimi DÜŞTÜ (hata, hız sınırı, saatlik
  // tavan): ekran "gönderilen kodu girin" demez (arayüz testi 2026-10 login-7).
  const [codeUnsent, setCodeUnsent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // "Oturumumu açık bırak" — varsayılan işaretli; işaretliyken kayan 30g
  // oturum (aktifken hiç düşmez), işaretsiz → tarayıcı kapanınca biter.
  const [remember, setRemember] = useState(true);
  const twoFactorInput = useRef<HTMLInputElement>(null);
  const verifyInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Kod adımlarında dil seçici çizilmez (arayüz testi 2026-10 login-8): adım
  // bileşen durumundadır; dil değişimi sayfayı yeni ön ekle yeniden bağlar,
  // kullanıcı boş giriş formuna döner ve bir kod e-postası daha gider.
  const step: CompanyLoginStep = needsVerify ? "verify" : twoFactor ? "twoFactor" : "login";
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const {
    register,
    handleSubmit,
    getValues,
    setFocus,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  /** Kod gönderimi sonucu → ekran. "Gönderildi" yalnız kod gerçekten çıktıysa. */
  const sendVerifyCode = async (email: string, { announce }: { announce: boolean }) => {
    try {
      const outcome = resendEmailCodeOutcome(await resend.mutateAsync(email));
      if (outcome === "sent") {
        setCodeUnsent(false);
        setCooldown(60);
        if (announce) toast.success(tc("newCodeSent"));
        return;
      }
      // Saatlik tavanda son gönderilen kod hâlâ geçerli olabilir → "gönderilen
      // kodu girin" metni kalır; gönderim hatasında kalmaz.
      setCodeUnsent(outcome === "failed");
      setFormError(outcome === "capped" ? t("codeCapped") : t("codeNotSent"));
    } catch (err) {
      // 429 (dakikada 3) ve ağ hatası: sunucunun metni bekleme süresini taşır.
      setCodeUnsent(true);
      setFormError(extractErrorMessage(err, tc("codeSendFailed")));
    }
  };

  // Giriş / kod doğrulama / yeniden gönder tek uçuşta: çift tık ikinci istek
  // atmaz (arayüz testi FX-00 D-064; tek kullanımlık kod sunucuda da atomik).
  const lock = useSubmitLock();
  const onSubmit = handleSubmit((data) => lock.run(() => doLogin(data)));
  const doLogin = async (data: FormData) => {
    setFormError(null);
    // 2FA açıkken kod zorunlu: 6 haneli TOTP veya kurtarma kodu (XXXX-XXXX).
    if (twoFactor && code.trim().length < 6) {
      setCodeError(t("codeRequired"));
      twoFactorInput.current?.focus();
      return;
    }
    try {
      const res = await login.mutateAsync({
        ...data,
        code: twoFactor ? code.trim() : undefined,
        rememberMe: remember,
      });
      if ("twoFactorRequired" in res) {
        setTwoFactor(true);
        // E-posta yönteminde backend kodu zaten gönderdi; UI mesajını uyarlar.
        setTwoFactorMethod(res.method ?? "authenticator");
        // Kod az önce gitti — "yeniden gönder" 60 sn sonra açılır.
        if (res.method === "email") setCooldown(60);
        return;
      }
      // Cookie (API) + istemci snapshot'ı aynı "hatırla" tercihine göre.
      setCompanyRemember(remember);
      setAuth({ user: res.user, company: res.company });
      router.replace(nextPath);
    } catch (err) {
      // E-posta doğrulanmamışsa doğrulama moduna geç + kod gönder.
      // Yapısal koda bakılır (mesaj metni DEĞİL) — gevşek metin eşleşmesi
      // "CSRF doğrulaması başarısız" gibi alakasız 403'lerde sahte doğrulama
      // akışı tetiklemişti. (Türkçe mesaj metnine bakan eski API yedeği
      // i18n Faz 2'de kaldırıldı: API `code` alanını her zaman gönderiyor ve
      // mesaj artık istek dilinde — metin eşleşmesi EN/RU'da tutmazdı.)
      if (
        axios.isAxiosError(err) &&
        err.response?.status === 403 &&
        (err.response.data as { code?: string })?.code === "EMAIL_NOT_VERIFIED"
      ) {
        setVerifyEmail(data.email);
        setNeedsVerify(true);
        setFormError(null);
        setVerifyCodeError(null);
        // Gönderim düşerse ekran bunu SÖYLER (eskiden hata yutuluyor, "gönderilen
        // kodu girin" yazıyordu); kullanıcı düğmeyle yeniden dener.
        await sendVerifyCode(data.email, { announce: false });
        return;
      }
      setFormError(extractErrorMessage(err, t("failed")));
      // Düğme istek sürerken pasifleşip odağı <body>'ye düşürür; hata sonrası
      // odak bilinçli taşınır (arayüz testi 2026-10 login-15): 2FA adımında kod
      // alanına, değilse şifre alanına — kullanıcı yeniden yazmaya hazır.
      if (twoFactor) twoFactorInput.current?.focus();
      else setFocus("password");
    }
  };

  const submitVerify = () => lock.run(doSubmitVerify);
  const doSubmitVerify = async () => {
    setFormError(null);
    try {
      // "Oturumumu açık bırak" tercihi doğrulama yolunda da API'ye gider —
      // yoksa çerez varsayılan kalıcı basılıyordu (derin denetim MU-23).
      const res = await verify.mutateAsync({
        email: verifyEmail,
        code: verifyCode,
        rememberMe: remember,
      });
      // Güvenlik: zaten doğrulanmışsa token dönmez → giriş formuna geri dön.
      if ("alreadyVerified" in res) {
        toast.info(tc("alreadyVerifiedLogin"));
        setNeedsVerify(false);
        setVerifyCode("");
        return;
      }
      setCompanyRemember(remember);
      setAuth({ user: res.user, company: res.company });
      router.replace(nextPath);
    } catch (err) {
      setFormError(extractErrorMessage(err, tc("codeVerifyFailed")));
      verifyInput.current?.focus();
    }
  };

  const handleResend = () => lock.run(doResend);
  const doResend = async () => {
    if (cooldown > 0 || resend.isPending) return;
    setFormError(null);
    await sendVerifyCode(verifyEmail, { announce: true });
  };

  // E-posta 2FA kodunu YENİDEN gönder (arayüz testi D-346): kodsuz giriş
  // isteği sunucuda yeni kod üretip gönderir — ayrı uç yok, aynı kapı (hız
  // sınırı + şifre kontrolü) geçerli.
  const resendTwoFactor = () => lock.run(doResendTwoFactor);
  const doResendTwoFactor = async () => {
    if (cooldown > 0) return;
    setFormError(null);
    try {
      const values = getValues();
      const res = await login.mutateAsync({
        ...values,
        email: values.email.trim(),
        code: undefined,
        rememberMe: remember,
      });
      if ("twoFactorRequired" in res) {
        setCooldown(60);
        toast.success(tc("newCodeSent"));
      }
    } catch (err) {
      setFormError(extractErrorMessage(err, tc("codeSendFailed")));
    }
  };

  if (needsVerify) {
    return (
      // `<form>`: Enter kodu gönderir (arayüz testi D-090).
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (verifyCode.length !== OTP_LENGTH) {
            setVerifyCodeError(t("codeLength"));
            verifyInput.current?.focus();
            return;
          }
          void submitVerify();
        }}
      >
        <p className="text-sm text-zinc-600">
          {codeUnsent
            ? t.rich("codeEnterFor", { email: verifyEmail, b: (chunks) => <strong>{chunks}</strong> })
            : tc.rich("codeSentTo", { email: verifyEmail, b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <Field>
          <Label>{tc("code")}</Label>
          <Input
            ref={verifyInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            // Adım açılınca odak kod alanında (arayüz testi 2026-10 login-8).
            autoFocus
            placeholder={tc("codePlaceholder")}
            invalid={!!verifyCodeError}
            value={verifyCode}
            onChange={(e) => {
              setVerifyCode(normalizeOtpCode(e.target.value));
              setVerifyCodeError(null);
            }}
          />
          {verifyCodeError ? <ErrorMessage>{verifyCodeError}</ErrorMessage> : null}
        </Field>
        {formError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={verify.isPending || lock.locked}>
          {verify.isPending ? tc("verifying") : tc("verifyAndLogin")}
        </Button>
        <button
          type="button"
          disabled={resend.isPending || cooldown > 0 || lock.locked}
          onClick={() => void handleResend()}
          className={`${SECONDARY_LINK} text-sm`}
        >
          {cooldown > 0
            ? tc("resendIn", { s: cooldown })
            : resend.isPending
              ? tc("sending")
              : tc("resend")}
        </button>
        {/* Geri dönüş (D-346): yanlış adresle girildiyse doğrulama modunda
            sıkışılmaz — giriş formuna, başka e-postaya. */}
        <button
          type="button"
          onClick={() => {
            setNeedsVerify(false);
            setVerifyCode("");
            setVerifyCodeError(null);
            setCodeUnsent(false);
            setFormError(null);
          }}
          className={`${SECONDARY_LINK} text-xs`}
        >
          {t("useAnotherEmail")}
        </button>
      </form>
    );
  }

  return (
    // `noValidate`: tarayıcının kendi baloncuğu (tarayıcı dilinde, sayfa dilinde
    // değil) çıkmaz; "abc" gibi adres de sayfa dilindeki alan hatasını alır
    // (arayüz testi 2026-10 login-6). react-hook-form ilk hatalı alanı odaklar.
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <Field>
        <Label>{tc("email")}</Label>
        <Input type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register("email")} />
        {errors.email ? <ErrorMessage>{errors.email.message}</ErrorMessage> : null}
      </Field>

      <Field>
        <Label>{tc("password")}</Label>
        <PasswordInput autoComplete="current-password" invalid={!!errors.password} {...register("password")} />
        {errors.password ? <ErrorMessage>{errors.password.message}</ErrorMessage> : null}
      </Field>

      {twoFactor ? (
        <Field>
          <Label>{tc("code")}</Label>
          <Input
            ref={twoFactorInput}
            autoComplete="one-time-code"
            autoFocus
            maxLength={12}
            placeholder={t("codePlaceholder2fa")}
            invalid={!!codeError}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(null);
            }}
          />
          {codeError ? <ErrorMessage>{codeError}</ErrorMessage> : null}
          <p className="mt-1 text-xs text-zinc-500">
            {twoFactorMethod === "email" ? t("hintEmail") : t("hintAuthenticator")}
          </p>
          {twoFactorMethod === "email" ? (
            <button
              type="button"
              disabled={login.isPending || cooldown > 0 || lock.locked}
              onClick={() => void resendTwoFactor()}
              className="-mt-1 -mb-2 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
            >
              {cooldown > 0 ? tc("resendIn", { s: cooldown }) : tc("resend")}
            </button>
          ) : null}
        </Field>
      ) : null}

      {/* Dokunma alanları en az 32 px yüksek (arayüz testi 2026-10 login-10):
          etiket ve bağlantı dolguyla 16 → 32 px olur; `-mt-3 mb-3` satırın
          eski yerini korur (form uzamaz). */}
      <div className="-mt-3 mb-3 flex items-center justify-between gap-3">
        <label className="flex min-h-8 cursor-pointer items-center gap-2 py-2 text-xs font-medium text-zinc-600 select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          {t("remember")}
        </label>
        <Link
          href="/company/sifremi-unuttum"
          className="inline-flex min-h-8 items-center py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          {t("forgot")}
        </Link>
      </div>

      {formError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={login.isPending || lock.locked}>
        {login.isPending || lock.locked ? t("submitting") : t("submit")}
      </Button>

      <div className="flex items-center justify-center gap-3 pt-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden="true" /> {t("ssl")}
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {t("twoFa")}
        </span>
      </div>
    </form>
  );
}
