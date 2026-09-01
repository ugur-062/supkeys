import { COUNTRIES } from "./countries";

/**
 * ÜLKE PROFİLLERİ — kayıt kapısının ve belge kümesinin TEK KAYNAĞI.
 *
 * Sorun: kayıt 98 ülkeye açıktı ve belge kümesi İKİLİYDİ (TR → 6 belge,
 * "yabancı" → 3 belge). Yani Çinli bir firmadan da Rus bir firmadan da aynı
 * üç belge isteniyordu; oysa ikisinin sicil/vergi sistemi tamamen farklı.
 *
 * Karar (2026-09-01): kayıt SEKİZ ülkeye açılır — Türkiye + yakın ticaret
 * çemberi. Gerekçe `docs/plan-country-registration.md`. Özet: sekizinde de
 * "Türk alıcı ↔ bölgesel tedarikçi" akışı gerçek, belge sistemi tanımlanabilir
 * ve ciddi bir uyum sorusu yok.
 *
 * AB ve Afrika BİLİNÇLİ olarak dışarıda:
 *  · AB — Rusya ile aynı pazar yerinde olması hukuk görüşü ister; ertelemenin
 *    maliyeti YOK çünkü VIES 27 ülkede aynı doğrulamayı yapar, sonradan tek
 *    seferde eklenir.
 *  · Afrika — AB'nin tersi: ortak doğrulama altyapısı yok, 54 ayrı sicil
 *    sistemi. Toptan değil, talep geldikçe tek tek eklenir.
 *
 * ÖNEMLİ: `COUNTRIES` (98 ülke) KISALTILMADI. Kapı yalnız YENİ KAYDA
 * uygulanır; mevcut firmaların ülkesi gösterilebilmeli ve adres defterinde
 * her ülke seçilebilmeli (teslimat adresi kayıt kapısına tabi değil).
 */

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
  },
  {
    code: "RU",
    group: "RU",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "RU_INN",
    viesSupported: false,
    taxIdLabel: "ИНН (INN) / ОГРН (OGRN)",
  },
  {
    code: "AZ",
    group: "TURKIC",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "AZ_TIN",
    viesSupported: false,
    taxIdLabel: "VÖEN (Vergi Ödəyicisinin Eyniləşdirmə Nömrəsi)",
  },
  {
    code: "KZ",
    group: "TURKIC",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "KZ_BIN",
    viesSupported: false,
    taxIdLabel: "БИН (BIN) — 12 hane",
  },
  {
    code: "UZ",
    group: "TURKIC",
    registrationOpen: true,
    requiredDocs: BASE_FOREIGN,
    taxIdRule: "UZ_INN",
    viesSupported: false,
    taxIdLabel: "СТИР / ИНН — 9 hane",
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
  },
] as const;

const BY_CODE = new Map(COUNTRY_PROFILES.map((p) => [p.code, p]));

/** KKTC gibi ISO dışı kodların görünen adı (COUNTRIES'te yoklar). */
const EXTRA_NAMES: Record<string, string> = {
  XN: "Kuzey Kıbrıs Türk Cumhuriyeti",
};

export function getCountryProfile(
  code: string | null | undefined,
): CountryProfile | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

/** Kayıt formunda gösterilecek ülkeler (kod + ad), profil sırasıyla. */
export function registrationCountries(): { code: string; name: string }[] {
  return COUNTRY_PROFILES.filter((p) => p.registrationOpen).map((p) => ({
    code: p.code,
    name:
      EXTRA_NAMES[p.code] ??
      COUNTRIES.find((c) => c.code === p.code)?.name ??
      p.code,
  }));
}

/** Yeni kayıt bu ülkeden alınıyor mu. */
export function isRegistrationOpen(code: string | null | undefined): boolean {
  return getCountryProfile(code)?.registrationOpen === true;
}

/**
 * Ülkenin zorunlu belge kümesi. Profili olmayan (kapalı ama MEVCUT) ülkeler
 * için ortak yabancı temeli — eski kayıtlar belgesiz kalmasın.
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
