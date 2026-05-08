/**
 * Polish-3 — TR doğrulama ve iş mantığı hata sözlüğü.
 *
 * Backend DTO'larında doğrudan istenen mesaj kullanılabilir; ortak
 * mesajlar ValidationPipe exceptionFactory ile İngilizce class-validator
 * default mesajlarından çevrilir.
 */

export const VALIDATION_MESSAGES = {
  REQUIRED: "Bu alan zorunlu",
  EMAIL_INVALID: "Geçerli bir e-posta giriniz",
  PASSWORD_MIN: "Şifre en az 8 karakter olmalı",
  PHONE_INVALID: "Geçerli bir telefon numarası giriniz",
  TAX_NUMBER_INVALID: "Vergi numarası 10 veya 11 haneli olmalı",
  URL_INVALID: "Geçerli bir bağlantı (URL) giriniz",
  UUID_INVALID: "Geçerli bir kimlik (ID) giriniz",
  DATE_INVALID: "Geçerli bir tarih giriniz",
  DATE_FUTURE: "Tarih gelecekte olmalı",
  STRING_MIN: (n: number) => `En az ${n} karakter olmalı`,
  STRING_MAX: (n: number) => `En fazla ${n} karakter olabilir`,
  NUMBER_MIN: (n: number) => `${n} veya daha büyük olmalı`,
  NUMBER_MAX: (n: number) => `${n} veya daha küçük olmalı`,
  ARRAY_MIN: (n: number) => `En az ${n} öğe seçilmeli`,
  ARRAY_MAX: (n: number) => `En fazla ${n} öğe seçilebilir`,
  IN_VALUES: "Geçersiz seçim",
} as const;

export const BUSINESS_MESSAGES = {
  NOT_FOUND: "Kayıt bulunamadı",
  FORBIDDEN: "Bu işlem için yetkiniz yok",
  CONFLICT: "Bu kayıt zaten mevcut",
  INVALID_STATUS: "Mevcut durumda bu işlem yapılamaz",
  EXPIRED: "Süresi dolmuş",
  ALREADY_USED: "Bu kayıt daha önce kullanılmış",
  RATE_LIMIT: "Çok hızlı işlem yaptınız, lütfen biraz bekleyin",
} as const;

/**
 * class-validator default İngilizce mesajlarını TR'ye çevirir.
 * Pattern recognition ile en yaygın olanları kapsar; bilinmeyenler
 * orijinal mesaj olarak döner.
 */
export function translateValidatorMessage(msg: string): string {
  // "must be a valid email"
  if (/must be (?:a|an) (?:valid )?email/i.test(msg)) {
    return VALIDATION_MESSAGES.EMAIL_INVALID;
  }
  // "should not be empty"
  if (/should not be empty/i.test(msg) || /must not be empty/i.test(msg)) {
    return VALIDATION_MESSAGES.REQUIRED;
  }
  // "must be a string"
  if (/must be a string/i.test(msg)) {
    return "Geçerli bir metin olmalı";
  }
  // "must be a number"
  if (/must be a number/i.test(msg)) {
    return "Geçerli bir sayı olmalı";
  }
  // "must be a boolean"
  if (/must be a boolean/i.test(msg)) {
    return "Geçerli bir değer olmalı";
  }
  // "must be an array"
  if (/must be an array/i.test(msg)) {
    return "Geçerli bir liste olmalı";
  }
  // "must be a Date instance" / "must be a valid ISO 8601 date string"
  if (/must be (?:a Date|a valid ISO|a valid date)/i.test(msg)) {
    return VALIDATION_MESSAGES.DATE_INVALID;
  }
  // "must be a UUID"
  if (/must be a UUID/i.test(msg)) {
    return VALIDATION_MESSAGES.UUID_INVALID;
  }
  // "must be a URL address"
  if (/must be a URL/i.test(msg)) {
    return VALIDATION_MESSAGES.URL_INVALID;
  }
  // "must be longer than or equal to N characters"
  const longerMatch = msg.match(/longer than or equal to (\d+) characters/i);
  if (longerMatch) return VALIDATION_MESSAGES.STRING_MIN(Number(longerMatch[1]));
  // "must be shorter than or equal to N characters"
  const shorterMatch = msg.match(/shorter than or equal to (\d+) characters/i);
  if (shorterMatch)
    return VALIDATION_MESSAGES.STRING_MAX(Number(shorterMatch[1]));
  // "must not be less than N"
  const notLessMatch = msg.match(/must not be less than (\d+)/i);
  if (notLessMatch) return VALIDATION_MESSAGES.NUMBER_MIN(Number(notLessMatch[1]));
  // "must not be greater than N"
  const notGreaterMatch = msg.match(/must not be greater than (\d+)/i);
  if (notGreaterMatch)
    return VALIDATION_MESSAGES.NUMBER_MAX(Number(notGreaterMatch[1]));
  // "must contain at least N elements"
  const arrMinMatch = msg.match(/must contain at least (\d+) elements/i);
  if (arrMinMatch) return VALIDATION_MESSAGES.ARRAY_MIN(Number(arrMinMatch[1]));
  // "must contain no more than N elements"
  const arrMaxMatch = msg.match(/must contain no more than (\d+) elements/i);
  if (arrMaxMatch) return VALIDATION_MESSAGES.ARRAY_MAX(Number(arrMaxMatch[1]));
  // "must be one of the following values: a, b, c"
  if (/must be one of the following values/i.test(msg)) {
    return VALIDATION_MESSAGES.IN_VALUES;
  }
  // "property X should not exist" — whitelist hatası
  if (/property .+ should not exist/i.test(msg)) {
    return "Bu alan kabul edilmiyor";
  }
  // Bilinmeyen — DTO'dan gelen TR mesaj olabilir, dokunma
  return msg;
}
