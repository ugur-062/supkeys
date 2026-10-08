"use client";

import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/catalyst/button";
import { PasswordInput } from "@/components/ui/password-input";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { companyApi } from "@/lib/company-auth/api";
import {
  firstUnmetPasswordRule,
  PASSWORD_ERROR_KEY,
  PASSWORD_MAX_LENGTH,
  usePasswordRules,
} from "@/lib/company-auth/password-rules";
import { extractErrorMessage, extractFieldErrors } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { AlertCircle, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type PasswordMessageKey = "min" | "max" | "lower" | "upper" | "digit" | "special" | "mismatch";

// Politika kayıt ve davet kabulüyle TEK yardımcıdan (`password-rules.ts`;
// backend DTO'larıyla aynı) — kullanıcı frontend'in kabul ettiği şifreyi
// backend'de reddedilmiş görmesin. Kurallar Unicode bilir: Türkçe/Kiril harf
// de harftir, harf "özel karakter" sayılmaz (arayüz testi 2026-10 login-4).
// Mesajlar katalogdan (`web.auth.password.*`, kayıt formuyla ortak).
function makeSchema(tp: (key: PasswordMessageKey) => string) {
  return z
    .object({
      newPassword: z.string().superRefine((value, ctx) => {
        const unmet = firstUnmetPasswordRule(value);
        if (unmet) ctx.addIssue({ code: z.ZodIssueCode.custom, message: tp(PASSWORD_ERROR_KEY[unmet]) });
      }),
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

/**
 * Bağlantı denetimi yanıtı en çok bu kadar beklenir (ms); sonra form açılır —
 * yavaş/uyuyan API kullanıcıyı iskelette bekletmesin.
 */
export const LINK_CHECK_WAIT_MS = 4000;

/**
 * Bağlantının sayfa AÇILIRKEN denetimi (arayüz testi 2026-10 login-16).
 *
 * Kullanılmış ya da yenisiyle değiştirilmiş bağlantı eskiden tam formu
 * gösteriyor, kullanıcı bağlantının ölü olduğunu yeni şifreyi iki kez yazıp
 * gönderdikten SONRA öğreniyordu. Sayfa açılışta `POST
 * /auth/password-reset/check { token }` → `{ valid }` sorar:
 *
 *  - `invalid`: geçersiz bağlantı kartı hemen çizilir.
 *  - `ok`: form.
 *  - `unknown`: ağ hatası, 404 (uç henüz dağıtılmamış), 429, 5xx ya da zaman
 *    aşımı — karar verilemez, FORM açılır (gönderimdeki denetim yine var).
 *
 * Yalnız `valid === false` "geçersiz" sayılır: başka hiçbir yanıt kullanıcıyı
 * çalışan bir bağlantıdan mahrum etmez.
 */
type LinkCheck = "checking" | "ok" | "invalid" | "unknown";
type SettledLinkCheck = Exclude<LinkCheck, "checking">;

function useResetLinkCheck(token: string, enabled: boolean): { state: LinkCheck; reason: string | null } {
  const [result, setResult] = useState<{
    token: string;
    state: SettledLinkCheck;
    reason: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let settled = false;
    const settle = (state: SettledLinkCheck, reason: string | null = null) => {
      if (!alive) return;
      // Zaman aşımından SONRA gelen kesin yanıt yine uygulanır (geçersiz
      // bağlantıda form karta döner); kesin karardan sonra "bilinmiyor" yazılmaz.
      if (settled && state === "unknown") return;
      settled = true;
      setResult({ token, state, reason });
    };
    const timer = setTimeout(() => settle("unknown"), LINK_CHECK_WAIT_MS);
    void (async () => {
      try {
        const res = await companyApi.post<{ valid?: boolean; message?: unknown }>(
          "/auth/password-reset/check",
          { token },
          { skipErrorToast: true },
        );
        const data = res?.data;
        if (data?.valid === false) {
          settle("invalid", typeof data.message === "string" && data.message ? data.message : null);
        } else {
          settle(data?.valid === true ? "ok" : "unknown");
        }
      } catch {
        settle("unknown");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token, enabled]);

  if (!enabled) return { state: "unknown", reason: null };
  if (!result || result.token !== token) return { state: "checking", reason: null };
  return { state: result.state, reason: result.reason };
}

export function ResetPasswordForm() {
  const t = useTranslations("web.auth.reset");
  const tp = useTranslations("web.auth.password");
  const { rules: PW_RULES, strength } = usePasswordRules();
  const schema = useMemo(() => makeSchema(tp), [tp]);
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  /** Hesap kurulum bağlantısı (`setup=1`): "belirle" metinleri — akış aynı. */
  const setup = params.get("setup") === "1";
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Bağlantı kullanılamaz (arayüz testi D-085): kesik, kullanılmış ya da
   * süresi dolmuş bağlantıda hata kutusu yerine "geçersiz bağlantı" kartı ve
   * yeni bağlantı isteme yolu. Değer sunucunun nedenidir (boşsa genel metin).
   */
  const [linkError, setLinkError] = useState<string | null>(null);
  const tokenPlausible = !!token && tokenLooksValid(token);
  const linkCheck = useResetLinkCheck(token, tokenPlausible);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const typed = useWatch({ control, name: "newPassword" }) ?? "";
  const pwScore = PW_RULES.filter((r) => r.test(typed)).length;

  // Başarı ekranı bağlantı denetiminden ÖNCE: şifre değişince jeton tüketilir;
  // geç gelen "geçersiz" yanıtı başarı kartını ezmesin.
  if (submitted) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
        role="status"
      >
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">
              {setup ? t("setupDoneTitle") : t("changedTitle")}
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {setup ? t("setupDoneBody") : t("changedBody")}
            </p>
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

  if (!tokenPlausible || linkError !== null || linkCheck.state === "invalid") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-900">{t("invalidTitle")}</p>
            <p className="mt-1 text-sm text-red-800">{linkError || linkCheck.reason || t("invalidBody")}</p>
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

  if (linkCheck.state === "checking") {
    return (
      <div role="status" aria-busy="true">
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
        <span className="sr-only">{t("checking")}</span>
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
      toast.success(setup ? t("toastSetupDone") : t("toastChanged"));
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
          maxLength={PASSWORD_MAX_LENGTH}
          {...register("newPassword")}
        />
        {errors.newPassword ? <ErrorMessage>{errors.newPassword.message}</ErrorMessage> : null}
      </Field>
      {/* Kurallar görünür KONTROL LİSTESİ — kayıt formuyla aynı bileşen
          (arayüz testi 2026-10 login-3). Eskiden yalnız girdinin yer
          tutucusundaydı: her dilde ve her genişlikte kesiliyor, ilk tuşta da
          kayboluyordu. Yazmadan önce de, yazarken de okunur. */}
      <PasswordStrength password={typed} rules={PW_RULES} score={pwScore} label={strength(pwScore)} live />

      <Field>
        <Label>{t("confirmPassword")}</Label>
        <PasswordInput
          autoComplete="new-password"
          invalid={!!errors.confirmPassword}
          maxLength={PASSWORD_MAX_LENGTH}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? <ErrorMessage>{errors.confirmPassword.message}</ErrorMessage> : null}
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {setup
          ? pending
            ? t("setupSubmitting")
            : t("setupSubmit")
          : pending
            ? t("changing")
            : t("change")}
      </Button>
    </form>
  );
}
