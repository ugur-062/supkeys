import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, pickLocale } from "@rothern/i18n";
import type { Metadata } from "next";
import { AcceptInviteClient } from "./_components/accept-invite-client";

type Params = Promise<{ locale: string; token: string }>;

/* Başlıkta "— Rothern" YOK: kök şablon (`%s · Rothern`) markayı ekliyor. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: pickLocale(locale) ?? DEFAULT_LOCALE, namespace: "web.auth.invite" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function DavetPage({ params }: { params: Params }) {
  const { token } = await params;
  return <AcceptInviteClient token={token} />;
}
