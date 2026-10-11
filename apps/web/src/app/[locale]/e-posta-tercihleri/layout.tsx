import { getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Jetonlu çıkış sayfası (2026-09-27): aramaya girmez; sayfa istemci bileşeni
   (`useSearchParams`) olduğu için metası düzende. */
/* Public rota DEĞİL → nonce'lı CSP için dinamik render (bkz. `@/lib/public-routes`). */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.emailPrefs" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default function EmailPrefsLayout({ children }: { children: ReactNode }) {
  return children;
}
