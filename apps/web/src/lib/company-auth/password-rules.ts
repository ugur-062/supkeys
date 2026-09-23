import { useTranslations } from "next-intl";

/**
 * Şifre kuralları + güç etiketi — kayıt ve davet kabul formlarının ORTAK
 * kaynağı (i18n Faz 1'de iki kopya birleşti). Politika backend'in
 * kayıt/davet DTO'suyla aynı: 10 karakter, küçük/büyük harf, rakam, özel.
 */
export interface PasswordRule {
  key: "len" | "lower" | "upper" | "digit" | "special";
  label: string;
  test: (p: string) => boolean;
}

const TESTS: ReadonlyArray<Pick<PasswordRule, "key" | "test">> = [
  { key: "len", test: (p) => p.length >= 10 },
  { key: "lower", test: (p) => /[a-z]/.test(p) },
  { key: "upper", test: (p) => /[A-Z]/.test(p) },
  { key: "digit", test: (p) => /[0-9]/.test(p) },
  { key: "special", test: (p) => /[^a-zA-Z0-9]/.test(p) },
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
