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
 * TÜRKÇE DIŞI HARFLER (2026-09-27, kayıt tüm ülkelere açıldı) — Türkçe
 * eşlemeden SONRA uygulanır; Türkçe harflerin hiçbiri bu tabloda yok, bu
 * yüzden Türkçe girdinin slug'ı birebir aynı kalır (mevcut slug'lar donuk).
 *
 * Kiril: Rusça/Ukraynaca/Kazakça için yaygın sade çeviriyazı (щ→shch,
 * ж→zh, х→kh …). Latin genişletilmiş: NFKD ile ayrışmayan harfler (ß, ł, ø,
 * æ …); kalan aksanlı harfler (é, ñ, å) aşağıdaki NFKD adımında düşer.
 * Çeviriyazısı olmayan yazılar (Çince, Arapça, İbranice, Tay …) boş slug
 * üretir — çağıran anlamlı bir yedeğe düşer (bkz. API `company-slug.ts`).
 */
const EXTRA_CHAR_MAP: Record<string, string> = {
  // Kiril (küçük harf — girdi önce küçültülür)
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Ukraynaca
  є: "ye", і: "i", ї: "yi", ґ: "g",
  // Kazakça
  ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h",
  // Latin genişletilmiş (NFKD ile ayrışmayanlar)
  ß: "ss", ł: "l", ø: "o", æ: "ae", œ: "oe", đ: "d", ð: "d", þ: "th", ħ: "h", ŀ: "l",
};

/**
 * Sonek karşılaştırması için ortak biçim: küçült, Türkçe harfleri latinize et,
 * "İ".toLowerCase()'in bıraktığı birleşik noktayı (U+0307) at. Girdi ve sonek
 * listesi AYNI fonksiyondan geçer — eskiden yalnız girdi latinize ediliyordu,
 * "anonim şirketi" / "limited şirketi" / "şahıs" sonekleri hiç eşleşmiyordu
 * (derin denetim LU-10).
 */
function foldForSuffix(value: string): string {
  return Array.from(value.toLowerCase().trim())
    .map((ch) => TR_CHAR_MAP[ch] ?? ch)
    .join("")
    .replace(/\u0307/g, "");
}

/**
 * Türk şirket suffix'leri — slug'da kaldırılır.
 * Sırayla denenir; en uzun olan önce gelir ki "Ltd. Şti." kısmen kalmasın.
 * Karşılaştırma `foldForSuffix` biçiminde (`COMPANY_SUFFIXES_FOLDED`).
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
const COMPANY_SUFFIXES_FOLDED = [...new Set(COMPANY_SUFFIXES.map(foldForSuffix))];

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

  // Türkçe karakter latinize (normalize'dan ÖNCE: "ı"/"İ" NFKD ile düzelmez);
  // ardından Kiril + NFKD'nin ayrıştırmadığı Latin harfler (Türkçe ÖNCE).
  s = Array.from(s)
    .map((ch) => TR_CHAR_MAP[ch] ?? EXTRA_CHAR_MAP[ch] ?? ch)
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

  // Türkçe karakter latinize — sonek karşılaştırması latinize metin üzerinden
  // yapıldığı için bu adım slugifyText'ten ÖNCE burada da gerekli.
  let s = foldForSuffix(input);

  // Şirket türü suffix'lerini kaldır
  for (const suffix of COMPANY_SUFFIXES_FOLDED) {
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
