import { useTranslations } from "next-intl";

/**
 * Şifre kuralları + güç etiketi — kayıt, davet kabulü, şifre sıfırlama ve
 * Ayarlar › Şifre'nin ORTAK kaynağı (tek yardımcı; form başına ayrı regex
 * YAZILMAZ). Politika backend DTO'larıyla aynı (sözleşme: api
 * `password-policy-parity.spec`): en az 10 karakter, en çok 72 UTF-8 BAYT,
 * küçük/büyük harf, rakam, özel karakter.
 *
 * Kurallar UNICODE bilir (arayüz testi 2026-10 signup-tr-10, login-4): eski
 * `[a-z]` / `[A-Z]` / `[^a-zA-Z0-9]` üçlüsü "Ç"yi büyük harf saymıyor, "ş"yi
 * (ve on boşluğu) "özel karakter" sayıyordu — "Çiçekler12!" reddediliyor,
 * simgesiz "Sifrem12345ş" kabul ediliyordu. Harf her alfabede harftir
 * (Türkçe, Kiril …); özel karakter harf, rakam ve boşluk DIŞINDAKİ her şeydir.
 */
export type PasswordRuleKey = "len" | "lower" | "upper" | "digit" | "special";

export interface PasswordRule {
  key: PasswordRuleKey;
  label: string;
  test: (p: string) => boolean;
}

/** Kayıt, davet kabulü, şifre değiştirme ve sıfırlama — TEK eşik (API DTO'larıyla aynı). */
export const PASSWORD_MIN_LENGTH = 10;
/**
 * ÜST SINIR 72 UTF-8 BAYT (kimlik sağlayıcı şifreyi orada keser; API
 * `PASSWORD_MAX_BYTES` ile aynı sayı). Karakter değil BAYT sayılır: "ş" ve
 * Kiril harfleri 2, emoji 4 bayttır — 40 Kiril harfli şifre 72 karakteri
 * aşmaz ama 80 bayttır; eskiden form kabul ediyor, sağlayıcı reddediyordu.
 */
export const PASSWORD_MAX_BYTES = 72;
/**
 * Şifre alanlarının `maxLength`i (iki alanda da aynı). Yalnız kaba tavandır:
 * 72 baytı aşmayan şifre 72 karakteri de aşamaz. Asıl denetim
 * `firstUnmetPasswordRule` → "max" (bayt).
 */
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_LOWER_RE = /\p{Ll}/u;
export const PASSWORD_UPPER_RE = /\p{Lu}/u;
export const PASSWORD_DIGIT_RE = /[0-9]/;
export const PASSWORD_SPECIAL_RE = /[^\p{L}\p{N}\s]/u;

const TESTS: ReadonlyArray<Pick<PasswordRule, "key" | "test">> = [
  { key: "len", test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { key: "lower", test: (p) => PASSWORD_LOWER_RE.test(p) },
  { key: "upper", test: (p) => PASSWORD_UPPER_RE.test(p) },
  { key: "digit", test: (p) => PASSWORD_DIGIT_RE.test(p) },
  { key: "special", test: (p) => PASSWORD_SPECIAL_RE.test(p) },
];

/** Şifrenin UTF-8 bayt uzunluğu (sunucu `Buffer.byteLength` ile aynı sayar). */
export function passwordByteLength(p: string): number {
  return new TextEncoder().encode(p).length;
}

/**
 * Karşılanmayan İLK kural (hepsi tamamsa `null`). `max`: şifre 72 UTF-8 baytı
 * aşıyor — alanın `maxLength`i bunu yakalayamaz (karakter sayar), o yüzden
 * ASCII dışı harfli uzun şifrede bu dal gerçekten çalışır. Form hata metni
 * bununla seçilir — her form aynı sırayla aynı kuralı söyler.
 */
export function firstUnmetPasswordRule(p: string): PasswordRuleKey | "max" | null {
  if (passwordByteLength(p) > PASSWORD_MAX_BYTES) return "max";
  return TESTS.find((r) => !r.test(p))?.key ?? null;
}

/** `firstUnmetPasswordRule` sonucu → `web.auth.password.*` hata anahtarı. */
export const PASSWORD_ERROR_KEY = {
  len: "min",
  max: "max",
  lower: "lower",
  upper: "upper",
  digit: "digit",
  special: "special",
} as const satisfies Record<PasswordRuleKey | "max", string>;

/**
 * Güç etiketinin kademesi (0..5). Kuralların HEPSİ zorunlu: biri eksikken
 * şifre gönderilemez, o yüzden etiket "Orta"yı (s2) aşmaz — eskiden 4/5 kural
 * "Güçlü" diyordu ama gönder düğmesi pasifti (arayüz testi D-087).
 */
export function strengthLevel(score: number, total: number = TESTS.length): number {
  if (score >= total) return 5;
  return Math.max(0, Math.min(2, score));
}

export function usePasswordRules(): {
  rules: PasswordRule[];
  /** 0..rules.length → "Çok Zayıf" … "Çok Güçlü" (eksik zorunlu kuralda en çok "Orta") */
  strength: (score: number) => string;
} {
  const t = useTranslations("web.auth.pwRules");
  const ts = useTranslations("web.auth.strength");
  return {
    rules: TESTS.map((r) => ({ ...r, label: t(r.key) })),
    strength: (score) => ts(`s${strengthLevel(score)}` as never),
  };
}
