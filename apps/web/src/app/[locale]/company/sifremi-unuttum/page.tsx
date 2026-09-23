import { getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { CompanyForgotPasswordClient } from "./_components/forgot-password-client";

/* Başlıkta "— Rothern" YOK: kök şablon (`%s · Rothern`) markayı ekliyor. */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.auth.forgot" });
  return { title: t("metaTitle"), robots: { index: false, follow: true } };
}

export default function CompanyForgotPasswordPage() {
  return <CompanyForgotPasswordClient />;
}
