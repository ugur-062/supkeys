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

export function usePasswordRules(): {
  rules: PasswordRule[];
  /** 0..rules.length → "Çok Zayıf" … "Çok Güçlü" */
  strength: (score: number) => string;
} {
  const t = useTranslations("web.auth.pwRules");
  const ts = useTranslations("web.auth.strength");
  return {
    rules: TESTS.map((r) => ({ ...r, label: t(r.key) })),
    strength: (score) => ts(`s${Math.max(0, Math.min(5, score))}` as never),
  };
}
