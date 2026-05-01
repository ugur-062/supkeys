const EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface ParsedEmail {
  email: string;
  valid: boolean;
}

/**
 * "ali@x.com, mehmet@y.com; foo invalid" gibi bir metni parse eder.
 * Virgül, noktalı virgül, satır sonu, boşlukla bölünür. Trim + lowercase + dedupe.
 * Geçersizler `valid: false` ile döner — UI üstte kırmızı pill'le gösterir.
 */
export function parseEmails(raw: string): ParsedEmail[] {
  if (!raw.trim()) return [];
  const tokens = raw
    .split(/[,;\s\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: ParsedEmail[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ email: t, valid: EMAIL_REGEX.test(t) });
  }
  return out;
}
