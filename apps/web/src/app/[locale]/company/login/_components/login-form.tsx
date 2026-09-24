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
import { setCompanyRemember } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Lock, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

function makeSchema(msg: { emailInvalid: string; passwordRequired: string }) {
  return z.object({
    email: z.string().email(msg.emailInvalid),
    password: z.string().min(1, msg.passwordRequired),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export function CompanyLoginForm({ nextPath }: { nextPath: string }) {
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
  // E-posta doğrulanmamışsa: login yerine doğrulama modu.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  // "Oturumumu açık bırak" — varsayılan işaretli; işaretliyken kayan 30g
  // oturum (aktifken hiç düşmez), işaretsiz → tarayıcı kapanınca biter.
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    // 2FA açıkken kod zorunlu: 6 haneli TOTP veya kurtarma kodu (XXXX-XXXX).
    if (twoFactor && code.trim().length < 6) {
      setFormError(t("codeRequired"));
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
        setVerifyEmail(data.email.trim());
        setNeedsVerify(true);
        setFormError(null);
        try {
          await resend.mutateAsync(data.email.trim());
          setCooldown(60);
        } catch {
          // Kod gönderimi başarısızsa kullanıcı butonla yeniden deneyebilir.
        }
        return;
      }
      setFormError(extractErrorMessage(err, t("failed")));
    }
  });

  const submitVerify = async () => {
    setFormError(null);
    try {
      const res = await verify.mutateAsync({ email: verifyEmail, code: verifyCode });
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
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resend.isPending) return;
    setFormError(null);
    try {
      await resend.mutateAsync(verifyEmail);
      setCooldown(60);
      toast.success(tc("newCodeSent"));
    } catch (err) {
      setFormError(extractErrorMessage(err, tc("codeSendFailed")));
    }
  };

  if (needsVerify) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          {tc.rich("codeSentTo", { email: verifyEmail, b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <Field>
          <Label>{tc("code")}</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={tc("codePlaceholder")}
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        {formError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        <Button
          className="w-full"
          disabled={verifyCode.length !== 6 || verify.isPending}
          onClick={submitVerify}
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
              : tc("resend")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field>
        <Label>{tc("email")}</Label>
        <Input type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register("email")} />
        {errors.email ? (
          <ErrorMessage className="mt-1">{errors.email.message}</ErrorMessage>
        ) : null}
      </Field>

      <Field>
        <Label>{tc("password")}</Label>
        <PasswordInput autoComplete="current-password" invalid={!!errors.password} {...register("password")} />
        {errors.password ? (
          <ErrorMessage className="mt-1">{errors.password.message}</ErrorMessage>
        ) : null}
      </Field>

      {twoFactor ? (
        <Field>
          <Label>{tc("code")}</Label>
          <Input
            autoComplete="one-time-code"
            autoFocus
            maxLength={12}
            placeholder={t("codePlaceholder2fa")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {twoFactorMethod === "email" ? t("hintEmail") : t("hintAuthenticator")}
          </p>
        </Field>
      ) : null}

      <div className="-mt-1 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          {t("remember")}
        </label>
        <Link href="/company/sifremi-unuttum" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
          {t("forgot")}
        </Link>
      </div>

      {formError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? t("submitting") : t("submit")}
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
