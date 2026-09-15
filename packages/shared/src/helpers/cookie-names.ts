/**
 * ÇEREZ ADLARI — ORTAMA GÖRE ÖN EK, TEK KAYNAK (2026-09-15).
 *
 * SORUN: canlı çerezlerini `.rothern.com` alanına yazar (www JS'in api'nin
 * yazdığı CSRF çerezini okuyabilmesi için şart). Tarayıcı bu çerezleri
 * `staging.rothern.com` ve `api.staging.rothern.com`a da gönderir. Staging AYNI
 * adları kullandığında tarayıcıda iki `rk_csrf` oluşuyordu: web ilkini, API
 * sonuncusunu okuyordu → staging kaydında "CSRF doğrulaması başarısız"
 * (kullanıcı bildirdi). Canlı ve staging veride ayrıydı; çakışan yalnız
 * çerez adlarıydı.
 *
 * ÇÖZÜM: staging `rks_` ön ekini kullanır, canlı ve yerel `rk_` kalır (canlıda
 * kimsenin oturumu düşmez). Ön ek YENİ bir ortam değişkeninden okunmaz —
 * ortamın zaten bilinen alan adından TÜRETİLİR: API `COOKIE_DOMAIN`dan, web ve
 * admin tarayıcıdaki `location.hostname`den. Ayrı bir değişken olsaydı
 * Render/Vercel'de biri unutulduğu gün iki taraf farklı ad kullanır ve
 * staging'deki bütün mutasyonlar 403 olurdu.
 *
 * Kalan (bilinçli): canlı çerezleri staging'e GÖNDERİLMEYE devam eder, yalnız
 * okunmaz. Tam yalıtım staging'i ayrı bir kayıtlı alan adına taşımayı ister.
 *
 * `apps/admin` bu pakete bağlı değil → `apps/admin/src/lib/csrf.ts` aynı kuralın
 * kopyasını taşır; iki taraf aynı tabloyla sınanır (web + admin testleri).
 */

export const STAGING_COOKIE_HOST = "staging.rothern.com";

export type CookieNamePrefix = "rk_" | "rks_";

/** Alan adı ya da host (`.staging.rothern.com`, `admin.staging.rothern.com`) → ön ek. */
export function cookieNamePrefix(hostOrDomain: string | null | undefined): CookieNamePrefix {
  const h = (hostOrDomain ?? "").trim().toLowerCase().replace(/^\./, "");
  return h === STAGING_COOKIE_HOST || h.endsWith(`.${STAGING_COOKIE_HOST}`) ? "rks_" : "rk_";
}

export function cookieNames(prefix: CookieNamePrefix) {
  return {
    companyAuth: `${prefix}company`,
    adminAuth: `${prefix}admin`,
    companyCsrf: `${prefix}csrf`,
    adminCsrf: `${prefix}admin_csrf`,
  } as const;
}
