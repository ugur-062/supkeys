import { foldSearchText } from "@rothern/shared";

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
 */

/** Çekim eki (katlanmış): çoğul + iyelik/belirtme, İngilizce -s/-es. */
const INFLECTION = /^(?:(?:lar|ler)(?:i|u|in|un|a|e|da|de)?|(?:s|y|n)?(?:i|u)|n?(?:in|un)|s|es)?$/;

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

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
  const names = [row.nameTr, row.nameEn, row.nameRu]
    .filter((n): n is string => !!n)
    .map((n) => foldSearchText(n));
  const terms = tokens.length > 0 ? tokens : phrase ? [phrase] : [];
  let score = 0;
  for (const t of terms) {
    let best = 0;
    for (const n of names) {
      const tier = t.includes(" ")
        ? n.startsWith(t) ? 4 : n.includes(t) ? 2 : 0
        : tokenTier(n, t);
      if (tier > best) best = tier;
      if (best === 4) break;
    }
    score += best;
  }
  return score;
}

/**
 * Kodla arama (arayüz testi O-048): yalnız rakam (boşluk/nokta atılır), 2-8
 * hane. Sondaki "00" çiftleri düşülür → "43230000" ailesi "4323" önekiyle
 * aranır, "31161603" tam kodla. Rakam dışı sorguda null.
 */
export function categoryCodePrefix(query: string): string | null {
  const digits = query.replace(/[\s.]/g, "");
  if (!/^\d{2,8}$/.test(digits)) return null;
  let p = digits;
  while (p.length > 2 && p.length % 2 === 0 && p.endsWith("00")) p = p.slice(0, -2);
  return p;
}
