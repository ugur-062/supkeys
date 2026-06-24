/**
 * Ülke listesi — yurtdışı firma kaydı için. ISO 3166-1 alpha-2 kodu + Türkçe ad.
 * Türkiye (TR) varsayılan; kayıt/doğrulama bu koda göre dallanır (TR strict
 * VKN/TCKN, diğerleri gevşek format). Kapsamlı ama her ülke yok — gerekirse
 * eklenir. Liste alfabetik (Türkçe ada göre), TR en başta.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 (ör. "TR", "DE", "US"). */
  code: string;
  /** Türkçe ülke adı. */
  name: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: "TR", name: "Türkiye" },
  { code: "DE", name: "Almanya" },
  { code: "US", name: "Amerika Birleşik Devletleri" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AR", name: "Arjantin" },
  { code: "AL", name: "Arnavutluk" },
  { code: "AZ", name: "Azerbaycan" },
  { code: "BH", name: "Bahreyn" },
  { code: "BD", name: "Bangladeş" },
  { code: "BE", name: "Belçika" },
  { code: "BY", name: "Belarus" },
  { code: "AE", name: "Birleşik Arap Emirlikleri" },
  { code: "GB", name: "Birleşik Krallık" },
  { code: "BA", name: "Bosna-Hersek" },
  { code: "BR", name: "Brezilya" },
  { code: "BG", name: "Bulgaristan" },
  { code: "DZ", name: "Cezayir" },
  { code: "CN", name: "Çin" },
  { code: "DK", name: "Danimarka" },
  { code: "EC", name: "Ekvador" },
  { code: "ID", name: "Endonezya" },
  { code: "EE", name: "Estonya" },
  { code: "ET", name: "Etiyopya" },
  { code: "MA", name: "Fas" },
  { code: "FI", name: "Finlandiya" },
  { code: "FR", name: "Fransa" },
  { code: "GH", name: "Gana" },
  { code: "ZA", name: "Güney Afrika" },
  { code: "KR", name: "Güney Kore" },
  { code: "GE", name: "Gürcistan" },
  { code: "HR", name: "Hırvatistan" },
  { code: "IN", name: "Hindistan" },
  { code: "NL", name: "Hollanda" },
  { code: "IQ", name: "Irak" },
  { code: "IR", name: "İran" },
  { code: "IE", name: "İrlanda" },
  { code: "ES", name: "İspanya" },
  { code: "IL", name: "İsrail" },
  { code: "SE", name: "İsveç" },
  { code: "CH", name: "İsviçre" },
  { code: "IT", name: "İtalya" },
  { code: "IS", name: "İzlanda" },
  { code: "JP", name: "Japonya" },
  { code: "ME", name: "Karadağ" },
  { code: "QA", name: "Katar" },
  { code: "KZ", name: "Kazakistan" },
  { code: "KE", name: "Kenya" },
  { code: "CY", name: "Kıbrıs" },
  { code: "KG", name: "Kırgızistan" },
  { code: "CO", name: "Kolombiya" },
  { code: "KW", name: "Kuveyt" },
  { code: "LV", name: "Letonya" },
  { code: "LB", name: "Lübnan" },
  { code: "LU", name: "Lüksemburg" },
  { code: "LT", name: "Litvanya" },
  { code: "HU", name: "Macaristan" },
  { code: "MK", name: "Kuzey Makedonya" },
  { code: "MY", name: "Malezya" },
  { code: "MT", name: "Malta" },
  { code: "MX", name: "Meksika" },
  { code: "EG", name: "Mısır" },
  { code: "MD", name: "Moldova" },
  { code: "MN", name: "Moğolistan" },
  { code: "MR", name: "Moritanya" },
  { code: "NO", name: "Norveç" },
  { code: "UZ", name: "Özbekistan" },
  { code: "PK", name: "Pakistan" },
  { code: "PA", name: "Panama" },
  { code: "PE", name: "Peru" },
  { code: "PL", name: "Polonya" },
  { code: "PT", name: "Portekiz" },
  { code: "RO", name: "Romanya" },
  { code: "RU", name: "Rusya" },
  { code: "RS", name: "Sırbistan" },
  { code: "SA", name: "Suudi Arabistan" },
  { code: "SY", name: "Suriye" },
  { code: "CL", name: "Şili" },
  { code: "TJ", name: "Tacikistan" },
  { code: "TW", name: "Tayvan" },
  { code: "TH", name: "Tayland" },
  { code: "TN", name: "Tunus" },
  { code: "TM", name: "Türkmenistan" },
  { code: "UA", name: "Ukrayna" },
  { code: "OM", name: "Umman" },
  { code: "JO", name: "Ürdün" },
  { code: "VN", name: "Vietnam" },
  { code: "GR", name: "Yunanistan" },
  { code: "NZ", name: "Yeni Zelanda" },
  { code: "AU", name: "Avustralya" },
  { code: "AT", name: "Avusturya" },
  { code: "CA", name: "Kanada" },
  { code: "CZ", name: "Çekya" },
  { code: "SK", name: "Slovakya" },
  { code: "SI", name: "Slovenya" },
  { code: "SG", name: "Singapur" },
  { code: "PH", name: "Filipinler" },
  { code: "NG", name: "Nijerya" },
];

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

/** Geçerli bir ülke kodu mu (listede var mı). */
export function isValidCountryCode(code: string): boolean {
  return COUNTRY_CODES.has(code);
}

/** Ülke kodundan Türkçe adı; bulunamazsa kodu döner. */
export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** Türkiye mi (TR-özgü doğrulama/adres mantığı için). */
export function isTurkey(code: string | null | undefined): boolean {
  return (code ?? "TR") === "TR";
}
