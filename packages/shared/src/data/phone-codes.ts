/**
 * Telefon ülke kodları (dial code) — telefon giriş alanındaki ülke seçici için.
 * Kaynak `COUNTRY_TABLE` (tam ülke listesi, 2026-09-27); bayrak emojisi koddan
 * türetilir (codeToFlag) — ayrı görsel varlık gerekmez.
 */
import { COUNTRIES, COUNTRY_TABLE } from "./countries";

/** ISO alpha-2 → dial code (baştaki + olmadan). */
export const PHONE_DIAL_CODES: Record<string, string> = Object.fromEntries(
  COUNTRY_TABLE.map(([code, , dial]) => [code, dial]),
);

/**
 * Ortak dial code'da ayrıştırıcının seçtiği BİRİNCİL ülke. Numara yalnız
 * "+1 …" / "+7 …" olarak saklandığı için hangi ülke olduğu bilinmez; en olası
 * ülke seçilir (eskiden liste sırasındaki ilk ülke kazanıyordu: +7 → Kazakistan,
 * yani her Rus numarası Kazakistan görünüyordu).
 */
const PRIMARY_FOR_DIAL: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "44": "GB",
  "39": "IT",
  "47": "NO",
  "61": "AU",
  "64": "NZ",
  "90": "TR",
  "212": "MA",
  "262": "RE",
  "358": "FI",
  "590": "GP",
  "599": "CW",
  "672": "NF",
};

/**
 * Birincil ülkeden AYRILAN numara önekleri — dial code'dan sonraki ilk
 * haneler ülkeyi kesin söylüyor: Kazakistan +7 6xx/7xx, KKTC sabit hat +90 392.
 * (KKTC cep önekleri 533/548 Türkiye operatör aralıklarıyla ÇAKIŞIR → eklenmez;
 * yoksa Türk cep numaraları KKTC görünürdü.)
 */
const NATIONAL_PREFIX_COUNTRY: { dial: string; prefixes: string[]; code: string }[] = [
  { dial: "7", prefixes: ["6", "7"], code: "KZ" },
  { dial: "90", prefixes: ["392"], code: "XN" },
];

/** ISO alpha-2 kodundan bayrak emojisi (bölgesel gösterge sembolleri). */
export function codeToFlag(code: string): string {
  const cc = (code || "").toUpperCase();
  if (cc.length !== 2 || !/^[A-Z]{2}$/.test(cc) || cc === "XN" || cc === "XK") return "🏳️";
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

/** En uzun dial code önce — "+1268" (Antigua) "+1"den (ABD) önce denenmeli. */
const DIALS_LONGEST_FIRST = [...new Set(Object.values(PHONE_DIAL_CODES))].sort(
  (a, b) => b.length - a.length,
);

function countryForDial(dial: string, national: string): string {
  for (const rule of NATIONAL_PREFIX_COUNTRY) {
    if (rule.dial === dial && rule.prefixes.some((p) => national.startsWith(p))) return rule.code;
  }
  if (PRIMARY_FOR_DIAL[dial]) return PRIMARY_FOR_DIAL[dial]!;
  return PHONE_COUNTRIES.find((c) => c.dialCode === dial)?.code ?? "TR";
}

/**
 * Tam telefon değerini (ör. "+90 5xx...") ülke koduna + ulusal numaraya ayırır.
 * Bilinen dial code'lardan en uzun eşleşeni seçer; ortak kodda birincil ülke
 * (ve ulusal önek kuralları). "+" ile başlamayan değer Türkiye sayılır (eski
 * kayıtlar).
 */
export function parsePhone(
  value: string | null | undefined,
): { code: string; national: string } {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("+")) {
    return { code: "TR", national: raw.replace(/[^\d ]/g, "").trim() };
  }
  const digits = raw.slice(1).replace(/\D/g, "");
  for (const dial of DIALS_LONGEST_FIRST) {
    if (digits.startsWith(dial)) {
      const national = digits.slice(dial.length);
      return { code: countryForDial(dial, national), national };
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
