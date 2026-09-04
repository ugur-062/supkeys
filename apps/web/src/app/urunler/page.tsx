import { PublicLayout } from "@/components/marketplace/public-layout";
import {
  ProductIndex,
  type ProductSearchParams,
} from "@/components/marketplace/product-index";
import { MARKETPLACE_LABELS } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveSiteUrl } from "@/lib/site-url";
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
export const metadata: Metadata = {
  title: `${MARKETPLACE_LABELS.products} — firmaların ürün vitrini`,
  description:
    "Türkiye'deki tedarikçi firmaların ürün kataloğu: teknik özellikler, minimum sipariş ve fiyat bilgisiyle. Ürünü bulun, firmasına doğrudan ulaşın.",
  alternates: { canonical: `${resolveSiteUrl()}/urunler` },
  openGraph: {
    title: `${MARKETPLACE_LABELS.products} — Rothern`,
    url: `${resolveSiteUrl()}/urunler`,
    type: "website",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ProductSearchParams>;
}) {
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  return (
    <PublicLayout>
        <ProductIndex
          title={MARKETPLACE_LABELS.products}
          lead="Firmaların vitrinlerine koyduğu ürünler. Kategori, şehir ve faaliyet tipine göre süzün; fiyat ve bilgi talebi için ücretsiz hesap açın."
          searchParams={sp}
        />
    </PublicLayout>
  );
}
