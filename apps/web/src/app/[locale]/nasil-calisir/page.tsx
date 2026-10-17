import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import MarketingPage from "./marketing-page";

/**
 * Eski anasayfa — pazarlama anlatısı, ürün önizlemeleri ve SSS.
 * Kök `/` pazar yerine dönünce (envanter önce) buraya taşındı. Header'daki
 * `#ozellikler`/`#sss` çapaları da bu sayfaya bakar. Fiyat bölümü ücretsiz
 * dönemde KALDIRILDI (2026-10-07); eski çapası anasayfaya döner.
 */
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.howItWorks" });
  return buildMetadata({
    locale,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/nasil-calisir",
  });
}

export default async function Page({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  return <MarketingPage />;
}
