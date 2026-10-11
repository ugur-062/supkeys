import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Public rota DEĞİL (SEO'ya kapalı, nonce'lı CSP alır) → statik prerender
 * edilirse nonce'suz kalır ve script'leri bloke olur. Bkz. `@/lib/public-routes`.
 */
export const dynamic = "force-dynamic";

type ResetSearchParams = Promise<{ setup?: string | string[] }>;

/**
 * Admin'in açtığı hesabın kurulum bağlantısı `setup=1` taşır (API
 * PasswordResetService.requestAccountSetup): aynı token akışı, ama metin
 * "Şifrenizi sıfırlayın / Hatırladınız mı?" yerine yeni hesaba uygun
 * "Şifrenizi belirleyin" (arayüz testi api2-02 yeniden doğrulama). Yalnız
 * görünüm ipucu. Kimlik akışı metinleri baştan sona "siz" (arayüz testi
 * 2026-10 login-13).
 */
async function isSetup(searchParams: ResetSearchParams): Promise<boolean> {
  const v = (await searchParams).setup;
  return (Array.isArray(v) ? v[0] : v) === "1";
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: ResetSearchParams;
}): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.auth.reset" });
  return {
    title: (await isSetup(searchParams)) ? t("setupMetaTitle") : t("metaTitle"),
    // Jeton taşıyan işlem sayfası — aramaya girmez (2026-09-22).
    robots: { index: false, follow: false },
  };
}

/** Şifre sıfırlama — diğer auth ekranlarıyla aynı kabuk (AuthShell). */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: ResetSearchParams;
}) {
  setRequestLocale(await localeFromParams(params));
  const t = await getTranslations("web.auth.reset");
  const setup = await isSetup(searchParams);
  return (
    <AuthShell
      title={setup ? t("setupTitle") : t("title")}
      subtitle={setup ? t("setupSubtitle") : t("subtitle")}
      footer={
        <>
          {setup ? t("setupHaveAccount") : t("remembered")}{" "}
          <Link
            href="/company/login"
            className="font-semibold text-zinc-900 hover:underline"
          >
            {t("login")}
          </Link>
        </>
      }
    >
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
