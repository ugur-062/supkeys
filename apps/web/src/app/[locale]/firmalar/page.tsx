import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { CompanyIndex } from "@/components/marketplace/company-index";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { dizinBos } from "@/lib/seo/empty-index-guard";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * FİRMA DİZİNİ — HERKESE AÇIK (görünürlük v2). Gövde `CompanyIndex`
 * bileşeninde: şehir açılış sayfası (`/firmalar/sehir/<il>`) aynı listeyi
 * kullanıyor.
 */
export const revalidate = 300;

/**
 * Meta İSTEK ANINDA üretilir: dizin BOŞSA `noindex` basılır (ince içerik /
 * yumuşak 404 koruması, `lib/seo/empty-index-guard.ts`). İlk kayıt girince
 * kural kendiliğinden kalkar.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const bos = await dizinBos("firmalar");
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  const tl = await getTranslations({ locale, namespace: "web.marketplace.labels" });
  return buildMetadata({
    locale,
    title: t("companiesMetaTitle", { label: tl("companies") }),
    // Vitrin + üyelik kapısı (2026-09-22): sayı ve "süzün" vaadi yok.
    description: t("companiesMetaDesc"),
    path: MARKETPLACE_ROUTES.companies,
    noindex: bos,
  });
}

export default async function Page({
  params, searchParams }: {
  params: LocaleParams; searchParams: Promise<SearchParamsLike> }) {
  setRequestLocale(await localeFromParams(params));
  if (!MARKETPLACE_LIVE) notFound();
  return <CompanyIndex searchParams={await searchParams} />;
}
