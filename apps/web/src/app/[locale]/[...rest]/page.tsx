import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { notFoundMetadata } from "@/lib/seo/not-found-meta";

// Bilinmeyen yol public sayılmaz → middleware nonce'lı CSP verir; statik 404
// HTML'i nonce taşımazdı. Dinamik render ile tutarlı (public-routes.test).
export const dynamic = "force-dynamic";

/**
 * Bilinmeyen yolun metası = 404 metası (arayüz testi D-081, yeniden doğrulama).
 * Sunucu HTML'i not-found sınırının metasını yazar, ama tarayıcı hidrasyondan
 * sonra metayı bu sayfanın RSC ağacından kurar; burada meta olmasa başlık kök
 * yedeğe ("Rothern") ve robots `index, follow`a dönüyordu.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  return notFoundMetadata(await localeFromParams(params));
}

/**
 * Bilinmeyen yol → dil düzeninin İÇİNDEKİ `not-found` (üst çubuk/dil doğru).
 * `[locale]` segmenti ilk parçayı yakaladığı için bu olmadan bilinmeyen adres
 * düzensiz bir 404'e düşerdi (next-intl kalıbı).
 */
export default function CatchAllPage() {
  notFound();
}
