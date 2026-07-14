/**
 * JWT_SECRET kabul-edilebilirlik kontrolü — saf fonksiyon (test edilebilir).
 *
 * Security audit O-3 / #6 — ESKİ mantık bir *denylist* idi: yalnız
 * `NODE_ENV === "production"` iken placeholder/kısa secret reddedilirdi.
 * `NODE_ENV` unset ya da yanlış yazılmışsa (`"prod"`, `"staging"`) kontrol
 * tamamen atlanıp herkesin tahmin edebileceği placeholder secret'la JWT
 * imzalanabiliyordu (token forge riski).
 *
 * YENİ mantık *allowlist* / fail-closed: placeholder yalnız AÇIKÇA
 * `development` veya `test` ortamında kabul edilir. Env unset/tanınmayan →
 * production gibi sıkı davran.
 */

/** Deploy'a sızması halinde JWT'yi forge edilebilir kılan bilinen placeholder'lar. */
export const JWT_SECRET_PLACEHOLDERS: readonly string[] = [
  "change_me_in_production_minimum_32_chars_long",
  "ci_test_jwt_secret_only_for_pipeline_runs_64_chars_minimum_xxxxx",
  "test_jwt_secret",
];

export type JwtSecretRejection = "placeholder" | "too_short";

/**
 * Verilen ortamda `secret` reddedilmeli mi? Kabul edilebilirse `null`, aksi
 * halde reddetme sebebi döner (çağıran uygun hata mesajını seçer).
 *
 * @param nodeEnv `process.env.NODE_ENV` (unset olabilir → `undefined`)
 */
export function checkJwtSecret(
  nodeEnv: string | undefined,
  secret: string,
): JwtSecretRejection | null {
  // Allowlist: yalnız açıkça development/test placeholder'a izin verir.
  // Unset / "prod" / "staging" / tanınmayan → sıkı (fail-closed).
  const isDevOrTest = nodeEnv === "development" || nodeEnv === "test";
  if (isDevOrTest) return null;

  const lower = secret.toLowerCase();
  if (
    JWT_SECRET_PLACEHOLDERS.includes(secret) ||
    lower.startsWith("change_me") ||
    lower.startsWith("ci_test") ||
    lower.startsWith("test_")
  ) {
    return "placeholder";
  }
  if (secret.length < 32) return "too_short";
  return null;
}

/** Boolean kısayol — `checkJwtSecret(...) === null`. */
export function isSecretAcceptable(
  nodeEnv: string | undefined,
  secret: string,
): boolean {
  return checkJwtSecret(nodeEnv, secret) === null;
}
