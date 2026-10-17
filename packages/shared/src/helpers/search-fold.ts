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
 * Bağlaçlar ve edatlar — sorguda tek başına anlam taşımaz, AND'lenirse sonucu
 * gereksiz daraltır ("boru ve fittings" → "ve" hiçbir kategori adında geçmez
 * ve sorgu hiç sonuç döndürmez). Liste BİLİNÇLİ olarak kısa: gereğinden fazla
 * kelime elemek, kullanıcının gerçekten aradığı terimi atma riskini doğurur.
 *
 * İngilizce ve Rusça karşılıkları da (recategory-new-5): katalog adları üç
 * dilde aranır; İngilizce sektör adını ("Manufacturing Components and
 * Supplies") yazan kullanıcının "and"i bütün satırlarda vurgulanıyordu.
 * Rusça "и" tek harf olduğu için zaten elenir; liste eksiksiz dursun diye
 * burada da yazılı.
 */
const STOPWORDS = new Set([
  // tr
  "ve", "ile", "veya", "icin", "ya", "de", "da",
  // en
  "and", "or", "the", "of", "for",
  // ru
  "и", "или", "для",
]);

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

/** Kategori aramasında kullanılan en kısa kök. */
export const CATEGORY_STEM_MIN_LENGTH = 4;

/**
 * ÜST ÜSTE Türkçe ek (category-2). İlk ek ortak kuralla (`TR_SUFFIXES`, ürün
 * aramasıyla AYNI liste) düşer; ikinci ek yalnız Türkçenin diziliş sırasının
 * (kök + çoğul + iyelik + hâl) izin verdiği yerde aranır:
 *   · "-nın / -nı / -ndan" (zamir n'li hâl ekleri) iyelikten sonra gelir →
 *     ardından iyelik (+ çoğul) düşer: "rulmanlarının" → "rulmanları" →
 *     "rulman", "pompasının" → "pompa", "borusundan" → "boru". Yalın "-ı"
 *     iyeliği yalnız "-nın"dan sonra düşer ("üretiminin" → "üretim"): "-nı /
 *     -ndan"dan önceki "ı" çoğu zaman kökün kendi n'sinden kalır ("türbini",
 *     "yangından") ve düşürmek kökü kısaltırdı;
 *   · n'siz hâl ekinden ("-da, -dan, -a, -ın") önce iyelik OLAMAZ → yalnız
 *     çoğul düşer: "borularda" → "boru", "pompaların" → "pompa".
 * Listeyi körlemesine yinelemek kökün kendi hecesini de yiyordu
 * ("cıvatalarının" → "cıvata" → "cıva", "kapasite" → "kapasi" → "kapa");
 * bu kural "cıvata"da durur ve tek ekli kelimede ortak kuralla aynı kökü verir.
 */
const TR_AFTER_POSSESSIVE = new Set(["nin", "nun", "ni", "nu", "nden", "ndan"]);
const TR_PLAIN_CASE = new Set([
  "in", "un", "dan", "den", "tan", "ten", "da", "de", "ta", "te", "ya", "ye", "a", "e",
]);
const TR_VOWEL = "aeiou";

/** `suffixes`ten uyan ilk eki düşürür; kalan en az 4 karakter olmalı. */
function dropSuffix(token: string, suffixes: readonly string[]): string {
  for (const suf of suffixes) {
    if (token.endsWith(suf) && token.length - suf.length >= CATEGORY_STEM_MIN_LENGTH) {
      return token.slice(0, token.length - suf.length);
    }
  }
  return token;
}

/**
 * İyelik eki (çoğulla birlikte de): "-ları", ünlüden sonra "-sı"; `bare` ise
 * ünsüzden sonraki yalın "-ı" da.
 */
function dropPossessive(token: string, bare: boolean): string {
  const plural = dropSuffix(token, ["lari", "leri"]);
  if (plural !== token) return plural;
  const before = (n: number) => token.charAt(token.length - n - 1);
  if (/(?:si|su)$/.test(token) && TR_VOWEL.includes(before(2))) return dropSuffix(token, ["si", "su"]);
  if (bare && /[iu]$/.test(token) && !TR_VOWEL.includes(before(1))) return dropSuffix(token, ["i", "u"]);
  return token;
}

function turkishCategoryStem(token: string): string {
  if (token.length < 6) return token;
  for (const suf of TR_SUFFIXES) {
    if (!token.endsWith(suf) || token.length - suf.length < CATEGORY_STEM_MIN_LENGTH) continue;
    const rest = token.slice(0, token.length - suf.length);
    if (TR_AFTER_POSSESSIVE.has(suf)) return dropPossessive(rest, suf === "nin" || suf === "nun");
    if (TR_PLAIN_CASE.has(suf)) return dropSuffix(rest, ["lar", "ler"]);
    return rest;
  }
  return token;
}

/**
 * Rusça ad ve sıfat çekim ekleri — KATLANMIŞ biçimde (`foldSearchText`
 * "й" → "и", "ё" → "е"): "-ый" burada "ыи", "-ой" "ои", "-ей" "еи". Uzun ek
 * önce. Tek ek düşer (Rusçada çekim eki tektir); fiil ve türetme ekleri
 * bilinçli YOK ("сварка" ↔ "сварочный" ayrı kök kalır), kayan ünlü de
 * ("станок" ↔ "станки").
 */
const RU_ENDINGS = [
  "иями", "ями", "ами", "ыми", "ими", "иях", "иям", "ого", "его", "ому", "ему",
  "ая", "яя", "ое", "ее", "ые", "ие", "ыи", "ии", "ои", "еи", "ую", "юю", "ым", "им", "ых", "их",
  "ов", "ев", "ам", "ям", "ах", "ях", "ом", "ем", "ия", "ию", "ью", "ье",
  "а", "я", "ы", "и", "у", "ю", "е", "о", "ь",
];
const CYRILLIC = /[\u0400-\u04ff]/;

/** Rusça çekim eki mi (katlanmış; boş = yalın hâl). `categoryMatchScore` de okur. */
export function isRussianEnding(rest: string): boolean {
  return rest === "" || RU_ENDINGS.includes(rest);
}

function russianCategoryStem(token: string): string {
  return dropSuffix(token, RU_ENDINGS);
}

/**
 * KATEGORİ ARAMASININ KÖKÜ (katlanmış kelimeden) — süzgeç, öneri, puanlama ve
 * web vurgusu için TEK kaynak. Ürün / talep / firma araması `stemPrefix`'i
 * kullanmaya devam eder; bu kural onları DEĞİŞTİRMEZ.
 *
 *   · Türkçe ekler üst üste düşer (çoğul + iyelik + hâl; category-2):
 *     "rulmanlarının" → "rulman", "borularının" → "boru", "pompası" → "pompa".
 *     Tek ekli kelimede kök `stemPrefix` ile aynıdır.
 *   · Kiril kelimede Rusça ad / sıfat çekim eki düşer (recategory-new-3):
 *     "сварка" → "сварк", "кабели" = "кабель" → "кабел", "стальные" =
 *     "стальная" → "стальн", "подшипники" → "подшипник".
 *   · Latin kelimede Türkçe ek düşmediyse İngilizce çoğul ("pipes" → "pipe").
 *   · Kök en az 4 karakterdir; daha kısa çıkıyorsa kelime yazıldığı gibi
 *     aranır ("fries" → "fr" bütün katalogla eşleşiyordu).
 *
 * Kök yalnız bir sözcüğün BAŞINDA aranır (çağıran taraf).
 */
export function categorySearchStem(folded: string): string {
  if (!folded) return folded;
  let stem: string;
  if (CYRILLIC.test(folded)) {
    stem = russianCategoryStem(folded);
  } else {
    stem = turkishCategoryStem(folded);
    if (stem === folded) stem = englishPluralStem(folded);
  }
  return stem.length >= CATEGORY_STEM_MIN_LENGTH ? stem : folded;
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
