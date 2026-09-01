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

/**
 * Türkçe bağlaçlar — sorguda tek başına anlam taşımaz, AND'lenirse sonucu
 * gereksiz daraltır ("boru ve fittings" → "ve" hiçbir kategori adında geçmez
 * ve sorgu hiç sonuç döndürmez). Liste BİLİNÇLİ olarak kısa: gereğinden fazla
 * kelime elemek, kullanıcının gerçekten aradığı terimi atma riskini doğurur.
 */
const STOPWORDS = new Set(["ve", "ile", "veya", "icin", "ya", "de", "da"]);

/**
 * Arama sorgusunu anlamlı kelimelere böler (katlanmış biçimde eleme yapar ama
 * HAM kelimeyi döndürür — çağıran taraf `nameTr` gibi katlanmamış kolonlara da
 * bakabilsin diye).
 *
 * Tek kaynak: kategori araması bunu kullanır; yeni bir arama yüzeyi eklenirse
 * kendi bölme mantığını yazmak yerine buradan geçmeli.
 */
export function tokenizeQuery(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[\s,;/]+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (t.length < 2) return false;
      return !STOPWORDS.has(foldSearchText(t));
    });
}
