import { randomUUID } from "crypto";

/**
 * Faz AI-1 — geçici AI belge yüklemelerinin R2 anahtar alanı (PRIVATE bucket;
 * classifyKey fail-closed zaten private sayar). 24 saat TTL — AiScheduler
 * cleanupExtractFiles cron'u siler.
 */
export const AI_EXTRACT_KEY_PREFIX = "ai-extract/";

/** Anahtardaki dosya adi tavani (uzanti dahil). */
const SAFE_NAME_MAX = 80;

export function buildAiExtractKey(
  companyId: string,
  originalFilename: string,
): string {
  const safe = safeFileName(originalFilename) || "file";
  return `${AI_EXTRACT_KEY_PREFIX}${companyId}/${randomUUID()}-${safe}`;
}

/**
 * Dosya adini anahtar alfabesine indirger ve tavana kirpar; kirpma GOVDEDEN
 * yapilir, son uzanti korunur (derin denetim S016): CSV'yi file-type tanimaz,
 * yonlendirici yalniz anahtarin `.csv` ile bitmesine bakar — eskiden 80+
 * karakterlik CSV adi uzantisini kaybedip "desteklenmeyen tur" ile reddediliyordu.
 */
function safeFileName(originalFilename: string): string {
  const safe = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (safe.length <= SAFE_NAME_MAX) return safe;
  const ext = /\.[a-zA-Z0-9]{1,10}$/.exec(safe)?.[0] ?? "";
  return safe.slice(0, SAFE_NAME_MAX - ext.length) + ext;
}

/** IDOR koruması: anahtar yalnız BU firmanın klasörüne işaret edebilir. */
export function isOwnAiExtractKey(key: string, companyId: string): boolean {
  return key.startsWith(`${AI_EXTRACT_KEY_PREFIX}${companyId}/`);
}
