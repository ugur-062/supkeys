import { UNITS } from "@rothern/shared";

/**
 * AI çıktısı metin yardımcıları — DİLDEN BAĞIMSIZ (2026-09-27 uluslararası
 * denetim). Kayıt tüm ülkelere açıldı; AI içerik alanlarını girdinin dilinde
 * yazıyor (Almanca, Rusça, Çince…) → Türkçeye özgü varsayımlar (her şeyi
 * `tr-TR` ile küçültmek, cümleyi yalnız ". ! ?" ile bölmek) yabancı metni
 * bozuyordu.
 */

const TURKISH_LETTERS = /[çğışöüÇĞİŞÖÜ]/;

/**
 * Küçük harf — sözcük sözcük: Türkçeye özgü harf taşıyan sözcük Türkçe
 * kuralla ("IŞIK" → "ışık", "İSTANBUL" → "istanbul"), diğerleri evrensel
 * kuralla ("IP65" → "ip65"; `tr-TR` onu "ıp65" yapıyordu; düz `toLowerCase`
 * ise "İ"yi "i̇" — noktalı birleşik harf — yapıyordu).
 */
export function lowerCaseWords(s: string): string {
  return s
    .split(/(\s+)/)
    .map((w) => (TURKISH_LETTERS.test(w) ? w.toLocaleLowerCase("tr-TR") : w.toLowerCase()))
    .join("");
}

/** Çince/Japonca/Korece yazı — karakter başına bilgi yoğunluğu ~3 kat. */
const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/g;

/** Metnin çoğu CJK mi (uzunluk sınırları ÷3 okunur). */
export function isMostlyCjk(s: string): boolean {
  const letters = s.replace(/[\s\d\p{P}\p{S}]/gu, "").length;
  if (letters === 0) return false;
  return (s.match(CJK)?.length ?? 0) / letters > 0.5;
}

/**
 * Tavanı aşarsa CÜMLE sınırında keser — yarım cümle alıntılanmaz. Cümle sonu
 * Latin/Kiril ". ! ?" (ardından boşluk) ya da CJK/Arapça "。！？؟" (boşluksuz).
 */
export function clampSentences(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("。"),
    cut.lastIndexOf("！"),
    cut.lastIndexOf("？"),
    cut.lastIndexOf("؟"),
  );
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.trimEnd();
}

/**
 * İstemde birim kodu listesi — "PCE (adet), KG (kilogram), …" (tek kaynak
 * `@rothern/shared` UNITS). Model birimi KODLA yazsın: belge Almanca "Stück",
 * Rusça "шт" dese de kalem tek biçimde saklanır (`canonicalUnitName`); eskiden
 * istem "kısa Türkçe birim" istiyordu.
 */
export function unitCodeListForPrompt(): string {
  return UNITS.map((u) => `${u.code} (${u.nameTr})`).join(", ");
}
