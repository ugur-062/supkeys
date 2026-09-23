import { notFound } from "next/navigation";

// Bilinmeyen yol public sayılmaz → middleware nonce'lı CSP verir; statik 404
// HTML'i nonce taşımazdı. Dinamik render ile tutarlı (public-routes.test).
export const dynamic = "force-dynamic";

/**
 * Bilinmeyen yol → dil düzeninin İÇİNDEKİ `not-found` (üst çubuk/dil doğru).
 * `[locale]` segmenti ilk parçayı yakaladığı için bu olmadan bilinmeyen adres
 * düzensiz bir 404'e düşerdi (next-intl kalıbı).
 */
export default function CatchAllPage() {
  notFound();
}
