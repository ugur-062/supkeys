/**
 * Şikayet / engelleme gerekçesi sınırları — API DTO'larıyla BİREBİR aynı
 * (company-complaints.controller.ts FileComplaintDto, company-blocks
 * .controller.ts BlockDto). Diyalog bu sınırları aşan metne izin verirse API
 * 400 döner ve kayıt oluşmaz.
 */
export const COMPLAINT_REASON_MAX = 120;
export const COMPLAINT_DETAIL_MAX = 2000;
export const BLOCK_REASON_MAX = 500;

/**
 * Şikayet diyaloğu TEK metin topluyor; API ise kısa `reason` (başlık, en çok
 * 120) + uzun `detail` (en çok 2000) bekliyor. Metin kısaysa yalnız `reason`
 * gider; uzunsa `reason` metnin kısaltılmış başı ("…" ile), `detail` metnin
 * TAMAMI olur — admin iki alanı da görür, hiçbir şey kaybolmaz.
 */
export function complaintPayload(text: string): {
  reason: string;
  detail?: string;
} {
  const full = text.trim();
  // Kod noktası bazında say: class-validator MaxLength vekil çiftlerini tek
  // karakter sayar; UTF-16 slice bir emojiyi ortadan bölebilirdi.
  const chars = Array.from(full);
  if (chars.length <= COMPLAINT_REASON_MAX) return { reason: full };
  const head = chars.slice(0, COMPLAINT_REASON_MAX - 1).join("").trimEnd();
  return {
    reason: `${head}…`,
    detail: chars.slice(0, COMPLAINT_DETAIL_MAX).join(""),
  };
}
