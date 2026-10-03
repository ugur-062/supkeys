import { getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanySignupClient } from "./_components/signup-client";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.auth.signup" });
  return {
    title: t("metaTitle"),
    // Giriş/kayıt ekranı arama sonucunda görünmesin (2026-09-19 inceleme SEO-1).
    robots: { index: false, follow: true },
  };
}

export default function CompanySignupPage() {
  return (
    <Suspense fallback={null}>
      <CompanySignupClient />
    </Suspense>
  );
}
