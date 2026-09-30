/**
 * Telefon ülke kodları (dial code) — telefon giriş alanındaki ülke seçici için.
 * Kaynak `COUNTRY_TABLE` (tam ülke listesi, 2026-09-27); bayrak emojisi koddan
 * türetilir (codeToFlag) — ayrı görsel varlık gerekmez.
 */
import { COUNTRIES, COUNTRY_TABLE } from "./countries";

/**
 * Latin dışı rakamları ASCII rakama çevirir: Arap-Hint (٠-٩, U+0660), Farsça/
 * Urduca (۰-۹, U+06F0) ve tam genişlikli (０-９, U+FF10). Mısırlı/İranlı
 * kullanıcının klavyesi bu rakamları yazar; eskiden `\D` temizliği onları
 * SESSİZCE düşürüyordu ("٠٥٣٢…" → boş numara). Telefon ayrıştırıcıları ve vergi
 * numarası normalizasyonu bu tek fonksiyondan geçer.
 */
export function normalizeDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19]/g, (ch) => {
    const c = ch.charCodeAt(0);
    const base = c >= 0xff10 ? 0xff10 : c >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(c - base);
  });
}

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
  // Birden çok alan kodlu NANP ülkeleri: dial code "1", ulusal numara 10 hane
  // (alan kodu dahil) — ülke alan kodundan (derin denetim LU-10).
  { dial: "1", prefixes: ["809", "829", "849"], code: "DO" },
  { dial: "1", prefixes: ["876", "658"], code: "JM" },
  { dial: "1", prefixes: ["787", "939"], code: "PR" },
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

/** Tam genişlikli artı (＋) ve Latin dışı rakamlar → ASCII; baş/son boşluk atılır. */
function cleanPhoneText(value: string | null | undefined): string {
  return normalizeDigits((value ?? "").replace(/＋/g, "+")).trim();
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
  const raw = cleanPhoneText(value);
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
  const n = normalizeDigits(national ?? "").replace(/\D/g, "");
  return n ? `+${dial} ${n}` : "";
}

/**
 * ULUSAL NUMARA UZUNLUĞU (ülke kodu ve ulusal önek HARİÇ hane sayısı) —
 * ITU-T E.164 ulusal numara planlarından, sabit hat + cep birlikte; emin
 * olunmayan yerde GENİŞ tutuldu (geçerli numarayı reddetmek, biraz gevşek bir
 * numarayı kabul etmekten pahalı: kayıt kapıda kalır).
 *
 * Neden tablo (2026-09-27): kayıt formu "en az 10 hane" diyordu → Andorra (6),
 * Lüksemburg sabit hattı (4-11), Faroe/Grönland (6), Solomon Adaları (5-7)
 * firmaları hiç kaydolamıyordu; öte yandan Türkiye'de 11 hane ("+90 0532…",
 * Rus kullanıcının bayrağı değiştirmeden yazdığı "+90 8916…") geçiyordu.
 *
 * Listede olmayan ülke: 6 hane – (15 − ülke kodu uzunluğu) (E.164 toplam ≤15).
 * NANP ada ülkeleri (+1 268 …) alan kodu dial code'da → 7 hane; +1 → 10
 * (birden çok alan kodlu DO/JM/PR dahil — alan kodu ulusal numarada).
 */
const NATIONAL_LENGTHS: Readonly<Record<string, readonly [number, number]>> = {
  // Türkiye ve komşular
  TR: [10, 10], XN: [10, 10], AZ: [9, 9], GE: [9, 9], AM: [8, 8], IR: [10, 10], IQ: [8, 10], SY: [8, 9],
  // Eski SSCB / Orta Asya
  RU: [10, 10], KZ: [10, 10], BY: [9, 9], UA: [9, 9], MD: [8, 8], UZ: [9, 9], TM: [8, 8], TJ: [9, 9],
  KG: [9, 9], MN: [8, 8],
  // Avrupa
  DE: [6, 13], AT: [4, 13], CH: [9, 9], FR: [9, 9], IT: [6, 11], SM: [6, 10], VA: [6, 11], ES: [9, 9],
  PT: [9, 9], GB: [9, 10], IM: [9, 10], JE: [9, 10], GG: [9, 10], IE: [7, 9], NL: [9, 9], BE: [8, 9],
  LU: [4, 11], MC: [8, 9], LI: [7, 9], AD: [6, 9], DK: [8, 8], SE: [6, 10], NO: [8, 8], SJ: [8, 8],
  FI: [5, 12], AX: [5, 12], IS: [7, 9], FO: [6, 6], GL: [6, 6], PL: [9, 9], CZ: [9, 9], SK: [9, 9],
  HU: [8, 9], RO: [9, 9], BG: [7, 9], GR: [10, 10], CY: [8, 8], MT: [8, 8], SI: [8, 8], HR: [8, 9],
  RS: [8, 10], BA: [8, 9], ME: [8, 8], MK: [8, 8], AL: [8, 9], XK: [8, 9], EE: [7, 8], LV: [8, 8],
  LT: [8, 8], GI: [8, 8],
  // Orta Doğu ve Körfez
  IL: [8, 9], PS: [8, 9], JO: [8, 9], LB: [7, 8], SA: [8, 9], AE: [8, 9], QA: [8, 8], KW: [8, 8],
  BH: [8, 8], OM: [8, 8], YE: [7, 9], EG: [8, 10],
  // Asya - Pasifik
  CN: [8, 12], HK: [8, 8], MO: [8, 8], TW: [8, 9], JP: [9, 10], KR: [8, 11], KP: [8, 10], IN: [10, 10],
  PK: [9, 10], BD: [8, 10], LK: [9, 9], NP: [8, 10], BT: [7, 8], MV: [7, 7], AF: [9, 9], ID: [7, 12],
  MY: [8, 10], SG: [8, 8], TH: [8, 9], VN: [9, 10], PH: [8, 10], KH: [8, 9], LA: [8, 10], MM: [7, 10],
  BN: [7, 7], TL: [7, 8], AU: [9, 9], CX: [9, 9], CC: [9, 9], NZ: [8, 10], PG: [7, 8], FJ: [7, 7], SB: [5, 7], VU: [5, 7],
  NC: [6, 6], PF: [6, 8], WS: [5, 7], TO: [5, 7], KI: [5, 8], TV: [5, 6], NR: [7, 7], NU: [4, 7],
  TK: [4, 7], CK: [5, 5], WF: [6, 6], FM: [7, 7], MH: [7, 7], PW: [7, 7],
  // Amerika
  MX: [10, 10], BR: [10, 11], AR: [10, 11], CL: [9, 9], CO: [8, 10], PE: [8, 9], VE: [10, 10],
  EC: [8, 9], BO: [8, 8], PY: [7, 9], UY: [8, 8], CR: [8, 8], PA: [7, 8], GT: [8, 8], SV: [8, 8],
  HN: [8, 8], NI: [8, 8], CU: [8, 8], HT: [8, 8], BZ: [7, 7], GY: [7, 7], SR: [6, 7], GF: [9, 9],
  GP: [9, 9], MQ: [9, 9], BL: [9, 9], MF: [9, 9], PM: [6, 6], AW: [7, 7], CW: [7, 8], BQ: [7, 7],
  FK: [5, 5],
  // Afrika
  ZA: [9, 9], NG: [7, 10], MA: [9, 9], EH: [9, 9], DZ: [8, 9], TN: [8, 8], LY: [8, 9], SD: [9, 9],
  SS: [9, 9], KE: [7, 9], ET: [9, 9], GH: [9, 9], TZ: [9, 9], UG: [9, 9], SN: [9, 9], CI: [10, 10],
  CM: [9, 9], AO: [9, 9], RE: [9, 9], YT: [9, 9], MU: [7, 8], SC: [7, 7], KM: [7, 7], DJ: [8, 8],
  CV: [7, 7], ST: [7, 7], GM: [7, 7], LR: [7, 9], SL: [8, 8], GW: [7, 9], BW: [7, 8], NA: [7, 10],
  ZW: [7, 10], ZM: [9, 9], MW: [7, 9], MZ: [8, 9], MG: [9, 9], RW: [9, 9], BI: [8, 8], SO: [7, 9],
  ER: [7, 7], LS: [8, 8], SZ: [8, 8], BJ: [8, 10], TG: [8, 8], BF: [8, 8], ML: [8, 8], NE: [8, 8],
  TD: [8, 8], MR: [8, 8], GN: [8, 9], GQ: [9, 9], GA: [7, 9], CG: [9, 9], CD: [7, 9], CF: [8, 8],
  SH: [4, 5],
};

/** Ülkenin ulusal numara uzunluk aralığı (ülke kodu ve ulusal önek hariç). */
export function phoneNationalLength(code: string): { min: number; max: number } {
  const cc = (code || "").toUpperCase();
  const dial = PHONE_DIAL_CODES[cc] ?? "";
  const e164Max = 15 - dial.length;
  const row = NATIONAL_LENGTHS[cc];
  if (row) return { min: row[0], max: Math.min(row[1], e164Max) };
  if (dial === "1") return { min: 10, max: 10 };
  if (dial.length === 4 && dial.startsWith("1")) return { min: 7, max: 7 };
  return { min: 6, max: e164Max };
}

/**
 * Baştaki "0"ın numaranın PARÇASI olduğu ülkeler — ulusal önek (trunk) değil:
 * İtalya/San Marino/Vatikan sabit hatları (06 …), Fildişi Sahili, Kongo, Gabon,
 * Benin (yeni 10 haneli planlar). Diğer ülkelerde ya "0" ulusal önektir
 * (TR 0532, GB 07911, DE 030) ya da numara zaten 0 ile başlamaz → atmak zararsız.
 */
const LEADING_ZERO_SIGNIFICANT = new Set(["IT", "SM", "VA", "CI", "CG", "GA", "BJ"]);

/**
 * Ulusal önek "8" olan eski SSCB ülkeleri (RU/KZ "8 916 …", BY "8 029 …",
 * TM "8 12 …", TJ "8 37 …"). Rusya ve Kazakistan'da ulusal önek artık resmen
 * "8" olmaya devam ediyor; kullanıcı numarayı ülke içindeki alışkanlığıyla yazar.
 */
const TRUNK_EIGHT = new Set(["RU", "KZ", "BY", "TM", "TJ"]);

/**
 * Ulusal numaradan baştaki ulusal öneki (trunk) atar:
 *  · "0" (çoğu ülke): "05321234567" (TR) → "5321234567", "07911123456" (GB) →
 *    "7911123456". Tek "0" (yazmaya yeni başlanmış) ve "00" (uluslararası önek
 *    yazılıyor) dokunulmaz; İtalya vb. `LEADING_ZERO_SIGNIFICANT` hariç.
 *  · "8" (RU/KZ/BY/TM/TJ): "8" bu ülkelerde numaranın KENDİSİNİN de ilk hanesi
 *    olabilir (RU 812 St. Petersburg, 800 ücretsiz hat) → önek YALNIZ numara
 *    ulusal uzunluğun bir fazlasına ulaşınca atılır ("89161234567" → 11 hane →
 *    "9161234567"). Yazma sürerken "8…" olduğu gibi kalır, son hanede düşer.
 *    Belarus'ta alan kodunun "0"ı önekle birlikte yazılır ("8 029 …") → "80".
 *  · "06" (Macaristan): Macar numarası 0 ile başlamadığı için "06" kesin
 *    önektir; iki hane yazılır yazılmaz atılsa kullanıcının yazdığı her şey
 *    kaybolurdu → üçüncü hanede atılır ("063…" → "3…").
 * Latin dışı rakamlar önce ASCII'ye çevrilir.
 */
export function stripTrunkPrefix(code: string, national: string): string {
  const n = normalizeDigits(national).replace(/\D/g, "");
  if (LEADING_ZERO_SIGNIFICANT.has(code)) return n;
  if (TRUNK_EIGHT.has(code)) {
    const { max } = phoneNationalLength(code);
    if (code === "BY" && n.startsWith("80") && n.length === max + 2) return n.slice(2);
    if (n[0] === "8" && n.length === max + 1) return n.slice(1);
  }
  if (code === "HU" && n.startsWith("06")) return n.length >= 3 ? n.slice(2) : n;
  return n.length >= 2 && n[0] === "0" && n[1] !== "0" ? n.slice(1) : n;
}

/**
 * Ulusal numara alanına yazılan/yapıştırılan TAM uluslararası numara
 * ("+44 7911 123456", "0049 30 1234567"): ülke koduyla ayrıştırır ve ulusal
 * öneki atar. Uluslararası biçim değilse `null`; biçim uluslararası ama henüz
 * bilinen bir ülke koduna ulaşmadıysa ("+3", "00") `{ pending: true }`.
 * Önek atılınca ülke yeniden belirlenir ("+7 8 701 …" → Kazakistan).
 */
export function parseInternationalInput(
  raw: string,
  preferred?: string | null,
): { code: string; national: string } | { pending: true } | null {
  const compact = cleanPhoneText(raw).replace(/[\s().-]/g, "");
  let digits: string;
  if (compact.startsWith("+")) digits = compact.slice(1).replace(/\D/g, "");
  else if (compact.startsWith("00")) digits = compact.slice(2).replace(/\D/g, "");
  else return null;
  if (!DIALS_LONGEST_FIRST.some((d) => digits.startsWith(d))) return { pending: true };
  const first = parsePhone(`+${digits}`, preferred);
  const national = stripTrunkPrefix(first.code, first.national);
  if (national === first.national) return first;
  const dial = PHONE_DIAL_CODES[first.code] ?? "";
  return { code: parsePhone(`+${dial}${national}`, preferred).code, national };
}

/**
 * Telefon değeri GEÇERLİ mi — ülke koduna göre ulusal uzunluk (TEK KAYNAK:
 * kayıt formu, Hesap Bilgileri, kullanıcı/adres formları ve API DTO'ları).
 * Saklanan biçim "+<kod> <numara>"; "+"sız ESKİ kayıtlar Türkiye numarası
 * sayılır (ulusal önek atılarak ölçülür), "00" uluslararası önek "+" sayılır.
 * Boş değer GEÇERSİZ — isteğe bağlı alanlarda boşluğu çağıran ayrıca kabul eder.
 */
export function isValidPhoneNumber(
  value: string | null | undefined,
  preferred?: string | null,
): boolean {
  let raw = cleanPhoneText(value);
  if (!raw || !/^\+?[0-9 ().\-/]+$/.test(raw)) return false;
  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;
  let code: string;
  let national: string;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (!DIALS_LONGEST_FIRST.some((d) => digits.startsWith(d))) return false;
    ({ code, national } = parsePhone(raw, preferred));
  } else {
    code = "TR";
    national = stripTrunkPrefix("TR", raw);
  }
  const { min, max } = phoneNationalLength(code);
  const len = national.replace(/\D/g, "").length;
  return len >= min && len <= max;
}
