import type { ConfigService } from "@nestjs/config";
import { CANONICAL_EMAIL_DOMAIN, expectedSenderDomain } from "./email-sender";

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
 * KAPSAM: cookie/CSRF tutarlılığı + RLS bypass + canlıda açık kalmış staging
 * bayrakları (aşağıda `checkStagingOnlyEnv`). WEB_URL ayrıca `assertProdWebUrl` ile,
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

/**
 * RLS açıkken bypass bağlantısı ŞART (2026-09-22 yayın öncesi taraması):
 * `PrismaBypassService` env yoksa sessizce ana `DATABASE_URL`e düşer; o adres
 * kısıtlı `rothern_app` rolü olduğunda sağlık, giriş, cron ve admin okumaları
 * boş/hatalı döner ve boot'ta hiçbir uyarı çıkmaz. Saf, test edilebilir.
 */
export function checkRlsBypassConfig(env: {
  rlsEnabled: string | undefined;
  bypassUrl: string | undefined;
}): "rls_without_bypass" | null {
  if ((env.rlsEnabled ?? "").trim() !== "true") return null;
  if ((env.bypassUrl ?? "").trim() === "") return "rls_without_bypass";
  return null;
}

/**
 * YALNIZ STAGING/ÖNİZLEME İÇİN OLAN BAYRAKLAR CANLIDA AÇIK KALAMAZ (canlı öncesi
 * sağlamlaştırma, 2026-10-07).
 *
 * - `CORS_ALLOW_VERCEL=true`: HER `*.vercel.app` kökenine kimlik bilgili (çerezli)
 *   erişim açar — canlıda CSRF / veri sızıntısı. Yalnız önizleme/demo içindir.
 * - `EMAIL_ALLOWLIST` dolu: listede olmayan HİÇBİR alıcıya e-posta gitmez —
 *   canlıda doğrulama kodu, davet, sipariş bildirimi sessizce kesilir (gönderim
 *   "başarılı" görünür, günlük temizdir). Yalnız staging içindir.
 *
 * İkisi de bugüne kadar yalnız kontrol listesinde "gözle bak" maddesiydi; artık
 * AÇILIŞ KAPISI.
 *
 * "CANLI" NASIL TANINIR: `NODE_ENV=production` staging'de de geçerlidir
 * (Render'da o da production kipinde koşar) ve staging'de `EMAIL_ALLOWLIST`
 * BİLEREK doludur. Bu yüzden kapı yalnız sitenin alan adı canlı alan adı
 * (`rothern.com`, `WEB_URL`den — gönderen adresi kapısıyla AYNI türetme) iken
 * çalışır. Staging (`staging.supkeys.com`) yeni bir ortam değişkeni GEREKTİRMEDEN
 * açılmaya devam eder; doğru kurulmuş canlı (ikisi de boş/`false`) etkilenmez.
 *
 * AÇIK İSTİSNA: `ALLOW_STAGING_ONLY_ENV=true` — canlı alan adında koşan ama
 * canlı OLMAYAN bir ortam (ör. `*.rothern.com` altında bir prova) için bilinçli
 * kaçış. Canlı serviste TANIMLANMAZ.
 */
export const STAGING_ONLY_ENV_OVERRIDE = "ALLOW_STAGING_ONLY_ENV";

export type StagingOnlyEnvRejection = "cors_allow_vercel" | "email_allowlist";

/** Bu ortam canlı mı? `NODE_ENV=production` + site alan adı canlı alan adı. */
export function isLiveEnvironment(env: {
  nodeEnv: string | undefined;
  webUrl: string | undefined;
}): boolean {
  if (env.nodeEnv !== "production") return false;
  return expectedSenderDomain(env.webUrl) === CANONICAL_EMAIL_DOMAIN;
}

/**
 * Canlıda açık kalmış staging bayrakları (boş dizi → sorun yok). Saf.
 *
 * `CORS_ALLOW_VERCEL`: jokeri kod yalnız tam `"true"` ile açar; burada boşluk /
 * büyük harf farkı da ("TRUE", " true ") reddedilir — niyet açıktır ve yarım
 * yazım sessizce "kapalı" sayılmasın. `false` / `0` / boş / tanımsız geçer.
 * `EMAIL_ALLOWLIST`: `parseEmailAllowlist` ile aynı eşik — boşluk dışında
 * herhangi bir karakter kapıyı etkinleştirir (yalnız ayraç `,` dahil: o hâlde
 * hiçbir e-posta gitmez).
 */
export function checkStagingOnlyEnv(env: {
  nodeEnv: string | undefined;
  webUrl: string | undefined;
  corsAllowVercel: string | undefined;
  emailAllowlist: string | undefined;
  override: string | undefined;
}): StagingOnlyEnvRejection[] {
  if (!isLiveEnvironment(env)) return [];
  if ((env.override ?? "").trim().toLowerCase() === "true") return [];
  const out: StagingOnlyEnvRejection[] = [];
  if ((env.corsAllowVercel ?? "").trim().toLowerCase() === "true") out.push("cors_allow_vercel");
  if ((env.emailAllowlist ?? "").trim() !== "") out.push("email_allowlist");
  return out;
}

/** Boot guard (fail-closed): reddedilirse THROW → deploy fail. */
export function assertProdConfigSanity(config: ConfigService): void {
  const stagingOnly = checkStagingOnlyEnv({
    nodeEnv: config.get<string>("NODE_ENV"),
    webUrl: config.get<string>("WEB_URL"),
    corsAllowVercel: config.get<string>("CORS_ALLOW_VERCEL"),
    emailAllowlist: config.get<string>("EMAIL_ALLOWLIST"),
    override: config.get<string>(STAGING_ONLY_ENV_OVERRIDE),
  });
  if (stagingOnly.length > 0) {
    const parts: string[] = [];
    if (stagingOnly.includes("cors_allow_vercel")) {
      parts.push(
        "CORS_ALLOW_VERCEL=true canlıda olamaz — her *.vercel.app kökenine çerezli erişim açar " +
          "(CSRF / veri sızıntısı). Çözüm: değişkeni silin ya da false yapın.",
      );
    }
    if (stagingOnly.includes("email_allowlist")) {
      parts.push(
        "EMAIL_ALLOWLIST canlıda dolu olamaz — listede olmayan hiçbir müşteriye e-posta gitmez " +
          "(doğrulama kodu, davet, sipariş bildirimi sessizce kesilir). Çözüm: değişkeni silin.",
      );
    }
    throw new Error(
      `${parts.join(" ")} (Kapı yalnız WEB_URL alan adı ${CANONICAL_EMAIL_DOMAIN} iken çalışır; ` +
        `canlı olmayan bir ortamda bilinçli istisna: ${STAGING_ONLY_ENV_OVERRIDE}=true.)`,
    );
  }

  if (
    checkRlsBypassConfig({
      rlsEnabled: config.get<string>("RLS_ENABLED"),
      bypassUrl: config.get<string>("DATABASE_URL_BYPASS"),
    }) === "rls_without_bypass"
  ) {
    throw new Error(
      "RLS_ENABLED=true iken DATABASE_URL_BYPASS boş olamaz — bypass istemcisi kısıtlı role " +
        "düşer, çapraz-firma okumalar (sağlık, giriş, cron, admin) sessizce bozulur. " +
        "Çözüm: DATABASE_URL_BYPASS'ı sahip rolün bağlantı adresine ayarla.",
    );
  }

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
