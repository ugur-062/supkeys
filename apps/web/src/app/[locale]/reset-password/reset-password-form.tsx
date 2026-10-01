"use client";

import { Button } from "@/components/catalyst/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field, Label } from "@/components/catalyst/fieldset";
import { companyApi } from "@/lib/company-auth/api";
import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_RE } from "@/lib/company-auth/password-rules";
import { extractErrorMessage, extractFieldErrors } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { AlertCircle, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// Politika backend ConfirmPasswordResetDto ile BİREBİR aynı — kullanıcı
// frontend'in kabul ettiği şifreyi backend'de reddedilmiş görmesin.
// Mesajlar katalogdan (`web.auth.password.*`, kayıt formuyla ortak).
function makeSchema(tp: (key: "min" | "max" | "lower" | "upper" | "digit" | "special" | "mismatch") => string) {
  return z
    .object({
      newPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, tp("min"))
        .max(72, tp("max"))
        .regex(/[a-z]/, tp("lower"))
        .regex(/[A-Z]/, tp("upper"))
        .regex(/\d/, tp("digit"))
        .regex(PASSWORD_SPECIAL_RE, tp("special")),
      confirmPassword: z.string(),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: tp("mismatch"),
      path: ["confirmPassword"],
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** Sunucunun ürettiği token 64 hex; DTO 40–80 karakter kabul eder. */
function tokenLooksValid(token: string): boolean {
  return token.length >= 40 && token.length <= 80;
}

export function ResetPasswordForm() {
  const t = useTranslations("web.auth.reset");
  const tp = useTranslations("web.auth.password");
  const schema = useMemo(() => makeSchema(tp), [tp]);
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Bağlantı kullanılamaz (arayüz testi D-085): kesik, kullanılmış ya da
   * süresi dolmuş bağlantıda hata kutusu yerine "geçersiz bağlantı" kartı ve
   * yeni bağlantı isteme yolu. Değer sunucunun nedenidir (boşsa genel metin).
   */
  const [linkError, setLinkError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token || !tokenLooksValid(token) || linkError !== null) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-900">{t("invalidTitle")}</p>
            <p className="mt-1 text-sm text-red-800">{linkError || t("invalidBody")}</p>
            <Link
              href="/company/sifremi-unuttum"
              className="mt-3 inline-block text-sm font-semibold text-zinc-900 underline"
            >
              {t("requestNew")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
        role="status"
      >
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">{t("changedTitle")}</p>
            <p className="mt-1 text-sm text-emerald-800">{t("changedBody")}</p>
            <Button
              className="mt-3"
              onClick={() => router.push("/company/login")}
            >
              {t("loginCta")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    setError(null);
    try {
      await companyApi.post("/auth/password-reset/confirm", {
        token,
        newPassword: values.newPassword,
      });
      toast.success(t("toastChanged"));
      setSubmitted(true);
    } catch (err) {
      // 403 = bağlantı geçersiz/kullanılmış/süresi dolmuş (servis); 400'de
      // `token` alan hatası = bozuk bağlantı. İkisi de bağlantı kartına gider.
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const tokenError = extractFieldErrors(err)?.token;
      if (status === 403 || tokenError) {
        setLinkError(tokenError ?? extractErrorMessage(err, ""));
      } else {
        setError(extractErrorMessage(err, t("errFallback")));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <Field>
        <Label>{t("newPassword")}</Label>
        <PasswordInput
          autoComplete="new-password"
          invalid={!!errors.newPassword}
          placeholder={t("newPasswordPlaceholder")}
          maxLength={72}
          {...register("newPassword")}
        />
        {errors.newPassword ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.newPassword.message}
          </p>
        ) : null}
      </Field>

      <Field>
        <Label>{t("confirmPassword")}</Label>
        <PasswordInput
          autoComplete="new-password"
          invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("changing") : t("change")}
      </Button>
    </form>
  );
}
