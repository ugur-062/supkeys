import { getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { OnboardingClient } from "./_components/onboarding-client";

/* Başlıkta "— Rothern" YOK: kök şablon (`%s · Rothern`) markayı ekliyor. */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.auth.onboarding" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function Page() {
  return <OnboardingClient />;
}
