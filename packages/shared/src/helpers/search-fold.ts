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

/**
 * Türkçe ek toleransı — katlanmış (ASCII) token'dan SON EK düşer:
 * "borulari" → "boru", "panosu" → "pano", "sistemleri" → "sistem",
 * "kablolar" → "kablo"; eki olmayan ("elektrik", "kompanzasyon") olduğu gibi.
 * Kör ön ek kesmek yerine ek listesi: "elektrik" → "elek" gibi kısaltmalar
 * "elektronik"i de yakalıyordu. Yalnız ≥6 karakterde ve kalan ≥4 ise.
 * Tek kaynak — kategori ipucu çözümleyici, ürün araması ve açık talep
 * araması (liste + AI gevşetme sayımı) aynı kuralı okur.
 */
const TR_SUFFIXES = [
  "larini", "lerini", "larina", "lerine", "lari", "leri", "sini", "sunu", "nden", "ndan",
  "lar", "ler", "nin", "nun", "dan", "den", "tan", "ten",
  "si", "su", "ni", "nu", "in", "un", "da", "de", "ta", "te", "ya", "ye",
  "i", "u", "a", "e",
].sort((a, b) => b.length - a.length);

export function stemPrefix(token: string): string {
  if (token.length >= 6) {
    for (const suf of TR_SUFFIXES) {
      if (token.endsWith(suf) && token.length - suf.length >= 4) return token.slice(0, token.length - suf.length);
    }
  }
  return englishPluralStem(token);
}

/**
 * İngilizce çoğul toleransı (i18n arama, 2026-09-24) — çok dilli arama
 * metninde (`searchTextI18n`) "pipes" → "pipe", "valves" → "valve",
 * "boxes" → "box", "batteries" → "batter" ("battery"yi de bulur). Türkçe ek
 * listesi `-s` taşımadığı için yalnız Türkçe kural düşürmediğinde ve ≥5
 * karakterde çalışır; "-ss/-us/-is" (glass, cactus, analysis) dokunulmaz.
 * Rusça çekim bilinçli YOK (v1).
 */
function englishPluralStem(token: string): string {
  if (token.length < 5 || !/^[a-z]+$/.test(token)) return token;
  if (token.endsWith("ies")) return token.slice(0, -3);
  if (/(?:x|z|ch|sh|ss)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

/**
 * Kategori arama metni — TEK KAYNAK (seed + tüm apply betikleri). Türkçe ad +
 * anahtar kelimeler + EN/RU adlar (i18n arama, 2026-09-24): "steel pipes"
 * yazan İngilizce kullanıcı kategoriyi de bulur. Ad değiştiren her betik
 * bunu yeniden hesaplamalı, yoksa arama eski adla kalır.
 */
export function categorySearchText(c: {
  nameTr: string;
  keywords?: string | null;
  nameEn?: string | null;
  nameRu?: string | null;
}): string {
  return foldSearchText([c.nameTr, c.keywords, c.nameEn, c.nameRu].filter(Boolean).join(" "));
}
