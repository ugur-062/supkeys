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
  // ABD kayda kapalı (REGISTRATION_BLOCKED, 2026-09-27) → +1'in birincili Kanada.
  "1": "CA",
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

function countryForDial(dial: string, national: string, preferred?: string | null): string {
  for (const rule of NATIONAL_PREFIX_COUNTRY) {
    if (rule.dial === dial && rule.prefixes.some((p) => national.startsWith(p))) return rule.code;
  }
  // Seçili ülke bu kodu paylaşıyorsa (CA/US +1, GB/JE/GG/IM +44 …) o kalır —
  // saklanan değer yalnız "+1 …" olduğu için ülke başka türlü bilinemez.
  if (preferred && PHONE_DIAL_CODES[preferred] === dial) return preferred;
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
  preferred?: string | null,
): { code: string; national: string } {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("+")) {
    return { code: "TR", national: raw.replace(/[^\d ]/g, "").trim() };
  }
  const digits = raw.slice(1).replace(/\D/g, "");
  for (const dial of DIALS_LONGEST_FIRST) {
    if (digits.startsWith(dial)) {
      const national = digits.slice(dial.length);
      return { code: countryForDial(dial, national, preferred), national };
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

/**
 * Baştaki "0"ın numaranın PARÇASI olduğu ülkeler — ulusal önek (trunk) değil:
 * İtalya/San Marino/Vatikan sabit hatları (06 …), Fildişi Sahili, Kongo, Gabon,
 * Benin (yeni 10 haneli planlar). Diğer ülkelerde ya "0" ulusal önektir
 * (TR 0532, GB 07911, DE 030) ya da numara zaten 0 ile başlamaz → atmak zararsız.
 */
const LEADING_ZERO_SIGNIFICANT = new Set(["IT", "SM", "VA", "CI", "CG", "GA", "BJ"]);

/**
 * Ulusal numaradan TEK baştaki ulusal öneki ("0") atar: "05321234567" (TR) →
 * "5321234567", "07911123456" (GB) → "7911123456". Tek "0" (yazmaya yeni
 * başlanmış) ve "00" (uluslararası önek yazılıyor) dokunulmaz.
 */
export function stripTrunkPrefix(code: string, national: string): string {
  const n = national.replace(/\D/g, "");
  if (LEADING_ZERO_SIGNIFICANT.has(code)) return n;
  return n.length >= 2 && n[0] === "0" && n[1] !== "0" ? n.slice(1) : n;
}

/**
 * Ulusal numara alanına yazılan/yapıştırılan TAM uluslararası numara
 * ("+44 7911 123456", "0049 30 1234567"): ülke koduyla ayrıştırır ve ulusal
 * öneki atar. Uluslararası biçim değilse `null`; biçim uluslararası ama henüz
 * bilinen bir ülke koduna ulaşmadıysa ("+3", "00") `{ pending: true }`.
 */
export function parseInternationalInput(
  raw: string,
  preferred?: string | null,
): { code: string; national: string } | { pending: true } | null {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  let digits: string;
  if (compact.startsWith("+")) digits = compact.slice(1).replace(/\D/g, "");
  else if (compact.startsWith("00")) digits = compact.slice(2).replace(/\D/g, "");
  else return null;
  if (!DIALS_LONGEST_FIRST.some((d) => digits.startsWith(d))) return { pending: true };
  const { code, national } = parsePhone(`+${digits}`, preferred);
  return { code, national: stripTrunkPrefix(code, national) };
}
