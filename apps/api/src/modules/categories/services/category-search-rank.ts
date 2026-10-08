import { categorySearchStem, foldSearchText, isRussianEnding } from "@rothern/shared";

/**
 * Kategori araması ALAKA sırası (arayüz testi O-022; yeniden kuruldu
 * recategory-new-1 / new-2).
 *
 * Arama süzgeci (searchText = TR ad + eş anlamlılar + EN/RU ad) bir satırı
 * BULUR ama ne kadar alakalı olduğunu söylemez. Sıra iki ölçüyle kurulur:
 *
 * 1) EŞLEŞME SINIFI (`categoryRowRank().matchClass`) — satırın yeri önce
 *    bununla belirlenir, puan sınıfın İÇİNDE sıralar:
 *      0 — ADI yazılan kelimeyi taşıyor
 *      1 — ADI kelimenin KÖKÜNÜ bir sözcüğün başında taşıyor
 *      2 — yazılan kelime yalnız eş anlamlılarında
 *      3 — yalnız kök, yalnız eş anlamlılarında
 *    Çok kelimeli sorguda satırın sınıfı EN KÖTÜ kelimesinin sınıfıdır.
 *    Eskiden "yazılan kelime nerede geçerse geçsin önce" kuralı vardı:
 *    "hidrolik pompası"nda eş anlamlısında "pompası" geçen laboratuvar
 *    cihazları, adı "Hidrolik pompalar" olan satırın önüne geçiyordu.
 *    Adının TAMAMI sorguya eşit olan satır (`exact`) hepsinin önündedir.
 *
 * 2) PUAN — kelime başına basamak (adın HERHANGİ bir dildeki biçiminde, en iyisi):
 *      4 — adın İLK sözcüğü kelimenin kendisi ya da çekimli hâli (Rulmanlar)
 *      3 — adın başka bir sözcüğü kelimenin kendisi/çekimli hâli (… vanaları)
 *      2 — bir sözcük kelimeyle BAŞLIYOR ama başka sözcük (Vanadyum)
 *      1 — kelime bir sözcüğün İÇİNDE geçiyor ("yağ" → "Tereyağı")
 *      0 — yalnız eş anlamlı / anahtar sözcükte
 *    Satır puanı = kelime basamaklarının toplamı. Kökle eşleşme kökün
 *    basamağıyla ama İNDİRİMLİ puanlanır (`STEM_TIER_SCORE`).
 *
 * Kök: `categorySearchStem` (`@rothern/shared`, web vurgusuyla ortak tek kaynak).
 */

/**
 * Kökle eşleşmenin puanı — dizin kökün basamağı (0-4). Hepsi 3'ün altında:
 * "kablolar" sorgusunda "Kablolar" (4) ve "Elektrik kabloları" (3), yalnız
 * kökle gelen "Kablo tesisatı"nın (2,75) önündedir. Kendi içinde sıra
 * korunur: tam sözcük > başka sözcüğün öneki > sözcük içi.
 */
const STEM_TIER_SCORE = [0, 0.5, 1.5, 2.5, 2.75] as const;

// Kök kuralı `@rothern/shared`'de (web vurgusu da okur); servis ve pazar yeri
// önerisi eskisi gibi bu modülden alır.
export { categorySearchStem };

/** Çekim eki (katlanmış): çoğul + iyelik/belirtme, İngilizce -s/-es. */
const INFLECTION = /^(?:(?:lar|ler)(?:i|u|in|un|a|e|da|de)?|(?:s|y|n)?(?:i|u)|n?(?:in|un)|s|es)?$/;

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
/** Harf / rakam dışı karakter: bunu taşıyan terim adın SÖZCÜKLERİYLE karşılaştırılamaz. */
const NON_WORD_CHAR = /[^\p{L}\p{N}]/u;
const ENDS_WITH_WORD_CHAR = /[\p{L}\p{N}]$/u;

const CYRILLIC = /[\u0400-\u04ff]/;

/** Sözcüğün `token`dan sonra kalanı bir çekim eki mi (Türkçe / İngilizce / Rusça). */
function isInflection(rest: string): boolean {
  return CYRILLIC.test(rest) ? isRussianEnding(rest) : INFLECTION.test(rest);
}

function tokenTier(folded: string, token: string): number {
  if (!folded || !token) return 0;
  const words = folded.split(WORD_SPLIT).filter(Boolean);
  let best = 0;
  for (let i = 0; i < words.length && best < 4; i++) {
    const w = words[i]!;
    if (w.startsWith(token)) {
      const tier = isInflection(w.slice(token.length)) ? (i === 0 ? 4 : 3) : 2;
      if (tier > best) best = tier;
    } else if (best < 1 && w.includes(token)) {
      best = 1;
    }
  }
  return best;
}

/**
 * Sözcüklere bölünemeyen terimin basamağı (sector-name-criterion a) — boşluk
 * ya da noktalama taşıyan terim: bütün ifade, "o-ring", "2.5",
 * "погрузочно-разгрузочных". `tokenTier` adı noktalamadan böldüğü için böyle
 * bir terim hiçbir sözcüğe eşit olamaz, puanı hep 0 kalıyordu. Ölçek aynı:
 *   4 — ad terimle BAŞLIYOR
 *   2 — terim adın içinde, bir sözcüğün BAŞINDA başlıyor
 *   1 — terim bir sözcüğün İÇİNDE başlıyor
 *   0 — adda yok
 */
function phraseTier(folded: string, phrase: string): number {
  if (!folded || !phrase) return 0;
  if (folded.startsWith(phrase)) return 4;
  // Harf/rakam dışı karakterle başlayan terim ("%50") kendi sözcük sınırıdır.
  const ownBoundary = !ENDS_WITH_WORD_CHAR.test(String.fromCodePoint(phrase.codePointAt(0) ?? 0x20));
  let best = 0;
  for (let i = folded.indexOf(phrase, 1); i > 0; i = folded.indexOf(phrase, i + 1)) {
    if (ownBoundary || !ENDS_WITH_WORD_CHAR.test(folded.slice(Math.max(0, i - 2), i))) return 2;
    best = 1;
  }
  return best;
}

export interface RankableCategory {
  nameTr: string;
  nameEn?: string | null;
  nameRu?: string | null;
}

/**
 * `tokens` katlanmış kelimelerdir; boşsa (yalnız bağlaç) `phrase` (katlanmış
 * bütün ifade) tek kelime gibi değerlendirilir.
 */
export function categoryMatchScore(
  row: RankableCategory,
  tokens: readonly string[],
  phrase: string,
): number {
  return termMatches(row, tokens, phrase).reduce((sum, m) => sum + m.score, 0);
}

/**
 * Sektörü açan en düşük kelime puanı: adın bir sözcüğü kelimeyle ya da köküyle
 * BAŞLAMALI (yazılan kelime: basamak 2-4; kök: `STEM_TIER_SCORE[2..4]`).
 */
const NAME_WORD_START_SCORE = STEM_TIER_SCORE[2];

/**
 * Sorgunun HER kelimesi (ya da kökü) satırın ADINDA bir sözcüğün başında
 * geçiyor mu (category-18, sector-name-criterion b).
 *
 * Arama süzgeci eş anlamlılara da bakar; bir SEKTÖR (L1) ise bütün aileleriyle
 * döner — yalnız eş anlamlısında geçen bir kelime yüzünden koca sektörü
 * listelemek sonucu boğardı. Sektör bu yüzden yalnız adı eşleşince döner.
 * Başka bir sözcüğün İÇİNDE geçmek (basamak 1; kökte 0,5) ad eşleşmesi
 * SAYILMAZ: "acil", İngilizce adında "Facility" geçen sektörü 46 ilgisiz
 * satırla açıyordu.
 */
export function categoryNameMatchesAll(
  row: RankableCategory,
  tokens: readonly string[],
  phrase: string,
): boolean {
  const matches = termMatches(row, tokens, phrase);
  return matches.length > 0 && matches.every((m) => m.score >= NAME_WORD_START_SCORE);
}

/**
 * Eşleşme sınıfı — satırın sıradaki yerini belirleyen ilk ölçü (bkz. dosya başı).
 *   0 ad + yazılan kelime · 1 ad + kök (sözcük başı) · 2 yalnız eş anlamlıda
 *   yazılan kelime · 3 yalnız eş anlamlıda kök.
 */
export type CategoryMatchClass = 0 | 1 | 2 | 3;

export interface CategoryRowRank {
  /** Adının TAMAMI (herhangi bir dilde) sorguya eşit — her şeyin önünde. */
  exact: boolean;
  matchClass: CategoryMatchClass;
  /** `categoryMatchScore` — sınıfın içinde sıralar. */
  score: number;
  /**
   * Sorgunun HER kelimesi adda bir sözcüğün KENDİSİ ya da çekimli hâli
   * (yazılan biçim ya da kök; basamak ≥ 3). Bir sözcüğün yalnız BAŞI
   * ("motor" → "Motorlu") ya da içi sayılmaz. Ağaçta "genel olan önce"
   * sırasını yalnız böyle satırlar belirler (bkz. `CategoryService`).
   * `shownName` verildiyse yalnız O ada bakılır (okuyucunun gördüğü ad):
   * Türkçe arayüzde "motor" yazan kullanıcı için "Motorlu araçlar" ailesi,
   * İngilizce adı "Motor vehicles" diye bu önceliği almaz.
   */
  wordMatch: boolean;
}

/** Sınıfı da puanı da taşıyan satır: `searchText` yalnız 2 / 3 ayrımı için okunur. */
export interface RankableCategoryRow extends RankableCategory {
  /** Katlanmış arama metni (ad + eş anlamlılar). Yoksa eş anlamlı eşleşmesi kök sayılır. */
  searchText?: string | null;
}

/** Karşılaştırma anahtarı: katlanmış, noktalama ve çoklu boşluk atılmış ad. */
export function categoryNameKey(text: string): string {
  return foldSearchText(text).split(WORD_SPLIT).filter(Boolean).join(" ");
}

/**
 * Satırın sırası (recategory-new-1 / new-2). `tokens` ve `phrase`
 * `categoryMatchScore` ile aynı girdilerdir (`phrase` = katlanmış bütün sorgu).
 */
export function categoryRowRank(
  row: RankableCategoryRow,
  tokens: readonly string[],
  phrase: string,
  shownName?: string | null,
): CategoryRowRank {
  const matches = termMatches(row, tokens, phrase);
  const text = row.searchText ?? "";
  let matchClass: CategoryMatchClass = 0;
  let score = 0;
  for (const m of matches) {
    score += m.score;
    if (termClass(m, text) > matchClass) matchClass = termClass(m, text);
  }
  const shown = shownName ? termMatches({ nameTr: shownName }, tokens, phrase) : matches;
  const wordMatch = shown.length > 0 && shown.every((m) => Math.max(m.typedTier, m.stemTier) >= 3);
  const queryKey = categoryNameKey(phrase);
  const exact =
    queryKey.length > 0 &&
    [row.nameTr, row.nameEn, row.nameRu].some((n) => !!n && categoryNameKey(n) === queryKey);
  return { exact, matchClass, score, wordMatch };
}

/**
 * Tek kelimenin eşleşme sınıfı. Yazılan biçim adda yalnız bir sözcüğün BAŞI
 * ya da içiyken (basamak 1-2) kök o sözcüğün KENDİSİ ise (basamak ≥ 3), ad
 * yazılan biçimi değil kökün çekimini taşıyordur → sınıf 1: Rusça "труба"
 * yazınca "… на обсадных трубах" ("труба" + "х") "… трубы" ile aynı sınıftadır,
 * adında "труба" sözcüğü geçen satırla değil.
 */
function termClass(m: TermMatch, searchText: string): CategoryMatchClass {
  if (m.typedTier >= 3) return 0;
  if (m.stemTier >= 3) return 1;
  if (m.typedTier >= 1) return 0;
  if (m.stemTier >= 2) return 1;
  return searchText.includes(m.term) ? 2 : 3;
}

/**
 * İki satırın sırası: tam ad → eşleşme sınıfı → puan. Negatif = `a` önce.
 * Eşitlikte çağıran kendi ölçüsünü (düzey, katalog sırası) uygular.
 */
export function compareCategoryRank(a: CategoryRowRank, b: CategoryRowRank): number {
  return Number(b.exact) - Number(a.exact) || a.matchClass - b.matchClass || b.score - a.score;
}

interface TermMatch {
  /** Katlanmış kelime (ya da bütün ifade). */
  term: string;
  /** Kelimenin puanı (bkz. dosya başı) — yazılan biçim, yoksa indirimli kök. */
  score: number;
  /** Yazılan biçimin adlardaki en iyi basamağı (0 = adda yok). */
  typedTier: number;
  /** Kökün adlardaki en iyi basamağı (kök = kelime ise 0). */
  stemTier: number;
}

/** Kelime başına eşleşme: puan + yazılan biçimin ve kökün adlardaki basamağı. */
function termMatches(
  row: RankableCategory,
  tokens: readonly string[],
  phrase: string,
): TermMatch[] {
  const names = [row.nameTr, row.nameEn, row.nameRu]
    .filter((n): n is string => !!n)
    .map((n) => foldSearchText(n));
  // Kök yalnız KELİMEDE aranır; bütün ifade (yalnız bağlaçtan oluşan sorgu)
  // yazıldığı gibi. Eki olmayan kelimede kök = kelime (ek puan yok).
  const terms =
    tokens.length > 0
      ? tokens.map((t) => ({ t, stem: categorySearchStem(t) }))
      : phrase
        ? [{ t: phrase, stem: phrase }]
        : [];
  const out: TermMatch[] = [];
  for (const { t, stem } of terms) {
    const tierOf = NON_WORD_CHAR.test(t) ? phraseTier : tokenTier;
    let score = 0;
    let typedTier = 0;
    let stemTier = 0;
    for (const n of names) {
      const typed = tierOf(n, t);
      if (typed > typedTier) typedTier = typed;
      let tier: number = typed;
      if (typed < 3 && stem !== t) {
        const byStem = tierOf(n, stem);
        if (byStem > stemTier) stemTier = byStem;
        tier = Math.max(tier, STEM_TIER_SCORE[byStem] ?? 0);
      }
      if (tier > score) score = tier;
    }
    out.push({ term: t, score, typedTier, stemTier });
  }
  return out;
}

/**
 * Bir satırın, bulunduğu segment/aile/sınıf sıralamasına katkısı (O-022,
 * yeniden doğrulama). Karesi alınır: adı kelimeyle BAŞLAYAN dört satır (4²·4 =
 * 64), sözcük İÇİNDE geçen elli satırı (1·50) geçer — sözcük içi tesadüfi
 * eşleşme seli segmenti öne çekemez. Yalnız eş anlamlıdan gelen (0) katkı
 * vermez. Kod eşleşmesi (≥100) sıralamayı katalog sırasına bırakır: hepsi
 * aynı önekte, adet anlamsız.
 */
export function relevanceWeight(score: number): number {
  if (score <= 0 || score >= 100) return 0;
  return score * score;
}

/**
 * Kodla arama (arayüz testi O-048): yalnız rakam, 2-8 hane (ayırıcısız tek
 * grupta tek sayılı önek de olur: "311"). Boşluk/nokta yalnız ÇİFT haneli
 * grupları ayırabilir ("43.23.00.00", "4323 0000"); "2.5" / "1.5" gibi
 * ondalık ölçü kod sayılmaz (yoksa "2.5" → "25" önekiyle bütün Araçlar
 * segmentini döndürüyordu). Sondaki "00" çiftleri düşülür → "43230000"
 * ailesi "4323" önekiyle aranır, "31161603" tam kodla. Kod olmayan sorguda
 * null.
 */
export function categoryCodePrefix(query: string): string | null {
  const groups = query.trim().split(/[\s.]+/);
  const grouped = groups.length > 1;
  if (!groups.every((g) => (grouped ? /^(?:\d\d)+$/ : /^\d+$/).test(g))) return null;
  const digits = groups.join("");
  if (!/^\d{2,8}$/.test(digits)) return null;
  let p = digits;
  while (p.length > 2 && p.length % 2 === 0 && p.endsWith("00")) p = p.slice(0, -2);
  return p;
}

/**
 * Sözcük sınırı sayılan karakterler — kök (ek toleransı) yalnız bir sözcüğün
 * BAŞINDA aranır. `searchText` katlanmış ama noktalaması duran metindir.
 */
export const CATEGORY_WORD_BOUNDARIES = [" ", "-", "(", "/", ",", "."] as const;

/**
 * KÖK YALNIZ SÖZCÜK BAŞINDA (2026-10-08): kök düz alt dizgi olarak arandığında
 * "nakliye" → "nakli", "kayNAKLIlı" ve "tırNAKLI" içinde de geçiyor ve
 * alakasız satırlar sonucu dolduruyordu. Ek toleransının amacı aynı sözcüğün
 * çekimlerini bulmak (boru → boruları), sözcüğün içindeki heceyi değil.
 * `literal` desene girmeye hazır (likeLiteral'den geçmiş) kök olmalıdır.
 * Dönen parçalar bir Prisma `OR` listesine yayılır.
 */
export function stemAtWordStart<C extends string>(column: C, literal: string, insensitive = false) {
  const mode = insensitive ? { mode: "insensitive" as const } : {};
  return [
    { [column]: { startsWith: literal, ...mode } },
    ...CATEGORY_WORD_BOUNDARIES.map((b) => ({ [column]: { contains: b + literal, ...mode } })),
  ] as Array<Record<C, { startsWith?: string; contains?: string; mode?: "insensitive" }>>;
}
