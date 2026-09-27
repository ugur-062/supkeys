/**
 * Doğrulama red gerekçesi — KOD + isteğe bağlı NOT (2026-09-27).
 *
 * `@rothern/shared` `helpers/verification-reason.ts` AYNASI (admin paylaşılan
 * pakete bağlı değil; yerel kopya deseni). Saklanan biçim "[KOD] not": kod
 * firmanın Doğrulama sayfasında firmanın dilinde katalogdan çevrilir, not
 * olduğu gibi gösterilir. Kod listesi API'nin kabul ettiğiyle AYNI olmalı —
 * listeye kod eklenirse shared, web kataloğu ve bu dosya birlikte değişir.
 */

export type VerificationReasonCode =
  | "UNREADABLE"
  | "WRONG_DOCUMENT"
  | "OUTDATED"
  | "MISMATCH"
  | "MISSING_SIGNATURE"
  | "INCOMPLETE"
  | "COUNTRY_CHANGED";

/** Admin'in seçebildiği kodlar (Türkçe etiket). COUNTRY_CHANGED sistemin yazdığıdır. */
export const REJECT_REASONS: { code: VerificationReasonCode; label: string }[] = [
  { code: "UNREADABLE", label: "Belge okunmuyor / bulanık" },
  { code: "WRONG_DOCUMENT", label: "Yanlış belge yüklenmiş" },
  { code: "OUTDATED", label: "Belge güncel değil (son 3 ay)" },
  { code: "MISMATCH", label: "Bilgiler firma bilgileriyle uyuşmuyor" },
  { code: "MISSING_SIGNATURE", label: "İmza / kaşe eksik" },
  { code: "INCOMPLETE", label: "Belge eksik / sayfa eksik" },
];

const LABELS: Record<VerificationReasonCode, string> = {
  ...(Object.fromEntries(REJECT_REASONS.map((r) => [r.code, r.label])) as Record<
    Exclude<VerificationReasonCode, "COUNTRY_CHANGED">,
    string
  >),
  COUNTRY_CHANGED: "Ülke değişti — yeni zorunlu belgeler eksik",
};

/** Kodsuz ESKİ kayıtlar: eski hazır şablon cümleleri (küçük harf, tam eşleşme). */
const LEGACY: Record<string, VerificationReasonCode> = {
  "belge okunmuyor / bulanık": "UNREADABLE",
  "yanlış belge yüklenmiş": "WRONG_DOCUMENT",
  "belge güncel değil (son 3 ay içinde alınmış olmalı)": "OUTDATED",
  "belgedeki bilgiler firma bilgileriyle uyuşmuyor": "MISMATCH",
  "imza / kaşe yüklenmedi": "MISSING_SIGNATURE",
  "ülke değişikliği sonrası yeni zorunlu belgeler eksik — lütfen tamamlayıp yeniden gönderin.":
    "COUNTRY_CHANGED",
};

export function parseReason(raw: string | null | undefined): {
  code: VerificationReasonCode | null;
  note: string;
} {
  const text = raw?.trim() ?? "";
  if (!text) return { code: null, note: "" };
  const m = /^\[([A-Z_]+)\]\s*([\s\S]*)$/.exec(text);
  if (m && m[1]! in LABELS) {
    return { code: m[1] as VerificationReasonCode, note: m[2]!.trim() };
  }
  const legacy = LEGACY[text.toLocaleLowerCase("tr-TR")];
  if (legacy) return { code: legacy, note: "" };
  return { code: null, note: text };
}

/** Saklanan gerekçenin okunur Türkçe hâli ("Etiket — not"). */
export function reasonText(raw: string | null | undefined): string {
  const { code, note } = parseReason(raw);
  return [code ? LABELS[code] : null, note || null].filter(Boolean).join(" — ");
}

/** Red kararı geçerli mi: kod VEYA ≥3 karakterlik not (API kuralıyla aynı). */
export function hasRejectReason(d: { reasonCode?: string | null; reason?: string | null }): boolean {
  return Boolean(d.reasonCode) || (d.reason?.trim().length ?? 0) >= 3;
}
