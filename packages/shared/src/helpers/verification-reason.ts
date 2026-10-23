/**
 * FİRMA DOĞRULAMASI RED GEREKÇESİ — KOD + İSTEĞE BAĞLI NOT (2026-09-27).
 *
 * Eskiden admin gerekçeyi Türkçe serbest metin olarak yazıyordu (hazır
 * şablonlar da Türkçe cümleydi: "Belge okunmuyor / bulanık") ve metin firmanın
 * Doğrulama sayfasında OLDUĞU GİBİ basılıyordu → Rus/Alman firma kendi
 * belgesinin neden reddedildiğini okuyamıyordu.
 *
 * Şema değişikliği YOK: `Company.doc*Reason`, `companyRejectionReason` ve
 * `CompanyKycRevision.reason` dize alanları kodlu biçimi taşır —
 * `"[UNREADABLE] isteğe bağlı not"`. Kod okuyucunun dilinde katalogdan
 * çevrilir, not (admin yazdıysa) olduğu gibi gösterilir. Kodsuz ESKİ metinler
 * (bu tarihten önceki kararlar) aynen gösterilir.
 *
 * Yazan tek yol `formatVerificationReason`, okuyan tek yol
 * `parseVerificationReason` — API (admin kararı) ve web (Doğrulama sayfası)
 * aynı iki fonksiyonu kullanır.
 */

import { LEGACY_REASON_CODES } from "../data/legacy-verification-reasons";

export const VERIFICATION_REASON_CODES = [
  "UNREADABLE",
  "WRONG_DOCUMENT",
  "OUTDATED",
  "MISMATCH",
  "MISSING_SIGNATURE",
  "INCOMPLETE",
  "COUNTRY_CHANGED",
] as const;

export type VerificationReasonCode = (typeof VERIFICATION_REASON_CODES)[number];

export function isVerificationReasonCode(
  value: unknown,
): value is VerificationReasonCode {
  return (
    typeof value === "string" &&
    (VERIFICATION_REASON_CODES as readonly string[]).includes(value)
  );
}

/** Kod + not → saklanan dize. İkisi de boşsa `null`. */
export function formatVerificationReason(
  code: VerificationReasonCode | null | undefined,
  note?: string | null,
): string | null {
  const n = note?.trim() || "";
  if (code && isVerificationReasonCode(code)) return n ? `[${code}] ${n}` : `[${code}]`;
  return n || null;
}

export interface ParsedVerificationReason {
  code: VerificationReasonCode | null;
  note: string | null;
}


/** Saklanan dize → kod + not. Tanınmayan kodlu önek serbest metin sayılır. */
export function parseVerificationReason(
  raw: string | null | undefined,
): ParsedVerificationReason {
  const text = raw?.trim() ?? "";
  if (!text) return { code: null, note: null };
  // Kodlu biçimden ÖNCEKİ hazır cümleler (veri: `data/legacy-verification-reasons.ts`).
  // Own-key lookup only ("constructor", "toString" are free text, not codes).
  if (Object.hasOwn(LEGACY_REASON_CODES, text)) {
    return { code: LEGACY_REASON_CODES[text] as VerificationReasonCode, note: null };
  }
  const m = /^\[([A-Z_]+)\]\s*([\s\S]*)$/.exec(text);
  if (m && isVerificationReasonCode(m[1])) {
    return { code: m[1], note: m[2]!.trim() || null };
  }
  return { code: null, note: text };
}
