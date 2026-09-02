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
 * Herhangi bir metinden URL parçası üretir — ŞİRKET KURALI YOK.
 *
 * `generateSlug` ile aynı latinizasyon/temizleme algoritmasını kullanır; tek
 * fark, şirket türü sonekini ("A.Ş.", "Ltd. Şti.") KIRPMAMASIDIR. Ayrı
 * durmasının sebebi: ilan/talep başlığı bir şirket adı değildir ve "… Ltd"
 * ile biten bir başlıktan o soneki silmek metni bozar.
 *
 * @example
 *   slugifyText("Çelik Boru Alımı") → "celik-boru-alimi"
 */
export function slugifyText(input: string): string {
  if (!input) return "";

  let s = input.toLowerCase().trim();

  // Türkçe karakter latinize (normalize'dan ÖNCE: "ı"/"İ" NFKD ile düzelmez)
  s = Array.from(s)
    .map((ch) => TR_CHAR_MAP[ch] ?? ch)
    .join("");

  // Diakritik / latin extended → ASCII normalization
  s = s.normalize("NFKD").replace(/\p{Diacritic}/gu, "");

  // Alfanümerik olmayan her şey → "-", ardışıkları tekle, uçları kırp
  return s
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

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

  // Türkçe karakter latinize — sonek karşılaştırması latinize metin üzerinden
  // yapıldığı için bu adım slugifyText'ten ÖNCE burada da gerekli.
  s = Array.from(s)
    .map((ch) => TR_CHAR_MAP[ch] ?? ch)
    .join("");

  // Şirket türü suffix'lerini kaldır
  for (const suffix of COMPANY_SUFFIXES) {
    if (s.endsWith(` ${suffix}`)) {
      s = s.slice(0, s.length - suffix.length - 1);
    }
  }

  return slugifyText(s);
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
