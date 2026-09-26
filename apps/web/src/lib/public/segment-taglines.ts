/**
 * SEGMENT SLOGANLARI — kategori vitrini tanıtım kartının alt cümlesi
 * (2026-09-21, kullanıcı mockup'ı: "Daha aydınlık, daha verimli işletmeler
 * için çözümler."). 58 Ariba/UNSPSC segmenti, ilk iki hane → cümle.
 * Sayı/ölçü/iddia yok (uydurma sinyal basılmaz); yalnız alanın ne olduğunu
 * söyler. Bilinmeyen kod → nötr cümle.
 *
 * METİN KATALOGDA (i18n Faz 1): `web.marketing.taglines.s<segment>` +
 * `fallback`; burada yalnız kod → anahtar eşlemesi durur. Çizim
 * `useSegmentTagline` (i18n/domain.ts) ile.
 */
export const TAGLINE_SEGMENTS = [
  "10", "11", "12", "13", "14", "15",
  "20", "21", "22", "23", "24", "25", "26", "27",
  "30", "31", "32", "39",
  "40", "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "50", "51", "52", "53", "54", "55", "56", "57",
  "60", "64",
  "70", "71", "72", "73", "76", "77", "78",
  "80", "81", "82", "83", "84", "85", "86",
  "90", "91", "92", "93", "94", "95",
] as const;

export type TaglineKey = `s${(typeof TAGLINE_SEGMENTS)[number]}` | "fallback";

/** Kategori kodunun (herhangi seviye) slogan anahtarı. */
export function segmentTaglineKey(code: string | undefined): TaglineKey {
  if (!code || !/^\d{8}$/.test(code)) return "fallback";
  const seg = code.slice(0, 2);
  return (TAGLINE_SEGMENTS as readonly string[]).includes(seg) ? (`s${seg}` as TaglineKey) : "fallback";
}
