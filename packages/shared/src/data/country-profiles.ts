import { COUNTRIES, isValidCountryCode } from "./countries";
import { countryHasIban } from "./iban-countries";

/**
 * ÜLKE PROFİLLERİ — kayıt kapısının ve belge kümesinin TEK KAYNAĞI.
 *
 * KAYIT TÜM ÜLKELERE AÇIK (2026-09-27, kullanıcı: "tüm ülkeler kayıt
 * olabilsin, Amerika hariç"). 2026-09-01'den beri yalnız sekiz ülke açıktı.
 * Kapı artık "açık liste" değil "KAPALI liste": `REGISTRATION_BLOCKED`
 * dışındaki her geçerli ülke kodu kayıt olabilir.
 *
 * Kapalılar (kullanıcı kararı aynı gün):
 *  · ABD ve ABD hukukuna tabi topraklar (PR, GU, VI, AS, MP).
 *  · Kapsamlı yaptırım ülkeleri İran, Kuzey Kore, Suriye, Küba — kullandığımız
 *    ABD'li altyapı sağlayıcılarının (Vercel, Cloudflare, Supabase, Resend)
 *    kullanım koşulları bu ülkelerden kullanımı yasaklıyor.
 *
 * Belge kümesi: aşağıdaki ÖZEL profiller (TR, KKTC, sekiz ülkenin bölgesel
 * sistemi) aynen; profili olmayan her ülke VARSAYILAN yabancı profili alır —
 * sicil + vergi kaydı + yetkili kimliği/pasaportu (kullanıcı kararı: 3 belge),
 * banka biçimi IBAN kaydından (`iban-countries.ts`), AB üyeleri VIES grubunda.
 * Doğrulama yine İSTİSNASIZ manuel (admin `setVerification`).
 */

/** Yeni kayıt ALINMAYAN ülkeler (bkz. dosya başı). Mevcut kayıtlara dokunmaz. */
export const REGISTRATION_BLOCKED: ReadonlySet<string> = new Set([
  "US", "PR", "GU", "VI", "AS", "MP",
  "IR", "KP", "SY", "CU",
]);

/** AB üyeleri — KDV numarası VIES ile doğrulanabilir. */
export const EU_VAT_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

const AFRICA = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD", "CG", "CI", "DJ",
  "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG",
  "MW", "ML", "MR", "MU", "YT", "MA", "MZ", "NA", "NE", "NG", "RE", "RW", "SH", "ST", "SN",
  "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
]);

export type CountryGroup =
  | "TR"
  | "TURKIC"
  | "RU"
  | "CN"
  | "GULF"
  | "EU"
  | "AFRICA"
  | "OTHER";

/**
 * Belge türü anahtarları. Mevcut 6 sabit kolonla uyumlu olanlar aynı adı
 * taşır; ülkeye özel yeni türler (tradeLicense, businessLicense…) Faz 2'de
 * gelecek esnek belge tablosunu bekler.
 */
export type DocRequirement =
  | "taxPlate"
  | "tradeRegistry"
  | "signatureCircular"
  | "activityCert"
  | "idFront"
  | "idBack";

export interface CountryProfile {
  code: string;
  group: CountryGroup;
  /** Kayıt formunda seçilebilir mi. false → yeni kayıt alınmaz. */
  registrationOpen: boolean;
  /** Bu ülkede ZORUNLU belge türleri. */
  requiredDocs: DocRequirement[];
  /** Vergi/sicil no doğrulayıcı anahtarı. */
  taxIdRule: TaxIdRule;
  /** AB KDV numarası VIES ile doğrulanabilir mi (Faz 4). */
  viesSupported: boolean;
  /**
   * Vergi/sicil numarasının o ülkedeki RESMÎ adı — kullanıcı formda ne
   * gireceğini bilsin ("Vergi No" demek Çinli kullanıcıya yardımcı olmaz).
   */
  taxIdLabel: string;
  /**
   * Ülke IBAN sistemini kullanıyor mu.
   *
   * NEDEN ALAN (2026-09-14, kullanıcı: "bu evrensel bir sistem, yurtdışı
   * yurtiçi firması diye bir şey yok"): doğrulama ekranı banka bilgisini
   * "yurt dışında opsiyonel" sayıyordu. Doğrusu opsiyonel yapmak değil,
   * ÜLKEYE GÖRE doğru biçimi istemek — RU/UZ/CN IBAN kullanmaz, hesap
   * numarası verir; kalan beş ülke IBAN'dır ve mod-97 ile doğrulanır.
   */
  usesIban: boolean;
}

export type TaxIdRule =
  | "TR_VKN"
  | "RU_INN"
  | "CN_USCC"
  | "AE_TRN"
  | "KZ_BIN"
  | "UZ_INN"
  | "AZ_TIN"
  | "GENERIC";

/** TR dışı ortak temel: sicil kaydı + vergi belgesi + yetkili kimlik. */
const BASE_FOREIGN: DocRequirement[] = ["tradeRegistry", "taxPlate", "idFront"];

export const COUNTRY_PROFILES: readonly CountryProfile[] = [
  {
    code: "TR",
    group: "TR",
    registrationOpen: true,
    // Mevcut TR akışı — 6 belge, hiç değişmiyor.
    requiredDocs: [
      "taxPlate",
      "tradeRegistry",
      "signatureCircular",
      "activityCert",
      "idFront",
      "idBack",
    ],
    taxIdRule: "TR_VKN",
    viesSupported: false,
    taxIdLabel: "Vergi Kimlik No (VKN) / TC Kimlik No",
    usesIban: true,
  },
  {
    // KKTC'nin ISO 3166-1 kodu YOKTUR. ISO'nun kullanıcıya ayrılmış X-aralığı
    // kullanıldı (XN = Northern Cyprus). Bu kod DIŞ sistemlere gönderilmemeli;
    // yalnız platform içi ayrım için.
    code: "XN",
    group: "TR",
    registrationOpen: true,
    // Türk ticaret pratiği ama ayrı sicil/vergi dairesi: imza sirküleri ve
    // faaliyet belgesi karşılığı her zaman aynı biçimde olmadığı için TR'nin
    // 6'lısı değil, 4 belge.
    requiredDocs: ["tradeRegistry", "taxPlate", "signatureCircular", "idFront"],
    taxIdRule: "GENERIC",
    viesSupported: false,
    taxIdLabel: "Vergi No (KKTC)",
    usesIban: true,
  },
  {
    code: "RU",
    group: "RU",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "RU_INN",
    viesSupported: false,
    taxIdLabel: "ИНН (INN) / ОГРН (OGRN)",
    usesIban: false,
  },
  {
    code: "AZ",
    group: "TURKIC",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "AZ_TIN",
    viesSupported: false,
    taxIdLabel: "VÖEN (Vergi Ödəyicisinin Eyniləşdirmə Nömrəsi)",
    usesIban: true,
  },
  {
    code: "KZ",
    group: "TURKIC",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "KZ_BIN",
    viesSupported: false,
    taxIdLabel: "БИН (BIN) — 12 hane",
    usesIban: true,
  },
  {
    code: "UZ",
    group: "TURKIC",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "UZ_INN",
    viesSupported: false,
    taxIdLabel: "СТИР / ИНН — 9 hane",
    usesIban: false,
  },
  {
    code: "CN",
    group: "CN",
    registrationOpen: true,
    // 营业执照 (Business License) TEK belgede sicil + vergi + yasal temsilci
    // taşır; ayrıca vergi belgesi istemek gereksiz tekrar olur.
    requiredDocs: ["tradeRegistry", "idFront"],
    taxIdRule: "CN_USCC",
    viesSupported: false,
    taxIdLabel: "统一社会信用代码 (USCC) — 18 karakter",
    usesIban: false,
  },
  {
    code: "AE",
    group: "GULF",
    registrationOpen: true,
    // Trade License zorunlu; TRN yalnız KDV mükellefinde var, o yüzden vergi
    // belgesi zorunlu DEĞİL (serbest bölge şirketlerinin çoğunda yok).
    requiredDocs: ["tradeRegistry", "idFront"],
    taxIdRule: "AE_TRN",
    viesSupported: false,
    taxIdLabel: "TRN (Tax Registration Number) — 15 hane",
    usesIban: true,
  },
] as const;

const BY_CODE = new Map(COUNTRY_PROFILES.map((p) => [p.code, p]));

/** KKTC gibi ISO dışı kodların görünen adı (COUNTRIES'te yoklar). */
const EXTRA_NAMES: Record<string, string> = {
  XN: "Kuzey Kıbrıs Türk Cumhuriyeti",
};

/**
 * Profili OLMAYAN geçerli ülke için varsayılan yabancı profil (2026-09-27):
 * 3 belge, genel vergi/sicil etiketi, IBAN kaydından banka biçimi, AB → VIES.
 */
function defaultProfile(code: string): CountryProfile {
  const eu = EU_VAT_COUNTRIES.has(code);
  return {
    code,
    group: eu ? "EU" : AFRICA.has(code) ? "AFRICA" : "OTHER",
    registrationOpen: !REGISTRATION_BLOCKED.has(code),
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "GENERIC",
    viesSupported: eu,
    taxIdLabel: eu ? "VAT No / Tax ID" : "Tax ID / Registration No",
    usesIban: countryHasIban(code),
  };
}

/**
 * Ülkenin profili: özel profil ya da (geçerli ülke koduysa) varsayılan yabancı
 * profil. Bilinmeyen/boş kod → null.
 */
export function getCountryProfile(
  code: string | null | undefined,
): CountryProfile | null {
  if (!code) return null;
  const c = code.toUpperCase();
  return BY_CODE.get(c) ?? (isValidCountryCode(c) ? defaultProfile(c) : null);
}

/** Banka alanı IBAN mı (değilse hesap no + SWIFT). Bilinmeyen ülke → IBAN'sız. */
export function countryUsesIban(code: string | null | undefined): boolean {
  return getCountryProfile(code)?.usesIban ?? false;
}

/** Kayıt formunda gösterilecek ülkeler (kod + Türkçe ad): TR başta, sonra alfabetik. */
export function registrationCountries(): { code: string; name: string }[] {
  return COUNTRIES.filter((c) => !REGISTRATION_BLOCKED.has(c.code)).map((c) => ({
    code: c.code,
    name: EXTRA_NAMES[c.code] ?? c.name,
  }));
}

/** Yeni kayıt bu ülkeden alınıyor mu: geçerli kod ∧ kapalı listede değil. */
export function isRegistrationOpen(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.toUpperCase();
  return isValidCountryCode(c) && !REGISTRATION_BLOCKED.has(c);
}

/**
 * Ülkenin zorunlu belge kümesi. Profili olmayan ülke (ve bilinmeyen kod)
 * ortak yabancı temelini alır — eski kayıtlar belgesiz kalmasın.
 */
export function requiredDocsForCountry(
  code: string | null | undefined,
): DocRequirement[] {
  return getCountryProfile(code)?.requiredDocs ?? BASE_FOREIGN;
}

// NOT: burada bir zamanlar `enhancedDueDiligence` bayrağı vardı (Rusya için
// "zorunlu manuel inceleme"). KALDIRILDI: firma doğrulaması zaten İSTİSNASIZ
// manuel — `VERIFIED` yalnız admin tarafından `setVerification` ile yazılır,
// otomatik onay yolu HİÇ YOK. Bayrak operasyonel olarak hiçbir şey yapmıyor,
// yalnız "bir şey yapıyormuş" izlenimi veriyordu. Ülkeden bağımsız tek ve
// dürüst kural: her firma elle incelenir.
