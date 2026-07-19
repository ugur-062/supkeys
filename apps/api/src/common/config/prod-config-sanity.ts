import type { ConfigService } from "@nestjs/config";

/**
 * Prod cookie/CSRF config sağlık kontrolü — saf fonksiyon (test edilebilir) +
 * boot assert (fail-closed).
 *
 * CANLI BUG (kök neden): custom domain'lere (www/api/admin.rothern.com) +
 * COOKIE_SAMESITE=lax'a geçilince COOKIE_DOMAIN set edilmediğinde, cookie'ler
 * api.rothern.com'a HOST-ONLY yazılır. Auth çalışır (tarayıcı httpOnly cookie'yi
 * api'ye otomatik gönderir) AMA frontend JS (www) `rk_csrf`'i `document.cookie`
 * ile OKUYAMAZ (host-only, farklı host) → `X-CSRF-Token` header'ı boş gider →
 * CsrfGuard fail-closed 403 "CSRF doğrulaması başarısız". Yani mutasyonlar
 * (buy-now/teklif/okundu) kırılır, giriş çalışmaya devam eder.
 *
 * Bu guard o yapısal-kırık kombinasyonu BOOT'ta yakalar → sessiz runtime 403
 * yerine gürültülü deploy hatası (fix: COOKIE_DOMAIN=.rothern.com).
 *
 * KAPSAM: yalnız cookie/CSRF tutarlılığı. WEB_URL ayrıca `assertProdWebUrl` ile,
 * JWT_SECRET `checkJwtSecret` ile guard'lı (main.ts). Yalnız NODE_ENV=production
 * aktif — dev/test inert (full-suite yeşil kalır).
 *
 * DEPLOY NOTU: bu guard'la birlikte prod ENV'i COOKIE_SAMESITE=lax +
 * COOKIE_DOMAIN=.rothern.com OLMALI. 'none' (veya COOKIE_SAMESITE unset →
 * efektif 'none') artık prod'da REDDEDİLİR: none modu double-submit'i devre dışı
 * bırakıp CSRF'i CORS'a devrederdi (zayıf duruş) — same-site custom-domain
 * kurulumunda kasıtlı olarak yasaklandı.
 */

export type ProdCookieRejection = "samesite_without_domain" | "samesite_none";

/**
 * Prod cookie config reddedilmeli mi? Kabul → `null`, aksi halde sebep.
 * Efektif SameSite kuralı cookie.ts / csrf.guard.ts ile AYNI: açıkça
 * COOKIE_SAMESITE, yoksa prod → "none".
 */
export function checkProdCookieConfig(env: {
  nodeEnv: string | undefined;
  cookieSameSite: string | undefined;
  cookieDomain: string | undefined;
}): ProdCookieRejection | null {
  if (env.nodeEnv !== "production") return null; // yalnız prod

  const effectiveSameSite =
    (env.cookieSameSite ?? "").trim().toLowerCase() || "none";
  const domain = (env.cookieDomain ?? "").trim();

  // 'none' (veya unset→none): same-site double-submit yapılamaz → yasak.
  if (effectiveSameSite === "none") return "samesite_none";

  // lax/strict (same-site duruş): cookie'lerin cross-subdomain paylaşılması +
  // frontend JS'in rk_csrf'i okuyabilmesi için ORTAK ana domain ŞART.
  if (domain === "") return "samesite_without_domain";

  return null;
}

/** Boot guard (fail-closed): reddedilirse THROW → deploy fail. */
export function assertProdConfigSanity(config: ConfigService): void {
  const rejection = checkProdCookieConfig({
    nodeEnv: config.get<string>("NODE_ENV"),
    cookieSameSite: config.get<string>("COOKIE_SAMESITE"),
    cookieDomain: config.get<string>("COOKIE_DOMAIN"),
  });

  if (rejection === "samesite_without_domain") {
    throw new Error(
      "COOKIE_SAMESITE=lax (same-site kurulum) COOKIE_DOMAIN'siz olamaz — " +
        "cookie'ler host-only kalır, frontend (www) rk_csrf'i okuyamaz → " +
        "X-CSRF-Token boş → tüm mutasyonlar 403. Çözüm: COOKIE_DOMAIN=.rothern.com set et.",
    );
  }
  if (rejection === "samesite_none") {
    throw new Error(
      "Prod'da COOKIE_SAMESITE açıkça 'lax' + COOKIE_DOMAIN=.rothern.com olmalı — " +
        "'none' (veya unset→none) CSRF double-submit'i devre dışı bırakır (zayıf duruş). " +
        "Same-site custom-domain kurulumunda 'none' yasak.",
    );
  }
}
