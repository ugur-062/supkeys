/**
 * V2-SEO — Frontend canonical base URL.
 *
 * `NEXT_PUBLIC_SITE_URL` env'i SSR + client'tan da okunabilir.
 * - Dev'de fallback: http://localhost:3000
 * - Prod'da set edilmeli (örn. https://rothern.com); aksi sitemap/robots
 *   yanlış kanonik URL üretir, Google indexlenmesi bozulur.
 */
export function resolveSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url && url.length > 0) return url.replace(/\/$/, "");
  // FAIL-LOUD, ama tam olarak ÖNEMLİ olduğu anda: pazar yeri yayına açıkken
  // env'siz kalmak `robots.txt`e `Host: http://localhost:3000` ve sitemap'e
  // localhost URL'leri yazar — Google'a canlı sitenin adresi yerine yerel
  // makineyi bildirmek, indekslemeyi sessizce çöpe atar (canlıda bu hâl
  // GERÇEKLEŞTİ). Anahtar kapalıyken fırlatmıyoruz: o zaman robots zaten her
  // şeyi kapatıyor ve dev/preview ortamları çalışmaya devam etmeli.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_MARKETPLACE_LIVE === "true"
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL tanımsız — pazar yeri yayındayken kanonik adres localhost'a düşemez.",
    );
  }
  return "http://localhost:3000";
}
