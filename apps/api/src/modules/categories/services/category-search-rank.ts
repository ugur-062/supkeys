import { foldSearchText, stemPrefix } from "@rothern/shared";

/**
 * Kategori araması ALAKA puanı (arayüz testi O-022).
 *
 * Arama süzgeci (searchText = TR ad + eş anlamlılar + EN/RU ad) bir satırı
 * BULUR ama ne kadar alakalı olduğunu söylemez: eskiden sonuçlar yalnız
 * düzey + sıra numarasına göre dizilip 200'de kesiliyordu → "rulman"
 * "Silikon gres" (eş anlamlıdan) ile başlıyor, "Rulmanlar ve yataklar" 23.
 * sırada kalıyordu; "vana" "Vanadyum"u "Vanalar"ın önüne koyabiliyordu.
 *
 * Kelime başına basamak (adın HERHANGİ bir dildeki biçiminde, en iyisi):
 *   4 — adın İLK sözcüğü kelimenin kendisi ya da çekimli hâli (Rulmanlar)
 *   3 — adın başka bir sözcüğü kelimenin kendisi/çekimli hâli (… vanaları)
 *   2 — bir sözcük kelimeyle BAŞLIYOR ama başka sözcük (Vanadyum)
 *   1 — kelime bir sözcüğün İÇİNDE geçiyor ("yağ" → "Tereyağı")
 *   0 — yalnız eş anlamlı / anahtar sözcükte
 * Satır puanı = kelime basamaklarının toplamı.
 *
 * KÖK EŞLEŞMESİ (code-category-2): süzgeç kelimenin KÖKÜYLE de arar
 * (`categorySearchStem`: "boruları" → "boru", "pipes" → "pipe"), yani yazılan
 * biçimi adında taşımayan satırlar da gelir. Onlar kökün basamağıyla ama
 * İNDİRİMLİ puanlanır (`STEM_TIER_SCORE`).
 *
 * Puan tek başına "yazılan kelime önde" güvencesi DEĞİLDİR: yazılan kelimeyi
 * yalnız eş anlamlısında (0) ya da bir sözcüğün içinde (1) taşıyan satır,
 * adı kökle başlayan satırdan (2,75) düşük puan alır. Güvenceyi servis verir
 * (`CategoryService.searchHierarchical`): yazılan kelimeyi taşıyan satırlar
 * AYRI çekilir ve yalnız kökle gelenlerin her düzeyde önünde tutulur.
 */

/**
 * Kökle eşleşmenin puanı — dizin kökün basamağı (0-4). Hepsi 3'ün altında:
 * "kablolar" sorgusunda "Kablolar" (4) ve "Elektrik kabloları" (3), yalnız
 * kökle gelen "Kablo tesisatı"nın (2,75) önündedir. Kendi içinde sıra
 * korunur: tam sözcük > başka sözcüğün öneki > sözcük içi. Bu puan yalnız
 * kökle gelen satırları KENDİ aralarında dizer (ve yazılan kelimeyi taşıyan
 * satırın puanına kök basamağını katar).
 */
const STEM_TIER_SCORE = [0, 0.5, 1.5, 2.5, 2.75] as const;

/** Kullanılan en kısa kök — Türkçe ek kuralının (`stemPrefix`) tabanıyla aynı. */
const CATEGORY_STEM_MIN_LENGTH = 4;

/**
 * Kategori aramasının kullandığı KÖK (katlanmış kelimeden) — süzgeç, öneri ve
 * puanlama için TEK kaynak.
 *
 * `stemPrefix` ortak kuraldır ama İngilizce çoğul dalı kısa kök de üretir
 * ("fries" → "fr", "copies" → "cop", "skies" → "sk"). Kök bütün katalogda ALT
 * DİZE olarak arandığı için iki-üç harfli kök ilgisiz yüzlerce satırla
 * eşleşir: "fries" 200 satır döndürüyor ("Fren sistemleri …"), sonuçsuz arama
 * kürasyon kuyruğuna da yazılmıyordu (cat-search-short-english-stem).
 * 4 karakterden kısa kök KULLANILMAZ; kelime yazıldığı gibi aranır.
 */
export function categorySearchStem(folded: string): string {
  const stem = stemPrefix(folded);
  return stem.length >= CATEGORY_STEM_MIN_LENGTH ? stem : folded;
}

/** Çekim eki (katlanmış): çoğul + iyelik/belirtme, İngilizce -s/-es. */
const INFLECTION = /^(?:(?:lar|ler)(?:i|u|in|un|a|e|da|de)?|(?:s|y|n)?(?:i|u)|n?(?:in|un)|s|es)?$/;

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
/** Harf / rakam dışı karakter: bunu taşıyan terim adın SÖZCÜKLERİYLE karşılaştırılamaz. */
const NON_WORD_CHAR = /[^\p{L}\p{N}]/u;
const ENDS_WITH_WORD_CHAR = /[\p{L}\p{N}]$/u;

function tokenTier(folded: string, token: string): number {
  if (!folded || !token) return 0;
  const words = folded.split(WORD_SPLIT).filter(Boolean);
  let best = 0;
  for (let i = 0; i < words.length && best < 4; i++) {
    const w = words[i]!;
    if (w.startsWith(token)) {
      const tier = INFLECTION.test(w.slice(token.length)) ? (i === 0 ? 4 : 3) : 2;
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
  return termScores(row, tokens, phrase).reduce((sum, s) => sum + s, 0);
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
  const scores = termScores(row, tokens, phrase);
  return scores.length > 0 && scores.every((s) => s >= NAME_WORD_START_SCORE);
}

/** Kelime başına en iyi basamak (bkz. dosya başı); toplamı satır puanıdır. */
function termScores(
  row: RankableCategory,
  tokens: readonly string[],
  phrase: string,
): number[] {
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
  const scores: number[] = [];
  for (const { t, stem } of terms) {
    const tierOf = NON_WORD_CHAR.test(t) ? phraseTier : tokenTier;
    let best = 0;
    for (const n of names) {
      let tier = tierOf(n, t);
      if (tier < 3 && stem !== t) {
        tier = Math.max(tier, STEM_TIER_SCORE[tierOf(n, stem)] ?? 0);
      }
      if (tier > best) best = tier;
      if (best === 4) break;
    }
    scores.push(best);
  }
  return scores;
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
