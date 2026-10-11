import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { ListingIndex } from "@/components/marketplace/listing-index";
import { ButtonAccentProvider } from "@/components/ui/button-accent";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { dizinBos } from "@/lib/seo/empty-index-guard";
import { canonicalListingListPage } from "@/lib/seo/landing";
import { buildMetadata } from "@/lib/seo/meta";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * ISR: 60 sn. Sayfa süzgeçli varyantlar üretiyor (`?kategori=…`), her varyant
 * kendi önbellek girdisini alır. `force-dynamic` KOYMA — bu rota public
 * listesinde ve nonce'suz CSP alıyor (bkz. lib/public-routes.ts).
 */
export const revalidate = 60;

/**
 * Meta İSTEK ANINDA üretilir: dizin BOŞSA `noindex` basılır (ince içerik /
 * yumuşak 404 koruması, `lib/seo/empty-index-guard.ts`). İlk kayıt girince
 * kural kendiliğinden kalkar.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<SearchParamsLike>;
}): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const bos = await dizinBos("talepler");
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  const tl = await getTranslations({ locale, namespace: "web.marketplace.labels" });
  const page = canonicalListingListPage(await searchParams);
  const tui = await getTranslations({ locale, namespace: "web.shared.ui" });
  return buildMetadata({
    locale,
    title: t("demandsMetaTitle", { label: tl("demands") }),
    description: t("demandsMetaDesc"),
    path: MARKETPLACE_ROUTES.demands,
    // Yalnız `?sayfa=N` taşıyan sayfa kendi kanoniği; süzgeçli varyant tabana.
    page,
    // 2+ sayfa kendi başlık/açıklamasını taşır (arayüz testi D-084).
    pageLabel: tui("pageN", { n: page }),
    noindex: bos,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<SearchParamsLike>;
}) {
  setRequestLocale(await localeFromParams(params));
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  const t = await getTranslations("web.marketplace.pages");
  const tl = await getTranslations("web.marketplace.labels");
  return (
    <PublicLayout className={MARKET_GROUND}>
        {/* Tedarikçi yüzü: "Teklif ver" ve dolgulu düğmeler YEŞİL (2026-09-18, kullanıcı). */}
        <ButtonAccentProvider accent="emerald">
        <ListingIndex
          type="ALIM"
          title={tl("demands")}
          lead={t("demandsLead")}
          searchParams={sp}
        />
        </ButtonAccentProvider>
    </PublicLayout>
  );
}
