import { getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Sayfa istemci bileşeni (`useSearchParams`) → metası düzende (2026-09-22):
   jetonlu tek tık işlem sayfası, aramaya girmez. */
/* Public rota DEĞİL → nonce'lı CSP için dinamik render (bkz. `@/lib/public-routes`). */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.optOut" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default function DavetKapatLayout({ children }: { children: ReactNode }) {
  return children;
}
