import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import {
  ProductIndex,
  type ProductSearchParams,
} from "@/components/marketplace/product-index";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { dizinBos } from "@/lib/seo/empty-index-guard";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * ÜRÜN DİZİNİ — firmaların vitrinlerindeki ürünlerin tamamı.
 *
 * ISR 300 sn: ilan listesinden uzun, çünkü ürün kalıcı içeriktir (ilan gibi
 * dakikada bir açılıp kapanmaz). Kategori kırılımları AYRI rotada ve statik —
 * long-tail oradan gelir, bu sayfa girişi ve aramayı taşır.
 */
export const revalidate = 300;

/**
 * Kanonik: süzgeçli varyantlar `/urunler`e işaret eder (ince içerik
 * yığını indekslenmesin). Kategori yol sayfaları kendi kanoniklerini taşır.
 */
/**
 * Meta İSTEK ANINDA üretilir: dizin BOŞSA `noindex` basılır (ince içerik /
 * yumuşak 404 koruması, `lib/seo/empty-index-guard.ts`). İlk kayıt girince
 * kural kendiliğinden kalkar.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const bos = await dizinBos("urunler");
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  const tl = await getTranslations({ locale, namespace: "web.marketplace.labels" });
  return buildMetadata({
    locale,
    title: t("productsMetaTitle", { label: tl("products") }),
    description: t("productsMetaDesc"),
    path: MARKETPLACE_ROUTES.products,
    noindex: bos,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<ProductSearchParams>;
}) {
  setRequestLocale(await localeFromParams(params));
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  const t = await getTranslations("web.marketplace.pages");
  const tl = await getTranslations("web.marketplace.labels");
  return (
    <PublicLayout className={MARKET_GROUND}>
        <ProductIndex
          title={tl("products")}
          lead={t("productsLead")}
          searchParams={sp}
        />
    </PublicLayout>
  );
}
