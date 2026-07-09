/**
 * Telefon ülke kodları (dial code) — telefon giriş alanındaki ülke seçici için.
 * ISO 3166-1 alpha-2 → uluslararası arama kodu. COUNTRIES ile aynı ülke seti.
 * Bayrak emojisi koddan türetilir (codeToFlag) — ayrı görsel varlık gerekmez.
 */
import { COUNTRIES } from "./countries";

/** ISO alpha-2 → dial code (baştaki + olmadan). */
export const PHONE_DIAL_CODES: Record<string, string> = {
  TR: "90", DE: "49", US: "1", AD: "376", AO: "244", AR: "54", AL: "355",
  AZ: "994", BH: "973", BD: "880", BE: "32", BY: "375", AE: "971", GB: "44",
  BA: "387", BR: "55", BG: "359", DZ: "213", CN: "86", DK: "45", EC: "593",
  ID: "62", EE: "372", ET: "251", MA: "212", FI: "358", FR: "33", GH: "233",
  ZA: "27", KR: "82", GE: "995", HR: "385", IN: "91", NL: "31", IQ: "964",
  IR: "98", IE: "353", ES: "34", IL: "972", SE: "46", CH: "41", IT: "39",
  IS: "354", JP: "81", ME: "382", QA: "974", KZ: "7", KE: "254", CY: "357",
  KG: "996", CO: "57", KW: "965", LV: "371", LB: "961", LU: "352", LT: "370",
  HU: "36", MK: "389", MY: "60", MT: "356", MX: "52", EG: "20", MD: "373",
  MN: "976", MR: "222", NO: "47", UZ: "998", PK: "92", PA: "507", PE: "51",
  PL: "48", PT: "351", RO: "40", RU: "7", RS: "381", SA: "966", SY: "963",
  CL: "56", TJ: "992", TW: "886", TH: "66", TN: "216", TM: "993", UA: "380",
  OM: "968", JO: "962", VN: "84", GR: "30", NZ: "64", AU: "61", AT: "43",
  CA: "1", CZ: "420", SK: "421", SI: "386", SG: "65", PH: "63", NG: "234",
};

/** ISO alpha-2 kodundan bayrak emojisi (bölgesel gösterge sembolleri). */
export function codeToFlag(code: string): string {
  const cc = (code || "").toUpperCase();
  if (cc.length !== 2 || !/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)),
  );
}

export interface PhoneCountry {
  code: string; // ISO alpha-2
  name: string; // Türkçe ad
  dialCode: string; // + olmadan
  flag: string; // emoji
}

/** Ülke seçici için birleşik liste (COUNTRIES sırası: TR başta, sonra alfabetik). */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = COUNTRIES.filter(
  (c) => PHONE_DIAL_CODES[c.code],
).map((c) => ({
  code: c.code,
  name: c.name,
  dialCode: PHONE_DIAL_CODES[c.code]!,
  flag: codeToFlag(c.code),
}));

/**
 * Tam telefon değerini (ör. "+90 5xx...") ülke koduna + ulusal numaraya ayırır.
 * Bilinen dial code'lardan en uzun eşleşeni seçer. Eşleşme yoksa varsayılan TR.
 */
export function parsePhone(
  value: string | null | undefined,
): { code: string; national: string } {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("+")) {
    return { code: "TR", national: raw.replace(/[^\d ]/g, "").trim() };
  }
  const digits = raw.slice(1).replace(/\D/g, "");
  // En uzun dial code eşleşmesi (ör. +1 vs +90 çakışması için uzun önce).
  const sorted = [...PHONE_COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );
  for (const c of sorted) {
    if (digits.startsWith(c.dialCode)) {
      return { code: c.code, national: digits.slice(c.dialCode.length) };
    }
  }
  return { code: "TR", national: digits };
}

/** Ülke kodu + ulusal numaradan tam değer üretir ("+90 5xxxxxxxxx"). */
export function composePhone(code: string, national: string): string {
  const dial = PHONE_DIAL_CODES[code] ?? "90";
  const n = (national ?? "").replace(/\D/g, "");
  return n ? `+${dial} ${n}` : "";
}
