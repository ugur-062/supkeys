import { useTranslations } from "next-intl";

/**
 * Şifre kuralları + güç etiketi — kayıt, davet kabulü ve Ayarlar › Şifre'nin
 * ORTAK kaynağı; sıfırlama formu eşiği buradan okur. Politika backend'in dört
 * DTO'suyla aynı (sözleşme: api `password-policy-parity.spec`): 10 karakter,
 * küçük/büyük harf, rakam, özel karakter.
 */
export interface PasswordRule {
  key: "len" | "lower" | "upper" | "digit" | "special";
  label: string;
  test: (p: string) => boolean;
}

/** Kayıt, davet kabulü, şifre değiştirme ve sıfırlama — TEK eşik (API DTO'larıyla aynı). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_SPECIAL_RE = /[^a-zA-Z0-9]/;

const TESTS: ReadonlyArray<Pick<PasswordRule, "key" | "test">> = [
  { key: "len", test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { key: "lower", test: (p) => /[a-z]/.test(p) },
  { key: "upper", test: (p) => /[A-Z]/.test(p) },
  { key: "digit", test: (p) => /[0-9]/.test(p) },
  { key: "special", test: (p) => PASSWORD_SPECIAL_RE.test(p) },
];

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
