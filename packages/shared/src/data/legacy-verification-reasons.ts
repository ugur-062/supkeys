/**
 * KYC red gerekçesinin kodlu biçimden (2026-09-27) ÖNCEKİ hazır cümleleri —
 * admin şablonları + ülke değişikliği sistem metni → kod. VERİDİR (eski
 * kayıtları tanımak için), kullanıcı metni değil: önceden reddedilmiş yabancı
 * firma gerekçesini Türkçe değil kendi dilinde görsün. Cümle TAM eşleşmeli
 * (admin düzenlediyse metin not olarak kalır). Okuyan tek yer
 * `helpers/verification-reason.ts` `parseVerificationReason`.
 */
export const LEGACY_REASON_CODES: Readonly<Record<string, string>> = {
  "Belge okunmuyor / bulanık": "UNREADABLE",
  "Yanlış belge yüklenmiş": "WRONG_DOCUMENT",
  "Belge güncel değil (son 3 ay içinde alınmış olmalı)": "OUTDATED",
  "Belgedeki bilgiler firma bilgileriyle uyuşmuyor": "MISMATCH",
  "İmza / kaşe Yüklenmedi": "MISSING_SIGNATURE",
  "Ülke değişikliği sonrası yeni zorunlu belgeler eksik — lütfen tamamlayıp yeniden gönderin.": "COUNTRY_CHANGED",
};
