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

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.auth.reset" });
  return {
    title: t("metaTitle"),
    // Jeton taşıyan işlem sayfası — aramaya girmez (2026-09-22).
    robots: { index: false, follow: false },
  };
}

/** Şifre sıfırlama — diğer auth ekranlarıyla aynı kabuk (AuthShell). */
export default async function ResetPasswordPage({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  const t = await getTranslations("web.auth.reset");
  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("remembered")}{" "}
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
