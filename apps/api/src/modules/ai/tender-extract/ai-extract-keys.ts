import { randomUUID } from "crypto";

/**
 * Faz AI-1 — geçici AI belge yüklemelerinin R2 anahtar alanı (PRIVATE bucket;
 * classifyKey fail-closed zaten private sayar). 24 saat TTL — AiScheduler
 * cleanupExtractFiles cron'u siler.
 */
export const AI_EXTRACT_KEY_PREFIX = "ai-extract/";

export function buildAiExtractKey(
  companyId: string,
  originalFilename: string,
): string {
  const safe =
    originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
  return `${AI_EXTRACT_KEY_PREFIX}${companyId}/${randomUUID()}-${safe}`;
}

/** IDOR koruması: anahtar yalnız BU firmanın klasörüne işaret edebilir. */
export function isOwnAiExtractKey(key: string, companyId: string): boolean {
  return key.startsWith(`${AI_EXTRACT_KEY_PREFIX}${companyId}/`);
}
