/**
 * B8 — sayıya Türkçe iyelik eki (3. tekil): "6'sı", "10'u", "20'si", "40'ı".
 * Ek, sayının OKUNUŞUNUN son sesine göre seçilir (yazımdaki rakama değil):
 * altı → "altısı", kırk → "kırkı". Kesme işareti dahil döner.
 */
const LAST_DIGIT_SUFFIX: Record<number, string> = {
  0: "'ı", // sıfır(ı) — tek başına 0 için; 10/20/… aşağıda ayrıca
  1: "'i", // bir-i
  2: "'si", // iki-si
  3: "'ü", // üç-ü
  4: "'ü", // dört-ü
  5: "'i", // beş-i
  6: "'sı", // altı-sı
  7: "'si", // yedi-si
  8: "'i", // sekiz-i
  9: "'u", // dokuz-u
};

const TENS_SUFFIX: Record<number, string> = {
  10: "'u", // on-u
  20: "'si", // yirmi-si
  30: "'u", // otuz-u
  40: "'ı", // kırk-ı
  50: "'si", // elli-si
  60: "'ı", // altmış-ı
  70: "'i", // yetmiş-i
  80: "'i", // seksen-i
  90: "'ı", // doksan-ı
};

export function numberPossessive(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const last = abs % 10;
  if (last !== 0) return LAST_DIGIT_SUFFIX[last]!;
  if (abs === 0) return LAST_DIGIT_SUFFIX[0]!;
  const lastTwo = abs % 100;
  if (lastTwo !== 0) return TENS_SUFFIX[lastTwo]!;
  if (abs % 1000 !== 0) return "'ü"; // yüz-ü
  if (abs % 1_000_000 !== 0) return "'i"; // bin-i
  return "'u"; // milyon-u / milyar-ı? (milyar → 'ı; pratikte kullanılmıyor)
}
