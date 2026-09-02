import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import MarketingPage from "./marketing-page";

/**
 * Eski anasayfa — pazarlama anlatısı, ürün önizlemeleri, paketler ve SSS.
 * Kök `/` pazar yerine dönünce (envanter önce) buraya taşındı; içerik AYNEN
 * korundu, yalnız adresi değişti. Header'daki `#ozellikler`/`#fiyatlar`/`#sss`
 * çapaları da bu sayfaya bakar.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Nasıl çalışır — kapalı zarf teklif, sipariş ve paketler",
  description:
    "Rothern nasıl çalışır: satın alma talebi açma, kapalı zarf teklif toplama, pazarlık, kazandırma ve sipariş takibi. Paketler ve sık sorulan sorular.",
  alternates: { canonical: `${resolveSiteUrl()}/nasil-calisir` },
};

export default function Page() {
  return <MarketingPage />;
}
