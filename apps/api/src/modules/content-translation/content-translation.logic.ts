import { createHash } from "node:crypto";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rothern/i18n";

/**
 * İÇERİK ÇEVİRİSİ — SAF MANTIK (test edilebilir, DI'sız).
 *
 * Kaynak alan kümesi (`SourceFields`), model istemi, çıktı doğrulama ve
 * okuma yolundaki "üzerine yazma" yardımcıları burada. Servis yalnız DB ve
 * sağlayıcı çağrısını bağlar.
 *
 * KURAL — uydurma yok: model kaynakta olmayan SAYI üretemez; her metin
 * alanındaki rakam dizileri hedefte de bulunmak zorunda (binlik ayraç
 * farkı normalize edilir: "2.400" ≡ "2,400" ≡ "2 400"). Liste alanları
 * (anahtar kelime, kalem adı, nitelik) kaynakla AYNI uzunlukta dönmeli.
 */
export type TranslatableEntityType = "PRODUCT" | "LISTING" | "COMPANY";
export const TRANSLATABLE_ENTITY_TYPES = ["PRODUCT", "LISTING", "COMPANY"] as const;

export interface Pair {
  src: string;
  dst: string;
}
export interface AttributePair {
  label: Pair;
  value: Pair;
}

export interface ProductSource {
  name: string;
  description: string | null;
  keywords: string[];
  /** Etiketlenmiş nitelikler (`labelAttributes` çıktısı, birim hariç). */
  attributes: { label: string; value: string }[];
  /** SERBEST metin ölçü birimi (koddan gelmeyen, örn. "kullanıcı"); koda bağlı birimler katalogdan çevrilir, buraya girmez. */
  unit?: string;
  /** Teknik şartname (herkese açık ürün sayfası) — YALNIZ doluyken anahtar var (eski kayıtların kaynak özeti değişmesin). */
  specification?: string;
}
export interface ListingSource {
  title: string;
  description: string | null;
  keywords: string[];
  /** Kalem adları (herkese açık kısım). */
  items: string[];
  /*
   * Teklif verenin gördüğü serbest metinler (2026-09-25 kapsam turu). HEPSİ
   * yalnız doluyken anahtar olarak girer — boş anahtar eklemek eski taleplerin
   * kaynak özetini değiştirip toplu yeniden çeviri (maliyet) tetiklerdi.
   */
  /** Şartlar ve koşullar. */
  terms?: string;
  /** Serbest ödeme şartı notu. */
  paymentNote?: string;
  /** Kalem açıklaması + teknik şartname metinleri (tekil, metinle eşlenir). */
  details?: string[];
  /** Kalem soruları (tekil, metinle eşlenir). */
  questions?: string[];
}
export interface CompanySource {
  aboutText: string | null;
  services: string[];
  industry: string | null;
}
export type SourceFields = ProductSource | ListingSource | CompanySource;

/** Saklanan çeviri — listeler kaynak→hedef ÇİFTİ taşır: kaynak sonradan değişirse eşleme metinle yapılır, sırayla değil. */
export interface ProductTranslation {
  name: string;
  description: string | null;
  keywords: Pair[];
  attributes: AttributePair[];
  unit?: string | null;
  specification?: string | null;
}
export interface ListingTranslation {
  title: string;
  description: string | null;
  keywords: Pair[];
  items: Pair[];
  terms?: string | null;
  paymentNote?: string | null;
  details?: Pair[];
  questions?: Pair[];
}
export interface CompanyTranslation {
  aboutText: string | null;
  services: Pair[];
  industry: string | null;
}
export type TranslationFields = ProductTranslation | ListingTranslation | CompanyTranslation;

/**
 * Kaynak dil: modelin döndürdüğü ISO 639-1 kodu ("tr", "de", "zh"…) ya da
 * belirlenemediyse "und" (2026-09-27: kayıt tüm ülkelere açıldı — Almanca,
 * Çince kaynak artık olağan; not "kaynak: Almanca" diyebilsin diye kod saklanır).
 * Kayıt sırasında (çeviri gelmeden) sahibin ülkesinden tahmin de yazılır:
 * Türkiye/KKTC → "tr", diğerleri → "und" (bkz. `readyLocales`).
 */
export type ModelLocale = string;

/** Model çıktısındaki kaynak dil → küçük harf ISO kodu; tanınmazsa "und". */
export function normalizeSourceLocale(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase().split(/[-_]/)[0]! : "";
  if (v === "iw") return "he";
  return /^[a-z]{2,3}$/.test(v) && v !== "other" ? v : "und";
}

export interface ParsedTranslation {
  sourceLocale: ModelLocale;
  perLocale: Record<Locale, TranslationFields>;
}

/* ------------------------------------------------------------------ */
/* Kaynak özeti                                                        */
/* ------------------------------------------------------------------ */

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * İstem/kalite katmanı SÜRÜMÜ — kaynak özetinin ÖNEKİ. İstem ya da son işlem
 * kuralı ANLAMLI biçimde değişince artırılır: kapsam denetimi öneki eski olan
 * her kaydı seçer ve yeni kalitede yeniden çevirir (tek tek elle tetiklemek
 * yok; yeniden çeviri bitene dek eski çeviri gösterilir, sayfa noindex'e düşmez).
 * v2 (2026-09-25): sayı biçimi, Rusça birimler, false-friend/sözlük, içerik
 * yasaklı terimleri, çevrilmemiş Türkçe kapısı.
 * v3 (2026-09-26): parça kodu koruması (Latin kod, Kiril benzer harf reddi).
 * 2026-09-27 (her kaynak dil: ISO kaynak kodu, dile göre sayı biçimi, Türkçe
 * hedefin denetimi, yazı sistemi kapıları) sürüm ARTIRILMADAN geldi — kullanıcı
 * kararı: mevcut kayıtlar Türkçe kaynaklı demo verisi, yeniden çeviri maliyetine
 * değmez; yeni kurallar yeni/değişen her kayda uygulanır.
 * Neden ÖNEK: sürüm yalnız özetin İÇİNDE olsaydı SQL eski sürümlü satırı
 * göremezdi — kapsam denetimi kaydı ancak varlığın kendisi değişince seçiyordu
 * ve v2'ye geçişte staging'deki 459 kaydın hiçbiri yeniden çevrilmemişti.
 */
export const TRANSLATION_PROMPT_VERSION = 3;
/** Güncel sürümün özet öneki (`v3:`); SQL `LIKE 'v3:%'` ile okur. */
export const SOURCE_HASH_PREFIX = `v${TRANSLATION_PROMPT_VERSION}:`;

/** Kaynak alanların kararlı özeti (sürüm önekli) — değişince çeviri bayatlar. */
export function sourceHash(type: TranslatableEntityType, source: SourceFields): string {
  const digest = createHash("sha256").update(`${type}:${canonical(source)}`).digest("hex").slice(0, 32);
  return `${SOURCE_HASH_PREFIX}${digest}`;
}

/**
 * HAZIR DİLLER — kayıt hangi dillerde KENDİ DİLİNDE gösterilebilir? (i18n SEO)
 * Kaynak dil her zaman hazır; diğer dil yalnız çeviri metni (`fields`) varsa
 * (bayat da olsa — yeniden çeviri sürerken eski çeviri gösterilir). Satır yoksa
 * ya da kaynak dil henüz bilinmiyorsa (ilk çeviri beklemede, kalıcı FAILED)
 * kaynak Türkçe VARSAYILIR — aksi hâlde Türkçe sayfa da "bekliyor" sayılıp
 * `noindex` alıyordu (2026-09-26 bulgusu). Sayfanın `noindex`i
 * (`translationPending`) ve sitemap'in dil girdileri AYNI fonksiyondan okur.
 */
// Kaynak dil platform dili değilse (Almanca, Çince… ya da henüz "und")
// yalnız çevirisi gelmiş diller hazırdır: yabancı özgün metin Türkçe adreste
// `lang="tr"` ile İNDEKSLENMEZ (2026-09-27 denetimi).
export function readyLocales(rows: { locale: string; fields: unknown; sourceLocale: string | null }[]): Locale[] {
  const src = rows.find((r) => r.sourceLocale)?.sourceLocale ?? DEFAULT_LOCALE;
  return LOCALES.filter((l) => l === src || rows.some((r) => r.locale === l && r.fields != null));
}

/**
 * Kaydın dil durumu — herkese açık detay yanıtı (i18n SEO, 2026-09-27): web
 * hreflang'i yalnız HAZIR dillere yazar (`readyLocales`) ve kaynak metni
 * gösterdiği dilde içerik bloğuna `lang={sourceLocale}` basar. Kaynak dil
 * `readyLocales` ile aynı varsayımla: satır yoksa Türkçe; "und" (henüz
 * bilinmiyor) olduğu gibi döner — web `lang` yazmaz.
 */
export function localeStateOf(rows: { locale: string; fields: unknown; sourceLocale: string | null }[]): {
  readyLocales: Locale[];
  sourceLocale: string;
} {
  return {
    readyLocales: readyLocales(rows),
    sourceLocale: rows.find((r) => r.sourceLocale)?.sourceLocale ?? DEFAULT_LOCALE,
  };
}

/**
 * Sitemap dil başına `lastmod` (2026-09-27): çevirisi OLAN (kaynak dil
 * olmayan, `fields` dolu) her dilin satır zamanı. Kaynak dil burada yoktur —
 * onun `lastmod`u varlığın kendi `updatedAt`idir.
 */
export function translatedAtOf(rows: { locale: string; fields: unknown; updatedAt: Date }[]): Partial<Record<Locale, Date>> {
  const out: Partial<Record<Locale, Date>> = {};
  for (const r of rows) {
    if (r.fields == null || !(LOCALES as readonly string[]).includes(r.locale)) continue;
    out[r.locale as Locale] = r.updatedAt;
  }
  return out;
}

/** Çevrilecek anlamlı metin var mı? (Boş ürün/profil için model çağrılmaz.) */
export function hasTranslatableText(source: SourceFields): boolean {
  const texts: string[] = [];
  for (const v of Object.values(source as unknown as Record<string, unknown>)) {
    if (typeof v === "string") texts.push(v);
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") texts.push(item);
        else if (item && typeof item === "object") texts.push(...Object.values(item as Record<string, string>));
      }
    }
  }
  return texts.some((t) => t.trim().length >= 2);
}

/* ------------------------------------------------------------------ */
/* İstem                                                               */
/* ------------------------------------------------------------------ */

const ENTITY_LABEL: Record<TranslatableEntityType, string> = {
  PRODUCT: "a supplier's product listing (showcase)",
  LISTING: "a buyer's buying request (RFQ)",
  COMPANY: "a company profile",
};

export const TRANSLATION_SYSTEM_PROMPT = `You are a professional translator for an international industrial B2B sourcing marketplace (buyers and suppliers from Turkey, Europe, Russia, Central Asia, China, the Middle East and the rest of the world). Your readers are procurement professionals and engineers.
You receive SOURCE fields written by a user in ANY language and return the SAME fields in Turkish (tr), English (en) and Russian (ru).

General rules:
- Detect the source language and report it as an ISO 639-1 code ("tr", "en", "ru", "de", "zh", "ar", "es"…). If it is tr, en or ru, return that language's text UNCHANGED (no edits, no fixes); every other target language is translated.
- Every target must be fully in its own language and script: never leave Chinese, Japanese, Korean, Arabic or other non-Latin/non-Cyrillic characters in tr/en/ru — translate, or transliterate proper names (pinyin, standard English/Turkish/Russian spelling). Cyrillic appears only in ru (a Russian legal company name may stay as written).
- Translate by MEANING with the terminology industry buyers actually use and search for — never word by word. Neutral, commercial, concise; no marketing language; never add, invent or drop information.
- Keep EXACTLY: every number's digits, standards (DIN, ISO, EN, TSE, GOST, AISI, IEC), part/model numbers, brand names, product codes, chemical formulas, currencies, proper names (companies, places, ports) and Turkish registries (ÜTS, TSE).
- Codes (M6, CF226A, 6205-2RS, S420MC, DN50, 4x16, HP 26A) are copied character by character in LATIN letters — never replace a Latin letter in a code with a Cyrillic look-alike (М, А, С, Е, Н, Р, Т, Х) and never convert a letter inside a code into a unit.
- Place names in en: English spelling for Istanbul and Izmir (no dotted İ); other Turkish place names keep their Turkish spelling. In ru: standard Russian names (Стамбул, Измир, Анкара), others transliterated.
- Company legal names stay unchanged (e.g. "San. Tic. A.Ş.", "ООО", "LLC").
- Use ONE target term per source term consistently across name/title, description, keywords, attributes, items, details and questions.

Numbers (critical): read each number in the SOURCE language's convention — in Turkish, German, Russian, French, Spanish etc. "," is the DECIMAL mark and "." or a space groups THOUSANDS (2.400 = 2 400 = two thousand four hundred; 0,02 = two hundredths); in English and Chinese "." is the decimal mark and "," groups thousands. Re-format for each target without changing digits: tr → 2.400 · 1.200,5 · 0,02; en → 2,400 · 1,200.5 · 0.02; ru → 2 400 · 1 200,5 · 0,02. Write magnitudes in digits in every target ("15,000 m²", not "15 thousand m²"; 1万 = 10,000; 15 тыс. = 15,000). Dates may be written the target language's usual way, but the day and year stay the same.

Units: do NOT copy unit words/symbols — write them in the target language's standard symbols: tr → mm, cm, m, m², m³, kg, g, ton, kW, kV, V, A, W, bar, L (litre), adet; en → mm, cm, m, m², m³, kg, g, t, kW, kV, V, A, W, bar, L (litre), pcs; ru → мм, см, м, м², м³, кг, г, т, кВт, кВ, В, А, Вт, бар, л, шт. Keep °C, %, IP ratings; g/m² → г/м² (ru).

Glossary (mandatory): "satın alma talebi / alım talebi / talep" = "buying request / request" (en), "заявка на закупку / запрос" (ru) — NEVER "tender" / "тендер" / "конкурс". "teklif" = "quote" / "коммерческое предложение". "kapalı zarf" = "sealed bid" / "закрытые предложения". "kazandırma / kazandırmak" = "award / to award" / "присуждение / присудить". "pazarlık" = "negotiation round" / "раунд переговоров". "kalem" = "line item" / "позиция". "vitrin" = "showcase" / "витрина". "tedarikçi" = "supplier" / "поставщик".
Into Turkish (tr) from any language: request / RFQ / buying request / tender / Ausschreibung / licitación / заявка / тендер / 招标 = "satın alma talebi" or "talep" — NEVER "ihale"; quote / offer / Angebot / предложение = "teklif"; supplier = "tedarikçi"; line item = "kalem"; buyer = "alıcı".

Turkish false friends — translate by meaning, not by the look-alike word:
- pano (electrical) → switchboard / distribution board — щит (распределительный щит)
- konstrüksiyon → (steel/mounting) structure — (металло)конструкции
- tesisat → installation / piping (plumbing only if sanitary) — монтаж / трубопроводы
- plaza → office tower / business centre — бизнес-центр
- uygulama (construction) → project / works — работы / проекты
- proje mobilyası → contract furniture — контрактная мебель
- ana sanayi (automotive context) → automotive OEMs — автопроизводители (OEM); yan sanayi → automotive parts suppliers — поставщики автокомпонентов
- kurumsal tedarik → corporate supply — корпоративные поставки
- fatura → invoice — счёт (счёт-фактура)
- yetki belgesi → certificate of authorization / authorized dealer certificate — сертификат дистрибьютора (авторизационное письмо)
- penye (kumaş) → combed cotton — гребенной хлопок (кулирное полотно из гребенного хлопка)
- katlı (corrugated board) → -ply — -слойный
- çelik profil → steel hollow section / structural section — профильная труба / профиль
- makara (cable) → cable drum — барабан
- soğuk depo → cold store — холодильный склад
- dış cephe (services) → facade (e.g. facade cleaning) — фасад (мойка фасадов)
- sosyal alanlar → staff welfare areas — бытовые помещения
- 7/24 → 24/7
Turkish-only abbreviations: expand once with the original in parentheses — OSB → Organized Industrial Zone (OSB) / Организованная промышленная зона (OSB); GES → solar power plant (GES) / солнечная электростанция (СЭС); AG/OG → LV/MV / НН/СН; KDV → VAT / НДС. dönüm → decares / декаров (do not convert).

Field rules:
- Product and item names: the natural product name in the target language (e.g. "Köşebent" → "Angle bar" / "Уголок стальной").
- keywords / services: each entry must be a complete, standalone search phrase a buyer in the target market would actually type (expand fragments: "plakalı" → "plate heat exchanger", not "plate"); never output an acronym used only in Turkey. Keep array length and order.
- attributes: translate label and textual value; keep numeric values and codes; keep array length and order.
- details, questions, terms, paymentNote: faithful full translations (technical specifications — keep every value, tolerance and standard).
- ru style: qualifiers in parentheses after the first word are lower case; don't start a sentence with a bare number or code; make adjectives and participles agree in gender/number with their noun; avoid long genitive chains in titles; hyphenate compounds such as ПЭТ-бутылка.
- Use one attribute value word consistently (e.g. product condition "Sıfır" = "New" / "Новый", never "Brand new").

Output STRICT JSON only (no markdown, no commentary):
{ "sourceLocale": "<ISO 639-1 code of the source language>", "translations": { "tr": <fields>, "en": <fields>, "ru": <fields> } }
where <fields> has exactly the same keys and shapes as SOURCE.`;

export function buildPrompt(type: TranslatableEntityType, source: SourceFields, feedback?: string): string {
  const head = `Content type: ${ENTITY_LABEL[type]}.`;
  const fb = feedback
    ? `\n\nYour previous answer was REJECTED for this reason: ${feedback}\nReturn a corrected JSON.`
    : "";
  return `${head}\n\nSOURCE:\n${JSON.stringify(source, null, 1)}${fb}`;
}

/* ------------------------------------------------------------------ */
/* Çıktı doğrulama                                                     */
/* ------------------------------------------------------------------ */

/**
 * Arapça-Hint, Farsça, Devanagari ve tam genişlik rakamları ASCII'ye (sayı
 * kapısı ١٠٠٠ ile 1000'i aynı sayı görsün; aksi hâlde Arapça kaynakta
 * uydurulmuş sayı hiç denetlenmiyordu). Arapça ondalık/binlik ayraç da.
 */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\uff10-\uff19]/g, (ch) => {
      const c = ch.charCodeAt(0);
      const base = c >= 0xff10 ? 0xff10 : c >= 0x0966 ? 0x0966 : c >= 0x06f0 ? 0x06f0 : 0x0660;
      return String(c - base);
    })
    .replace(/\u066b/g, ",")
    .replace(/\u066c/g, ".");
}

/**
 * Sayı dizisi: rakam grupları "." "," "'" ile ya da boşlukla (YALNIZ ardından
 * tam 3 rakam geliyorsa — "2 400", "1 200,50") birleşir; "25 30" iki ayrı
 * sayıdır. Karşılaştırma yalnız RAKAMLARLA yapılır: 1.200,50 ≡ 1,200.50 ≡
 * 1 200,50 (2026-09-27: boşluk grubundan sonraki ondalık ayrı sayı sanılıyor,
 * doğru Rusça çıktı reddediliyordu).
 */
const NUMBER_RE = /\d+(?:(?:[.,'’]|[ \u00a0\u202f](?=\d{3}(?!\d)))\d+)*/g;

/**
 * Tarih yalnız YIL olarak sayılır: gün/ay hedefte sözcükle yazılabilir
 * ("01.03.2026" → "1 March 2026"); ay adı rakam taşımaz.
 */
const DATE_RES: [RegExp, number][] = [
  [/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/g, 3],
  [/(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/g, 1],
  [/(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/g, 1],
];

function prepNumbers(text: string): string {
  let out = normalizeDigits(text);
  for (const [re, yearGroup] of DATE_RES) out = out.replace(re, (...m: string[]) => ` ${m[yearGroup]} `);
  return out;
}

/** Metindeki sayı dizileri — ayraç ve boşluk normalize (2.400 ≡ 2,400 ≡ 2 400), tarih yalnız yıl. */
export function numbersOf(text: string): string[] {
  const out: string[] = [];
  for (const m of prepNumbers(text).matchAll(NUMBER_RE)) out.push(m[0].replace(/\D/g, ""));
  return out;
}

/*
 * Büyüklük sözcükleri → rakam ("15 bin" = "15 thousand" = "15 тыс." = 1万5千
 * değil ama "1,5万" = 15000). İstem hedefte rakam İSTER; kaynak hangi dilde
 * büyüklük yazdıysa açılmış biçim de kabul edilir (iki yönde: model hedefte
 * sözcük bıraktıysa da). Yalnız KABUL genişletir, hiçbir şeyi reddettirmez.
 */
const MAGNITUDE_WORDS: [RegExp, number][] = [
  [/^(?:bin|thousand|тыс\.?|тысяч[аи]?|tsd\.?|tausend|mil)$/iu, 1e3],
  [/^(?:milyon|millions?|млн\.?|миллион(?:а|ов)?|mio\.?|millionen|millones|milhões|millions)$/iu, 1e6],
  [/^(?:milyar|billions?|млрд\.?|миллиард(?:а|ов)?|mrd\.?|milliarden?)$/iu, 1e9],
];
const CJK_MAGNITUDE: Record<string, number> = { 千: 1e3, 천: 1e3, 万: 1e4, 萬: 1e4, 만: 1e4, 亿: 1e8, 億: 1e8 };
// CJK büyüklüğü ÖNCE: "1万件" harf dizisi olarak ("万件") yutulmasın.
const MAGNITUDE_RE = /(\d+(?:[.,]\d+)?)(?:\s*([千천万萬만亿億])|([kK])(?![\p{L}\d])|\s*(\p{L}+\.?))/gu;

function magnitudeValue(num: string, mult: number): string {
  const v = /^\d+[.,]\d{1,2}$/.test(num) ? Number.parseFloat(num.replace(",", ".")) : Number.parseInt(num.replace(/\D/g, ""), 10);
  return String(Math.round(v * mult));
}

export function expandMagnitudes(text: string): string {
  return text.replace(MAGNITUDE_RE, (m, num: string, cjk?: string, k?: string, word?: string) => {
    if (cjk) return magnitudeValue(num, CJK_MAGNITUDE[cjk]!);
    if (k) return magnitudeValue(num, 1e3);
    const mult = MAGNITUDE_WORDS.find(([re]) => re.test(word ?? ""))?.[1];
    return mult ? magnitudeValue(num, mult) : m;
  });
}

/**
 * Kaynaktaki her sayı hedefte de var mı (çoklu küme olarak)? Büyüklük
 * sözcükleri (bin, thousand, тыс., 万…) iki tarafta da açılmış biçimiyle
 * denenir.
 */
export function numbersPreserved(src: string, dst: string): boolean {
  const s0 = prepNumbers(src);
  const d0 = prepNumbers(dst);
  const srcs = [...new Set([s0, expandMagnitudes(s0)])];
  const dsts = [...new Set([d0, expandMagnitudes(d0)])];
  return srcs.some((a) => dsts.some((b) => numbersPreservedExact(a, b)));
}

function numbersPreservedExact(src: string, dst: string): boolean {
  const need = numbersOf(src);
  if (need.length === 0) return true;
  const pool = new Map<string, number>();
  for (const n of numbersOf(dst)) pool.set(n, (pool.get(n) ?? 0) + 1);
  for (const n of need) {
    const c = pool.get(n) ?? 0;
    if (c === 0) return false;
    pool.set(n, c - 1);
  }
  return true;
}

/**
 * Uzunluk kapısının ölçüsü: CJK/Hangul/kana karakteri ~3 Latin harfi
 * taşır (226 karakterlik Çince açıklamanın doğru çevirisi 800+ karakter —
 * düz uzunluk her Çince kaynağı "unreasonably long" diye reddediyordu).
 */
const WIDE_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
export function textWeight(text: string): number {
  return text.length + 2 * (text.match(WIDE_CHAR)?.length ?? 0);
}

/* ------------------------------------------------------------------ */
/* Kalite katmanı — kesin son işlem + reddetme kuralları (v2)          */
/* ------------------------------------------------------------------ */

// SAYI BİÇİMİ — kaynak dilin kuralıyla okunur, hedef dilin kuralıyla yazılır.
// Biçim BELİRSİZ DEĞİL (kaynak dili biliniyor) → modele bırakılmaz, kodda
// düzeltilir (inceleme 2026-09-25: model "1.200 decares" yazıyordu —
// İngilizcede 1,2 okunur; 2026-09-27: kaynak artık her dilde olabilir).
const NBSP = "\u00a0";
const COMMA_DECIMAL = new Set([
  "de", "es", "it", "pt", "nl", "id", "da", "ro", "el", "sr", "hr", "sl", "bs", "mk", "az", "vi", "ca", "gl", "eu", "is",
  "ru", "uk", "be", "kk", "uz", "ky", "tg", "tk", "fr", "pl", "cs", "sk", "sv", "fi", "nb", "no", "nn", "hu", "bg", "lt",
  "lv", "et", "ka", "hy", "mn", "sq",
]);
const DOT_DECIMAL = new Set(["en", "zh", "ja", "ko", "hi", "th", "ms", "he", "ar", "fa", "ur", "bn", "ta", "te", "tl", "fil", "sw", "ne", "si", "my", "km", "lo"]);
interface NumberConvention {
  dec: "," | ".";
  /** Binlik gruplu sayı kalıpları (RegExp kaynağı, ondalık hariç). */
  grouped: string[];
}
// Boşlukla gruplanmış sayı yalnız ilk grup 1-2 haneliyse ("2 400", "12 500"):
// "100 200 300" gibi ölçü listesi tek sayı sanılıp "100,200,300" yazılmasın.
const DOT_GROUPED = "\\d{1,3}(?:\\.\\d{3})+";
const SPACE_GROUPED = "\\d{1,2}(?:[ \\u00a0\\u202f]\\d{3})+";
const COMMA_GROUPED = "\\d{1,3}(?:,\\d{3})+";
/** Kaynak dilin sayı kuralı; bilinmeyen dilde null (dokunulmaz). */
function numberConvention(lang: string): NumberConvention | null {
  if (lang === "tr") return { dec: ",", grouped: [DOT_GROUPED] };
  if (COMMA_DECIMAL.has(lang)) return { dec: ",", grouped: [DOT_GROUPED, SPACE_GROUPED] };
  if (DOT_DECIMAL.has(lang)) return { dec: ".", grouped: [COMMA_GROUPED] };
  return null;
}
const TARGET_NUMBER: Record<Locale, { group: string; dec: string }> = {
  tr: { group: ".", dec: "," },
  en: { group: ",", dec: "." },
  ru: { group: NBSP, dec: "," },
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatNumberToken(token: string, conv: NumberConvention, target: Locale): string {
  const at = token.lastIndexOf(conv.dec);
  const intRaw = at >= 0 ? token.slice(0, at) : token;
  const dec = at >= 0 ? token.slice(at + 1) : undefined;
  const digits = intRaw.replace(/\D/g, "");
  const f = TARGET_NUMBER[target];
  const intOut = digits.length !== intRaw.length ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, f.group) : digits;
  return dec === undefined ? intOut : `${intOut}${f.dec}${dec}`;
}

/** Türkçe biçimli sayıyı hedef dile çevirir (rakamlar aynı). */
export function formatTrNumber(token: string, locale: "en" | "ru"): string {
  return formatNumberToken(token, numberConvention("tr")!, locale);
}

/**
 * Kaynakta biçimli (binlik/ondalık ayraçlı) olup hedefte AYNEN kopyalanmış
 * sayıları hedef dilin biçimine çevirir. Kaynak dili bilinmiyorsa dokunmaz.
 */
export function localizeNumbers(src: string, dst: string, locale: Locale, sourceLang = "tr"): string {
  const conv = numberConvention(sourceLang);
  if (!conv || sourceLang === locale) return dst;
  const dec = escapeRe(conv.dec);
  const patterns = [...conv.grouped.map((g) => `${g}(?:${dec}\\d+)?`), `\\d+${dec}\\d+`];
  const tokens = new Set<string>();
  for (const p of patterns) {
    const re = new RegExp(`(?<![\\p{L}\\d.,])${p}(?![\\d.,]*\\d)`, "gu");
    for (const m of src.matchAll(re)) tokens.add(m[0]);
  }
  let out = dst;
  for (const tok of [...tokens].sort((a, b) => b.length - a.length)) {
    const formatted = formatNumberToken(tok, conv, locale);
    if (formatted === tok) continue;
    const re = new RegExp(`(?<![\\p{L}\\d.,])${escapeRe(tok)}(?![\\d.,]*\\d)`, "gu");
    out = out.replace(re, formatted);
  }
  return out;
}

// Rusçada Latin birim → standart Kiril sembol (yalnız SAYIDAN sonra; M8 gibi
// kodlara dokunmaz). Bileşikler önce.
const RU_UNITS: [string, string][] = [
  ["g/m²", "г/м²"], ["kg/m²", "кг/м²"], ["kg/m³", "кг/м³"], ["m³/h", "м³/ч"], ["l/min", "л/мин"], ["km/h", "км/ч"], ["rpm", "об/мин"],
  ["mm²", "мм²"], ["cm²", "см²"], ["m²", "м²"], ["m³", "м³"], ["m2", "м²"], ["m3", "м³"],
  ["mm", "мм"], ["cm", "см"], ["km", "км"], ["kg", "кг"], ["gr", "г"], ["kVA", "кВА"], ["kW", "кВт"], ["kV", "кВ"],
  ["kWh", "кВт·ч"], ["MW", "МВт"], ["Hz", "Гц"], ["bar", "бар"], ["lt", "л"], ["pcs", "шт"], ["ton", "т"],
  ["m", "м"], ["g", "г"], ["t", "т"], ["W", "Вт"], ["V", "В"], ["A", "А"], ["l", "л"],
];
const unitAlt = (units: string[]) => [...units].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
const SINGLE_LETTER_UNITS = RU_UNITS.map(([u]) => u).filter((u) => u.length === 1);
const MULTI_LETTER_UNITS = RU_UNITS.map(([u]) => u).filter((u) => u.length > 1);
// SAYI bir kodun parçası OLMAMALI: önünde harf/rakam yok ("CF226A", "HP26A"
// dokunulmaz — inceleme 2026-09-26 gerilemesi). Tek harfli birimler (A, V, W,
// m, g, l, t) YALNIZ boşluktan sonra ("26A" parça numarasıdır, "26 A" akımdır).
const RU_UNIT_RE = new RegExp(
  `(?<![\\p{L}\\d.,-])(\\d+(?:[.,\\u00a0]\\d+)*)(?:(\\s?)(${unitAlt(MULTI_LETTER_UNITS)})|(\\s)(${unitAlt(SINGLE_LETTER_UNITS)}))(?![\\p{L}\\d])`,
  "gu",
);
const RU_UNIT_MAP = new Map(RU_UNITS);

export function localizeRuUnits(dst: string): string {
  return dst.replace(
    RU_UNIT_RE,
    (_m, num: string, sp1: string | undefined, u1: string | undefined, sp2: string | undefined, u2: string | undefined) => {
      const unit = (u1 ?? u2)!;
      return `${num}${sp1 ?? sp2 ?? ""}${RU_UNIT_MAP.get(unit) ?? unit}`;
    },
  );
}

/*
 * KOD KORUMA — kaynaktaki ürün/parça/malzeme kodu (M6, CF226A, 6205-2RS,
 * S420MC, DN50, 4x16) her çeviride AYNEN geçmeli; model Kiril benzer harfle
 * ("М6") ya da bozarak yazarsa ret + yeniden deneme. Kod = büyük Latin harf +
 * rakam içeren sözcük; "400kVAr" gibi SAYI+birim biçimi kod sayılmaz (birim
 * hedef dile çevrilebilir).
 */
// Sınır YALNIZ Latin/Kiril harf ve rakam: Çince metne bitişik kod da
// ("SUS304不锈钢 M6螺栓") korunur (2026-09-27).
const CODE_TOKEN =
  /(?<![\p{Script=Latin}\p{Script=Cyrillic}\d])(?=[A-Za-z0-9/-]*[A-Z])(?=[A-Za-z0-9/-]*\d)[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*(?![\p{Script=Latin}\p{Script=Cyrillic}\d])/gu;
const NUMBER_WITH_UNIT = /^\d+(?:[.,]\d+)?[A-Za-z]{1,4}[²³]?$/;

export function codeTokens(src: string): string[] {
  return [...new Set((src.match(CODE_TOKEN) ?? []).filter((t) => !NUMBER_WITH_UNIT.test(t)))];
}

/**
 * İçerik çevirisine özel yasaklı terimler (UI kataloğundan AYRI: orada
 * "открытые торги" açık eksiltme için meşru). "конкурс" ihale çağrışımı taşır.
 */
const CONTENT_BANNED: Partial<Record<Locale, RegExp[]>> = {
  tr: [/(?<!\p{L})[iİ]hale/iu],
  en: [/\btenders?\b/i, /\btendering\b/i],
  ru: [/тендер/i, /конкурс/i],
};
/**
 * Hedefte kalmaması gereken yazı sistemleri (tr/en/ru Latin ya da Kiril):
 * Çince/Arapça kaynağın çevrilmeden bırakılan kısmı (2026-09-27: "起订量1万件"
 * İngilizce çıktıda kabul ediliyordu). Yunanca bilinçli DIŞARIDA (Ω, Δp).
 */
const FOREIGN_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Georgian}\p{Script=Armenian}]+/u;
const CYRILLIC_WORD = /[\p{L}\d]*\p{Script=Cyrillic}[\p{L}\d]*/gu;
// Sözcük = harf/rakam dizisi; tire ve kesme AYIRIR ("Çerkezköy-based" →
// "Çerkezköy", "Çerkezköy'de" → "Çerkezköy").
const TR_LETTER_WORD = /[\p{L}\d]*[çğışöüÇĞİŞÖÜ][\p{L}\d]*/gu;
/** Kaynakta geçmese de hedefte Türkçe harfle yazılması doğal olan özel adlar. */
const TR_WORD_ALLOW = new Set(["Türkiye"]);

/** Hedef metnin kalite hataları (yeniden deneme geri bildirimi). */
export function qualityErrors(field: string, locale: Locale, sourceText: string, dst: string): string[] {
  const errs: string[] = [];
  for (const re of CONTENT_BANNED[locale] ?? []) {
    if (re.test(dst)) errs.push(`${field}: forbidden term (${re.source}) — use the glossary`);
  }
  const foreign = FOREIGN_SCRIPT.exec(dst);
  if (foreign) errs.push(`${field}: "${foreign[0]}" is not translated — translate it or transliterate proper names`);
  // Kiril yalnız ru'da. en/tr'de kaynakta AYNEN geçen birkaç sözcük (Rus
  // tüzel kişi adı "ООО «Промтех»", çelik sınıfı "12Х18Н10Т") serbest; kaynakta
  // olmayan ya da metnin önemli kısmını tutan Kiril = çevrilmemiş metin.
  if (locale !== "ru") {
    const cyr = dst.match(CYRILLIC_WORD) ?? [];
    const words = dst.match(/[\p{L}\d]+/gu)?.length ?? 1;
    const tooMuch = cyr.length > Math.max(3, words * 0.2) || cyr.length / words > 0.5;
    if (cyr.length && (cyr.some((w) => !sourceText.includes(w)) || tooMuch)) {
      errs.push(`${field}: Cyrillic text in ${locale === "en" ? "English" : "Turkish"} translation — translate it`);
    }
  }
  // Latin ve Kiril harfi aynı sözcükte (kod Kiril benzer harfle yazılmış: "Мodel", "S420МC").
  const mixed = dst.match(/[\p{L}\d]*(?:[A-Za-z][\p{L}\d]*\p{Script=Cyrillic}|\p{Script=Cyrillic}[\p{L}\d]*[A-Za-z])[\p{L}\d]*/u);
  if (mixed) errs.push(`${field}: "${mixed[0]}" mixes Latin and Cyrillic letters — codes stay in Latin`);
  if (locale === "tr") return errs;
  // Çevrilmemiş Türkçe: KÜÇÜK harfle başlayan Türkçe-harfli sözcük hiçbir
  // zaman özel ad değildir ("montajı") → her zaman hata. Büyük harfle
  // başlayan (yer/marka adı, ÜTS) kaynakta aynen geçiyorsa serbest; tümce
  // başındaki "Bakır" gibi belirsiz durum yanlış ret riskiyle REDDEDİLMEZ
  // (yanlış ret çeviriyi kalıcı FAILED'e düşürürdü).
  for (const w of dst.match(TR_LETTER_WORD) ?? []) {
    const lower = /^[\p{Ll}]/u.test(w);
    if (lower || (!sourceText.includes(w) && !TR_WORD_ALLOW.has(w))) {
      errs.push(`${field}: Turkish word "${w}" left untranslated`);
      break;
    }
  }
  return errs;
}

/**
 * Hedef, kaynağın AYNISI mı? (Çevrilmeden kopyalanmış cümle — Almanca kaynak
 * İngilizce alana aynen; Türkçe hedef hiç denetlenmiyordu.) Marka/model adı
 * ("Bosch GSB 18V-50", "Siemens SIMATIC S7-1200") yanlış reddedilmesin diye
 * yalnız en az dört sözcüklü ve küçük harfli sözcük taşıyan metinde (Almanca
 * adlar büyük harfle başlar — "aus", "rostfreiem" yeter).
 */
export function isUntranslatedCopy(src: string, dst: string): boolean {
  const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(src) !== norm(dst)) return false;
  const words = src.match(/\p{L}+/gu)?.length ?? 0;
  return words >= 4 && /(?<!\p{L})\p{Ll}{3,}(?!\p{L})/u.test(src);
}

/** Alanın kaynak metnindeki kodlar hedefte AYNEN var mı? */
export function codeErrors(field: string, src: string, dst: string): string[] {
  const missing = codeTokens(src).filter(
    (c) =>
      !new RegExp(
        `(?<![\\p{Script=Latin}\\p{Script=Cyrillic}\\d])${escapeRe(c)}(?![\\p{Script=Latin}\\p{Script=Cyrillic}\\d])`,
        "u",
      ).test(dst),
  );
  return missing.length ? [`${field}: codes must stay unchanged in Latin letters: ${missing.slice(0, 4).join(", ")}`] : [];
}

type Polisher = (src: string, dst: string, field: string) => string;

/** Çevirinin tüm metin alanlarını (kaynağıyla) gezer; dönen değer yerine yazılır. */
function mapFields(type: TranslatableEntityType, source: SourceFields, t: TranslationFields, fn: Polisher): TranslationFields {
  const pair = (field: string) => (p: Pair, i: number): Pair => ({ src: p.src, dst: fn(p.src, p.dst, `${field}[${i}]`) });
  const text = (field: string, src: string | null | undefined, dst: string | null | undefined) =>
    dst == null || src == null ? (dst ?? null) : fn(src, dst, field);
  if (type === "PRODUCT") {
    const s = source as ProductSource;
    const x = t as ProductTranslation;
    return {
      ...x,
      name: text("name", s.name, x.name) ?? x.name,
      description: text("description", s.description, x.description),
      keywords: x.keywords.map(pair("keywords")),
      attributes: x.attributes.map((a, i) => ({
        label: { src: a.label.src, dst: fn(a.label.src, a.label.dst, `attributes[${i}].label`) },
        value: { src: a.value.src, dst: fn(a.value.src, a.value.dst, `attributes[${i}].value`) },
      })),
      ...(x.unit != null ? { unit: text("unit", s.unit, x.unit) } : {}),
      ...(x.specification != null ? { specification: text("specification", s.specification, x.specification) } : {}),
    };
  }
  if (type === "LISTING") {
    const s = source as ListingSource;
    const x = t as ListingTranslation;
    return {
      ...x,
      title: text("title", s.title, x.title) ?? x.title,
      description: text("description", s.description, x.description),
      keywords: x.keywords.map(pair("keywords")),
      items: x.items.map(pair("items")),
      ...(x.terms != null ? { terms: text("terms", s.terms, x.terms) } : {}),
      ...(x.paymentNote != null ? { paymentNote: text("paymentNote", s.paymentNote, x.paymentNote) } : {}),
      ...(x.details ? { details: x.details.map(pair("details")) } : {}),
      ...(x.questions ? { questions: x.questions.map(pair("questions")) } : {}),
    };
  }
  const s = source as CompanySource;
  const x = t as CompanyTranslation;
  return {
    aboutText: text("aboutText", s.aboutText, x.aboutText),
    services: x.services.map(pair("services")),
    industry: text("industry", s.industry, x.industry),
  };
}

/** Kaynağın tüm metni (çevrilmemiş-Türkçe kapısı için özel ad havuzu). */
function sourceTextOf(source: SourceFields): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(source);
  return parts.join("\n");
}

/**
 * Doğrulanmış çeviriye kalite katmanı: (1) kaynak dilin kuralıyla okunan sayı
 * hedefin biçimine, (2) Rusçada birim sembolleri — kesin düzeltme; (3) yasaklı
 * terim, çevrilmemiş sözcük/kopya, yanlış yazı sistemi (Kiril, Çince, Arapça…),
 * bozulmuş kod — REDDEDİLİR (geri bildirimle yeniden).
 */
export function polishTranslations(
  type: TranslatableEntityType,
  source: SourceFields,
  parsed: ParsedTranslation,
): ParsedTranslation | { error: string } {
  const errors: string[] = [];
  const all = sourceTextOf(source);
  const perLocale = { ...parsed.perLocale };
  // Kaynak dil dışındaki HER hedef denetlenir — Türkçe dahil (2026-09-27:
  // kaynak Almanca/Rusça/Çinceyken tr çıktısı hiç denetlenmiyordu).
  for (const locale of LOCALES) {
    if (locale === parsed.sourceLocale) continue;
    perLocale[locale] = mapFields(type, source, perLocale[locale], (src, dst, field) => {
      let out = localizeNumbers(src, dst, locale, parsed.sourceLocale);
      if (locale === "ru") out = localizeRuUnits(out);
      for (const e of qualityErrors(field, locale, all, out)) errors.push(`${locale}.${e}`);
      if (isUntranslatedCopy(src, out)) errors.push(`${locale}.${field}: left untranslated (identical to the source)`);
      for (const e of codeErrors(field, src, out)) errors.push(`${locale}.${e}`);
      return out;
    });
  }
  if (errors.length > 0) return { error: errors.slice(0, 6).join("; ") };
  return { sourceLocale: parsed.sourceLocale, perLocale };
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1]! : t;
}

type Json = Record<string, unknown>;

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function checkText(field: string, src: string | null, dst: unknown, errors: string[]): string | null {
  if (src == null || src.trim() === "") return null;
  const d = asString(dst);
  if (d == null || d.trim() === "") {
    errors.push(`${field}: missing`);
    return null;
  }
  if (!numbersPreserved(src, d)) errors.push(`${field}: numbers from the source are missing in the translation`);
  if (d.length > textWeight(src) * 3 + 80) errors.push(`${field}: translation is unreasonably long`);
  return d;
}

function checkList(field: string, src: string[], dst: unknown, errors: string[]): Pair[] {
  if (!Array.isArray(dst) || dst.length !== src.length) {
    errors.push(`${field}: array must have exactly ${src.length} entries`);
    return src.map((s) => ({ src: s, dst: s }));
  }
  return src.map((s, i) => {
    const d = asString(dst[i]) ?? s;
    if (!numbersPreserved(s, d)) errors.push(`${field}[${i}]: numbers missing`);
    return { src: s, dst: d.trim() || s };
  });
}

function checkAttributes(src: { label: string; value: string }[], dst: unknown, errors: string[]): AttributePair[] {
  if (!Array.isArray(dst) || dst.length !== src.length) {
    errors.push(`attributes: array must have exactly ${src.length} entries`);
    return src.map((a) => ({ label: { src: a.label, dst: a.label }, value: { src: a.value, dst: a.value } }));
  }
  return src.map((a, i) => {
    const d = (dst[i] ?? {}) as Json;
    const label = asString(d.label) ?? a.label;
    const value = asString(d.value) ?? a.value;
    if (!numbersPreserved(a.value, value)) errors.push(`attributes[${i}].value: numbers missing`);
    return {
      label: { src: a.label, dst: label.trim() || a.label },
      value: { src: a.value, dst: value.trim() || a.value },
    };
  });
}

function parseOne(type: TranslatableEntityType, source: SourceFields, dst: unknown, errors: string[]): TranslationFields {
  const d = (dst && typeof dst === "object" ? dst : {}) as Json;
  if (type === "PRODUCT") {
    const s = source as ProductSource;
    return {
      name: checkText("name", s.name, d.name, errors) ?? s.name,
      description: checkText("description", s.description, d.description, errors),
      keywords: checkList("keywords", s.keywords, d.keywords, errors),
      attributes: checkAttributes(s.attributes, d.attributes, errors),
      ...(s.unit ? { unit: checkText("unit", s.unit, d.unit, errors) } : {}),
      ...(s.specification ? { specification: checkText("specification", s.specification, d.specification, errors) } : {}),
    };
  }
  if (type === "LISTING") {
    const s = source as ListingSource;
    return {
      title: checkText("title", s.title, d.title, errors) ?? s.title,
      description: checkText("description", s.description, d.description, errors),
      keywords: checkList("keywords", s.keywords, d.keywords, errors),
      items: checkList("items", s.items, d.items, errors),
      ...(s.terms ? { terms: checkText("terms", s.terms, d.terms, errors) } : {}),
      ...(s.paymentNote ? { paymentNote: checkText("paymentNote", s.paymentNote, d.paymentNote, errors) } : {}),
      ...(s.details?.length ? { details: checkList("details", s.details, d.details, errors) } : {}),
      ...(s.questions?.length ? { questions: checkList("questions", s.questions, d.questions, errors) } : {}),
    };
  }
  const s = source as CompanySource;
  return {
    aboutText: checkText("aboutText", s.aboutText, d.aboutText, errors),
    services: checkList("services", s.services, d.services, errors),
    industry: checkText("industry", s.industry, d.industry, errors),
  };
}

/** Model çıktısını ayrıştırır ve doğrular. Hata → `{ error }` (yeniden deneme geri bildirimi). */
export function parseModelOutput(
  type: TranslatableEntityType,
  source: SourceFields,
  text: string,
): ParsedTranslation | { error: string } {
  let json: Json;
  try {
    json = JSON.parse(stripFences(text)) as Json;
  } catch {
    return { error: "output is not valid JSON" };
  }
  const sourceLocale: ModelLocale = normalizeSourceLocale(json.sourceLocale);
  const translations = (json.translations ?? {}) as Json;
  const errors: string[] = [];
  const perLocale = {} as Record<Locale, TranslationFields>;
  for (const locale of LOCALES) {
    const fieldErrors: string[] = [];
    perLocale[locale] = parseOne(type, source, translations[locale], fieldErrors);
    for (const e of fieldErrors) errors.push(`${locale}.${e}`);
  }
  if (errors.length > 0) return { error: errors.slice(0, 6).join("; ") };
  return polishTranslations(type, source, { sourceLocale, perLocale });
}

/* ------------------------------------------------------------------ */
/* Okuma yolu — üzerine yazma                                          */
/* ------------------------------------------------------------------ */

/** `toProductIndexCard` ile AYNI kural (160 karakter, düz metin). */
export function productExcerpt(description: string | null): string | null {
  const flat = (description ?? "").replace(/\s+/g, " ").trim();
  return flat ? (flat.length <= 160 ? flat : `${flat.slice(0, 159)}…`) : null;
}

function pairMap(pairs: Pair[] | undefined): Map<string, string> {
  return new Map((pairs ?? []).map((p) => [p.src, p.dst]));
}

/** Listeyi çiftlerle çevirir; kaynakta olmayan (sonradan eklenmiş) madde özgün kalır. */
export function localizeList(values: string[], pairs: Pair[] | undefined): string[] {
  const m = pairMap(pairs);
  return values.map((v) => m.get(v) ?? v);
}

const ATTR_SEP = "\t|\t";

/**
 * Nitelik listesi. ETİKET okuma anında katalogdan zaten okuyucunun dilinde
 * gelir (Faz 4b) → çeviri çiftiyle eşleme ETİKETLE yapılamaz (2026-09-25
 * hatası: EN sayfada etiket İngilizce, çift Türkçe etiket arıyordu → serbest
 * metin DEĞERLER Türkçe kalıyordu). Önce etiket+değer (Türkçe okuyucu), sonra
 * yalnız DEĞER ile eşlenir; etiket eşleşmediyse katalog etiketi korunur.
 */
export function localizeAttributes<T extends { label: string; value: string }>(
  list: T[],
  pairs: AttributePair[] | undefined,
): T[] {
  if (!pairs?.length) return list;
  const byBoth = new Map(pairs.map((p) => [`${p.label.src}${ATTR_SEP}${p.value.src}`, p]));
  const byValue = new Map<string, AttributePair>();
  for (const p of pairs) if (!byValue.has(p.value.src)) byValue.set(p.value.src, p);
  return list.map((a) => {
    const both = byBoth.get(`${a.label}${ATTR_SEP}${a.value}`);
    if (both) return { ...a, label: both.label.dst, value: both.value.dst };
    const v = byValue.get(a.value);
    return v ? { ...a, value: v.value.dst } : a;
  });
}

type Loose = Record<string, unknown>;

/** Ürün kartı / detayı — var olan alanlar üzerine yazılır (kartta description yok, excerpt var). */
export function localizeProduct<T extends { name: string }>(item: T, t: ProductTranslation): T {
  const src = item as unknown as Loose;
  const out: Loose = { ...src, name: t.name || item.name };
  if ("description" in src) out.description = t.description ?? src.description;
  if ("excerpt" in src && t.description) out.excerpt = productExcerpt(t.description);
  if ("unit" in src && t.unit) out.unit = t.unit;
  if ("specification" in src && t.specification) out.specification = t.specification;
  if (Array.isArray(src.keywords)) out.keywords = localizeList(src.keywords as string[], t.keywords);
  if (Array.isArray(src.attributeList)) {
    out.attributeList = localizeAttributes(src.attributeList as { label: string; value: string }[], t.attributes);
  }
  if (Array.isArray(src.features)) out.features = localizeFeatures(src.features as string[], t.attributes);
  return out as unknown as T;
}

/**
 * Kart "özellik satırları" (`attachProductFeatures`: `Etiket: değer[ birim]`
 * dizesi) — etiket ve değer çiftle eşleşirse ikisi de çevrilir, birim kalır.
 * Eşleşmeyen satır özgün kalır (sonradan eklenmiş nitelik).
 */
export function localizeFeatures(features: string[], pairs: AttributePair[] | undefined): string[] {
  if (!pairs?.length) return features;
  return features.map((f) => {
    for (const p of pairs) {
      const head = `${p.label.src}: ${p.value.src}`;
      if (f === head || f.startsWith(`${head} `)) return `${p.label.dst}: ${p.value.dst}${f.slice(head.length)}`;
    }
    // Etiket katalogdan zaten okuyucunun dilinde → yalnız DEĞER eşlenir.
    const i = f.indexOf(": ");
    if (i > 0) {
      const label = f.slice(0, i);
      const rest = f.slice(i + 2);
      for (const p of pairs) {
        if (rest === p.value.src || rest.startsWith(`${p.value.src} `)) return `${label}: ${p.value.dst}${rest.slice(p.value.src.length)}`;
      }
    }
    return f;
  });
}

export function localizeListing<T extends { title: string }>(
  item: T,
  t: ListingTranslation,
  excerptOf?: (d: string | null) => string | null,
): T {
  const src = item as unknown as Loose;
  const out: Loose = { ...src, title: t.title || item.title };
  if ("description" in src) out.description = t.description ?? src.description;
  if ("excerpt" in src && t.description && excerptOf) out.excerpt = excerptOf(t.description);
  if (Array.isArray(src.keywords)) out.keywords = localizeList(src.keywords as string[], t.keywords);
  if ("terms" in src && t.terms) out.terms = t.terms;
  if ("paymentNote" in src && t.paymentNote) out.paymentNote = t.paymentNote;
  if (Array.isArray(src.items)) {
    const m = pairMap(t.items);
    const details = pairMap(t.details);
    const questions = pairMap(t.questions);
    out.items = (src.items as Loose[]).map((i) => {
      const o: Loose = { ...i, name: m.get(i.name as string) ?? i.name };
      // Kaynak listesi KIRPILMIŞ metinle kurulur → eşleme de kırpılmış metinle.
      if (typeof i.description === "string") o.description = details.get(i.description.trim()) ?? i.description;
      if (typeof i.specification === "string") o.specification = details.get(i.specification.trim()) ?? i.specification;
      if (Array.isArray(i.questions)) {
        o.questions = (i.questions as Loose[]).map((q) =>
          typeof q.text === "string" ? { ...q, text: questions.get(q.text.trim()) ?? q.text } : q,
        );
      }
      return o;
    });
  }
  // Panel Açık Talepler kartı kalem adlarını düz dizi taşır (`itemNames`).
  if (Array.isArray(src.itemNames)) out.itemNames = localizeList(src.itemNames as string[], t.items);
  return out as unknown as T;
}

/** Firma profili / dizin kartı — `aboutText` ya da `about` adıyla gelebilir. */
export function localizeCompany<T extends object>(item: T, t: CompanyTranslation): T {
  const src = item as unknown as Loose;
  const out: Loose = { ...src };
  if (src.aboutText) out.aboutText = t.aboutText ?? src.aboutText;
  if (src.about) out.about = t.aboutText ?? src.about;
  if (src.industry) out.industry = t.industry ?? src.industry;
  if (Array.isArray(src.services)) out.services = localizeList(src.services as string[], t.services);
  return out as unknown as T;
}

/* ------------------------------------------------------------------ */
/* Çok dilli arama metni                                               */
/* ------------------------------------------------------------------ */

/** Arama metni tavanı — uzun tanıtım metinleri sütunu şişirmesin. */
export const SEARCH_TEXT_I18N_MAX = 6000;

/**
 * `searchTextI18n` — KAYNAK metin + her dilin çevirisi, katlanmış tek dize.
 * Alan kümesi `searchText`/herkese açık aramanın baktığı alanlarla aynı:
 * ürün ad + anahtar kelime (açıklama değil — `searchText` de almıyor),
 * talep başlık + açıklama + anahtar kelime + kalem adları, firma sektör +
 * hizmetler + tanıtım. Yinelenen sözcükler bir kez yazılır (Türkçe ve
 * İngilizce özel adlar aynı kalır). `fold` parametre: shared'e bağımlılık
 * servis katmanında kalsın, bu dosya saf kalsın.
 */
export function buildSearchTextI18n(
  type: TranslatableEntityType,
  source: SourceFields,
  translations: TranslationFields[],
  fold: (s: string) => string,
): string {
  const parts: string[] = [];
  const push = (...xs: (string | null | undefined)[]) => {
    for (const x of xs) if (x) parts.push(x);
  };
  if (type === "PRODUCT") {
    const s = source as ProductSource;
    push(s.name, ...s.keywords);
    for (const t of translations as ProductTranslation[]) push(t.name, ...t.keywords.map((k) => k.dst));
  } else if (type === "LISTING") {
    const s = source as ListingSource;
    push(s.title, s.description, ...s.keywords, ...s.items);
    for (const t of translations as ListingTranslation[]) {
      push(t.title, t.description, ...t.keywords.map((k) => k.dst), ...t.items.map((i) => i.dst));
    }
  } else {
    const s = source as CompanySource;
    push(s.industry, ...s.services, s.aboutText);
    for (const t of translations as CompanyTranslation[]) push(t.industry, ...t.services.map((x) => x.dst), t.aboutText);
  }
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of fold(parts.join(" ")).split(" ")) {
    if (!w || seen.has(w)) continue;
    seen.add(w);
    words.push(w);
  }
  let out = "";
  for (const w of words) {
    if (out.length + w.length + 1 > SEARCH_TEXT_I18N_MAX) break;
    out = out ? `${out} ${w}` : w;
  }
  return out;
}
