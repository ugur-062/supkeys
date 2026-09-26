/**
 * IBAN KULLANAN ÜLKELER — SWIFT IBAN Registry (ülke kodu → IBAN uzunluğu).
 *
 * Neden liste (2026-09-27, kayıt tüm ülkelere açıldı): banka alanı "IBAN mı,
 * hesap numarası + SWIFT mi" kararını ülkeden verir. Eskiden profili olmayan
 * her ülke IBAN'lı VARSAYILIYORDU → Hindistan, Japonya, Kanada gibi IBAN
 * kullanmayan ülkelerin firması doğrulamayı ve Banka Hesapları'nı geçemezdi.
 *
 * Fransa denizaşırı toprakları (GF, GP, MQ, RE, YT, PF, NC, PM, WF, BL, MF)
 * Fransız "FR" IBAN'ı kullanır; Monako/Vatikan/San Marino kendi kodunu.
 * KKTC (XN) bankaları Türkiye IBAN biçimini (TR, 26) kullanır.
 * Rusya kayıtta var ama iç işlemde IBAN kullanılmaz → profil `usesIban:false`
 * bu listeyi ezer (`country-profiles.ts`).
 */
export const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
  MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18,
  NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33,
  SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

/** IBAN'ı bu ülkelerin biriyle kullanan bölgeler (kendi IBAN kodları yok). */
const IBAN_VIA: Readonly<Record<string, string>> = {
  GF: "FR", GP: "FR", MQ: "FR", RE: "FR", YT: "FR", PF: "FR", NC: "FR", PM: "FR",
  WF: "FR", BL: "FR", MF: "FR", AX: "FI", GG: "GB", JE: "GB", IM: "GB", XN: "TR",
};

/** Bu ülkenin bankaları IBAN kullanıyor mu (kayıt listesine göre). */
export function countryHasIban(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.toUpperCase();
  return IBAN_LENGTHS[c] != null || IBAN_VIA[c] != null;
}
