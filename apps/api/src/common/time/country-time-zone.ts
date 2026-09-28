/**
 * ÜLKE → SAAT DİLİMİ ve "alıcının mesai saati" — saf fonksiyonlar (2026-09-27).
 *
 * Kayıtsız tedarikçiye giden davet, ALICININ ülkesinde iş saatinde gönderilir
 * (gece 03:00'te gelen soğuk e-posta hem açılmaz hem de şikâyet riskini
 * artırır). Şemada saat dilimi alanı yok; ülkeden türetilir. Birden çok dilimi
 * olan ülkede iş merkezinin dilimi seçilir (ABD kapalı liste, RU Moskova,
 * KZ Almatı, BR São Paulo, AU Sidney, CA Toronto, CN Şanghay). Tanınmayan ülke
 * İstanbul'a düşer (platformun duvar saati).
 *
 * Kütüphane yok: `Intl.DateTimeFormat` ile yerel parçalar okunur, yerel saat
 * iki adımlı ofset hesabıyla UTC'ye çevrilir (yaz saati geçişinde de doğru).
 */
export const DEFAULT_TIME_ZONE = "Europe/Istanbul";

const COUNTRY_TIME_ZONE: Record<string, string> = {
  TR: "Europe/Istanbul", XN: "Asia/Nicosia", CY: "Asia/Nicosia",
  // Avrupa
  DE: "Europe/Berlin", AT: "Europe/Vienna", CH: "Europe/Zurich", FR: "Europe/Paris",
  IT: "Europe/Rome", ES: "Europe/Madrid", PT: "Europe/Lisbon", NL: "Europe/Amsterdam",
  BE: "Europe/Brussels", LU: "Europe/Luxembourg", GB: "Europe/London", IE: "Europe/Dublin",
  DK: "Europe/Copenhagen", SE: "Europe/Stockholm", NO: "Europe/Oslo", FI: "Europe/Helsinki",
  IS: "Atlantic/Reykjavik", PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava",
  HU: "Europe/Budapest", SI: "Europe/Ljubljana", HR: "Europe/Zagreb", RS: "Europe/Belgrade",
  BA: "Europe/Sarajevo", ME: "Europe/Podgorica", MK: "Europe/Skopje", AL: "Europe/Tirane",
  XK: "Europe/Belgrade", GR: "Europe/Athens", BG: "Europe/Sofia", RO: "Europe/Bucharest",
  MD: "Europe/Chisinau", UA: "Europe/Kyiv", BY: "Europe/Minsk", LT: "Europe/Vilnius",
  LV: "Europe/Riga", EE: "Europe/Tallinn", MT: "Europe/Malta", RU: "Europe/Moscow",
  // Kafkasya + Orta Asya
  GE: "Asia/Tbilisi", AM: "Asia/Yerevan", AZ: "Asia/Baku", KZ: "Asia/Almaty",
  UZ: "Asia/Tashkent", KG: "Asia/Bishkek", TJ: "Asia/Dushanbe", TM: "Asia/Ashgabat",
  MN: "Asia/Ulaanbaatar",
  // Orta Doğu + Kuzey Afrika
  AE: "Asia/Dubai", SA: "Asia/Riyadh", QA: "Asia/Qatar", KW: "Asia/Kuwait",
  BH: "Asia/Bahrain", OM: "Asia/Muscat", IQ: "Asia/Baghdad", JO: "Asia/Amman",
  LB: "Asia/Beirut", IL: "Asia/Jerusalem", PS: "Asia/Hebron", EG: "Africa/Cairo",
  LY: "Africa/Tripoli", TN: "Africa/Tunis", DZ: "Africa/Algiers", MA: "Africa/Casablanca",
  YE: "Asia/Aden",
  // Güney/Doğu Asya + Okyanusya
  IN: "Asia/Kolkata", PK: "Asia/Karachi", BD: "Asia/Dhaka", LK: "Asia/Colombo",
  NP: "Asia/Kathmandu", AF: "Asia/Kabul", CN: "Asia/Shanghai", HK: "Asia/Hong_Kong",
  MO: "Asia/Macau", TW: "Asia/Taipei", JP: "Asia/Tokyo", KR: "Asia/Seoul",
  VN: "Asia/Ho_Chi_Minh", TH: "Asia/Bangkok", MY: "Asia/Kuala_Lumpur", SG: "Asia/Singapore",
  ID: "Asia/Jakarta", PH: "Asia/Manila", KH: "Asia/Phnom_Penh", MM: "Asia/Yangon",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland",
  // Amerika
  CA: "America/Toronto", MX: "America/Mexico_City", BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago", CO: "America/Bogota",
  PE: "America/Lima", EC: "America/Guayaquil", UY: "America/Montevideo",
  PY: "America/Asuncion", BO: "America/La_Paz", VE: "America/Caracas",
  PA: "America/Panama", CR: "America/Costa_Rica", DO: "America/Santo_Domingo",
  GT: "America/Guatemala",
  // Sahra altı Afrika
  ZA: "Africa/Johannesburg", NG: "Africa/Lagos", KE: "Africa/Nairobi", GH: "Africa/Accra",
  ET: "Africa/Addis_Ababa", TZ: "Africa/Dar_es_Salaam", UG: "Africa/Kampala",
  SN: "Africa/Dakar", CI: "Africa/Abidjan", CM: "Africa/Douala", AO: "Africa/Luanda",
};

export function timeZoneForCountry(country: string | null | undefined): string {
  const cc = (country ?? "").trim().toUpperCase();
  return COUNTRY_TIME_ZONE[cc] ?? DEFAULT_TIME_ZONE;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Pazar … 6 = Cumartesi */
  weekday: number;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}

/** O dilimdeki duvar saati → UTC anı (yaz saati kaymasında iki adımlı düzeltme). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}

/** Mesai penceresi: hafta içi 09:00–16:00 (yerel). */
export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 16;

const isWeekday = (wd: number) => wd >= 1 && wd <= 5;

/**
 * `from` alıcının mesai penceresi içindeyse `from`; değilse sonraki hafta içi
 * günün 09:00'ı (+ `jitterMinutes`: aynı ana yığılmayı dağıtır).
 */
export function nextBusinessWindow(from: Date, timeZone: string, jitterMinutes = 0): Date {
  const p = zonedParts(from, timeZone);
  if (isWeekday(p.weekday) && p.hour >= BUSINESS_START_HOUR && p.hour < BUSINESS_END_HOUR) return from;
  // Aday gün: bugün (henüz 09:00 olmadıysa) ya da yarından itibaren ilk hafta içi.
  let dayOffset = isWeekday(p.weekday) && p.hour < BUSINESS_START_HOUR ? 0 : 1;
  for (let i = 0; i < 8; i++) {
    const probe = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
    const wd = probe.getUTCDay();
    if (isWeekday(wd)) {
      const start = zonedTimeToUtc(
        probe.getUTCFullYear(),
        probe.getUTCMonth() + 1,
        probe.getUTCDate(),
        BUSINESS_START_HOUR,
        0,
        timeZone,
      );
      return new Date(start.getTime() + Math.max(0, jitterMinutes) * 60_000);
    }
    dayOffset++;
  }
  return from;
}

/** Ülke kodu gibi görünen ama genel kullanılan uzantılar — ülke saymayız. */
const GENERIC_CC_TLDS = new Set(["CO", "ME", "TV", "IO", "AI", "CC", "WS", "FM", "AM", "LY", "TO", "NU", "GG"]);

/**
 * E-posta alan adının ülke uzantısı (`satis@firma.de` → DE; `.co.uk` → GB).
 * Genel kullanılan uzantılar ve bilinmeyenler `null` (saat dilimi varsayılana düşer).
 */
export function countryFromEmailDomain(email: string | null | undefined): string | null {
  return countryFromHost((email ?? "").split("@")[1]);
}

/** Alan adının ülke uzantısı (`firma.de` → DE); kural `countryFromEmailDomain` ile aynı. */
export function countryFromHost(hostRaw: string | null | undefined): string | null {
  const host = (hostRaw ?? "").trim().toLowerCase().replace(/\.$/, "");
  const tld = host.split(".").pop()?.toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(tld) || GENERIC_CC_TLDS.has(tld)) return null;
  const cc = tld === "UK" ? "GB" : tld;
  return COUNTRY_TIME_ZONE[cc] ? cc : null;
}
