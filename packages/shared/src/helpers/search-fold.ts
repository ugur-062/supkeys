/**
 * Türkçe-duyarsız arama normalizasyonu.
 *
 * Postgres'te `lower('İ')` → "i + combining dot" (U+0307) ürettiğinden
 * `ILIKE '%iskele%'` sorgusu "İskele sistemleri"ni BULAMAZ. Ayrıca kullanıcılar
 * sık sık aksansız yazar ("jenerator" → "jeneratör", "vinc" → "Vinç").
 *
 * Çözüm: hem indekslenen metin (Category.searchText) hem sorgu, bu fonksiyonla
 * aynı biçime katlanır — Türkçe harfler ASCII'ye eşlenir, kalan diakritikler
 * NFKD ile atılır, boşluklar tekilleştirilir. Karşılaştırma düz `contains`.
 */
const TR_FOLD_MAP: Record<string, string> = {
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

export function foldSearchText(input: string): string {
  if (!input) return "";
  // Türkçe harfleri lowercase'ten ÖNCE eşle — 'İ'.toLowerCase() dotted-i
  // (i + U+0307) ürettiğinden sıra kritik.
  const mapped = Array.from(input)
    .map((ch) => TR_FOLD_MAP[ch] ?? ch)
    .join("")
    .toLowerCase();
  // Şapkalı (â/î/û) ve diğer diakritikler → ASCII.
  return mapped
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
