/**
 * Giriş gerektirmeyen, arama motorlarına açık rotalar — TEK KAYNAK.
 *
 * Bu liste İKİ şeyi birden yönetir ve ikisi AYRILAMAZ:
 *   1. `middleware.ts` → bu rotalara nonce'SUZ statik CSP verilir,
 *   2. render modu     → bu rotalar STATİK/ISR üretilebilir (`force-dynamic` YOK).
 *
 * Neden bağlı: CSP nonce her istekte yeniden üretilir, statik HTML'e gömülemez.
 * Bir rota statik üretilip nonce'lı (strict) CSP ile servis edilirse Next'in
 * kendi bootstrap script'leri `strict-dynamic` altında BLOKLANIR ve sayfa ölür.
 * Tersi de geçerli: nonce'suz CSP alan bir rota dinamik render edilirse kimse
 * ölmez ama CDN önbelleği kazanılmaz — SEO/GEO'nun asıl istediği şey kaçar.
 *
 * KURAL: Bu listeye rota EKLEYEN, o rotanın alt ağacında `force-dynamic`
 * OLMADIĞINDAN emin olmalı. Listeden ÇIKARAN, o rotaya `force-dynamic`
 * EKLEMELİDİR. `public-routes.test.ts` bu değişmezi dosya sistemi üzerinden
 * doğrular — unutulursa test kırılır.
 */

/** Tam eşleşen public yollar (alt yol açmaz). */
const PUBLIC_EXACT = [
  "/",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
] as const;

/**
 * Public rota önekleri — `/onek` ve `/onek/...` eşleşir, `/onekler` EŞLEŞMEZ
 * (segment sınırına saygılı).
 */
export const PUBLIC_ROUTE_PREFIXES = [
  "/firma", // herkese açık firma profili (SEO omurgası)
  "/hakkimizda",
  "/iletisim",
  "/sozlesmeler",
] as const;

/** Public rotaların kök segmentleri — dosya sistemi değişmez testi kullanır. */
export const PUBLIC_TOP_SEGMENTS: readonly string[] = PUBLIC_ROUTE_PREFIXES.map(
  (p) => p.slice(1),
);

export function isPublicRoute(pathname: string): boolean {
  // Sorgu dizesi/hash bu fonksiyona gelmemeli; gelirse de zarar vermesin.
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if ((PUBLIC_EXACT as readonly string[]).includes(path)) return true;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
