/**
 * Türkçe karakter eşlemesi — slug üretimi sırasında latinize için.
 */
const TR_CHAR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ü: "u",
  Ü: "u",
  ö: "o",
  Ö: "o",
  ı: "i",
  İ: "i",
};

/**
 * Türk şirket suffix'leri — slug'da kaldırılır.
 * Sırayla denenir; en uzun olan önce gelir ki "Ltd. Şti." kısmen kalmasın.
 */
const COMPANY_SUFFIXES = [
  "limited şirketi",
  "limited sti",
  "limited şirketi̇",
  "anonim şirketi̇",
  "anonim şirketi",
  "anonim sti",
  "ltd. şti.",
  "ltd sti",
  "ltd. sti.",
  "ltd",
  "ltd.",
  "a.ş.",
  "a.s.",
  "a.ş",
  "a.s",
  "şahıs",
];

/**
 * Şirket adından URL/DB slug'ı üretir.
 *
 * @example
 *   generateSlug("ABC Tekstil A.Ş.") → "abc-tekstil"
 *   generateSlug("Demo Şirket Ltd. Şti.") → "demo-sirket"
 */
export function generateSlug(input: string): string {
  if (!input) return "";

  let s = input.toLowerCase().trim();

  // Türkçe karakter latinize
  s = Array.from(s)
    .map((ch) => TR_CHAR_MAP[ch] ?? ch)
    .join("");

  // Şirket türü suffix'lerini kaldır
  for (const suffix of COMPANY_SUFFIXES) {
    if (s.endsWith(` ${suffix}`)) {
      s = s.slice(0, s.length - suffix.length - 1);
    }
  }

  // Diakritik / latin extended → ASCII normalization
  s = s.normalize("NFKD").replace(/\p{Diacritic}/gu, "");

  // Alfanümerik olmayan her şey → "-"
  s = s.replace(/[^a-z0-9]+/g, "-");

  // Ardışık tireler → tek tire
  s = s.replace(/-+/g, "-");

  // Baş/son tireleri sil
  s = s.replace(/^-|-$/g, "");

  return s;
}

/**
 * Slug çakışma kontrolü için yardımcı: candidate slug'ı al, exists fonksiyonu
 * ile mevcudiyetini kontrol et, varsa "-2", "-3" gibi suffix ekle.
 *
 * @example
 *   await uniqueSlug("abc-tekstil", async (s) => prisma.tenant.findUnique({where: {slug: s}}) !== null)
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  if (!base) base = "firma";
  let candidate = base;
  let suffix = 1;

  while (await exists(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > maxAttempts) {
      throw new Error(
        `Slug üretilemedi (${maxAttempts} denemede uygun bulunamadı): ${base}`,
      );
    }
  }

  return candidate;
}
