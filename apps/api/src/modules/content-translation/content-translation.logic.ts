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

export type ModelLocale = Locale | "other";

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
export function readyLocales(rows: { locale: string; fields: unknown; sourceLocale: string | null }[]): Locale[] {
  const src = rows.find((r) => r.sourceLocale)?.sourceLocale ?? DEFAULT_LOCALE;
  return LOCALES.filter((l) => l === src || rows.some((r) => r.locale === l && r.fields != null));
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

export const TRANSLATION_SYSTEM_PROMPT = `You are a professional translator for an industrial B2B sourcing marketplace based in Turkey (buyers and suppliers in Turkey, Russia, Central Asia, China and the UAE). Your readers are procurement professionals and engineers.
You receive SOURCE fields written by a user and return the SAME fields in Turkish (tr), English (en) and Russian (ru).

General rules:
- Detect the source language. For the source language itself return the text UNCHANGED (no edits, no fixes).
- Translate by MEANING with the terminology industry buyers actually use and search for — never word by word. Neutral, commercial, concise; no marketing language; never add, invent or drop information.
- Keep EXACTLY: every number's digits, standards (DIN, ISO, EN, TSE, GOST, AISI, IEC), part/model numbers, brand names, product codes, chemical formulas, currencies, proper names (companies, places, ports) and Turkish registries (ÜTS, TSE).
- Codes (M6, CF226A, 6205-2RS, S420MC, DN50, 4x16, HP 26A) are copied character by character in LATIN letters — never replace a Latin letter in a code with a Cyrillic look-alike (М, А, С, Е, Н, Р, Т, Х) and never convert a letter inside a code into a unit.
- Place names in en: English spelling for Istanbul and Izmir (no dotted İ); other Turkish place names keep their Turkish spelling. In ru: standard Russian names (Стамбул, Измир, Анкара), others transliterated.
- Company legal names stay unchanged (e.g. "San. Tic. A.Ş.", "ООО", "LLC").
- Use ONE target term per source term consistently across name/title, description, keywords, attributes, items, details and questions.

Numbers (critical): in Turkish "." separates THOUSANDS and "," is the DECIMAL mark (2.400 = two thousand four hundred; 0,02 = two hundredths). Re-format numbers for the target language without changing digits: en → 2,400 · 1,200 · 0.02; ru → 2 400 · 1 200 · 0,02. Never write "2.400" in en or ru. Write "15,000 m²", not "15 thousand m²".

Units: do NOT copy unit words/symbols — write them in the target language's standard symbols: en → mm, cm, m, m², m³, kg, g, t, kW, kV, V, A, W, bar, L (litre), pcs; ru → мм, см, м, м², м³, кг, г, т, кВт, кВ, В, А, Вт, бар, л, шт. Keep °C, %, IP ratings; g/m² → г/м² (ru).

Glossary (mandatory): "satın alma talebi / alım talebi / talep" = "buying request / request" (en), "заявка на закупку / запрос" (ru) — NEVER "tender" / "тендер" / "конкурс". "teklif" = "quote" / "коммерческое предложение". "kapalı zarf" = "sealed bid" / "закрытые предложения". "kazandırma / kazandırmak" = "award / to award" / "присуждение / присудить". "pazarlık" = "negotiation round" / "раунд переговоров". "kalem" = "line item" / "позиция". "vitrin" = "showcase" / "витрина". "tedarikçi" = "supplier" / "поставщик".

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
{ "sourceLocale": "tr" | "en" | "ru" | "other", "translations": { "tr": <fields>, "en": <fields>, "ru": <fields> } }
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

/** Boşluk yalnız BİNLİK grubu birleştirir ("2 400"); "25 30" iki ayrı sayıdır. */
const NUMBER_RE = /\d+(?:[.,]\d+)*(?:\s\d{3}(?!\d))*/g;

/** Metindeki sayı dizileri — binlik/ondalık ayraç ve boşluk normalize (2.400 ≡ 2,400 ≡ 2 400). */
export function numbersOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) out.push(m[0].replace(/\D/g, ""));
  return out;
}

/**
 * Kaynaktaki her sayı hedefte de var mı (çoklu küme olarak)? Türkçe "15 bin"
 * / "2 milyon" hedefte rakamla ("15,000") yazılabilir (istem bunu İSTER) →
 * açılmış biçim de kabul edilir.
 */
export function numbersPreserved(src: string, dst: string): boolean {
  if (numbersPreservedExact(src, dst)) return true;
  const expanded = src
    .replace(/(\d+)\s*milyon\b/giu, (_m, d: string) => `${d}000000`)
    .replace(/(\d+)\s*bin\b/giu, (_m, d: string) => `${d}000`);
  return expanded !== src && numbersPreservedExact(expanded, dst);
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

/* ------------------------------------------------------------------ */
/* Kalite katmanı — kesin son işlem + reddetme kuralları (v2)          */
/* ------------------------------------------------------------------ */

// Türkçe sayı: "." binlik, "," ondalık. Kaynak Türkçeyken biçim BELİRSİZ DEĞİL
// → modele bırakılmaz, kodda yeniden biçimlenir (inceleme 2026-09-25: model
// "1.200 decares" yazıyordu — İngilizcede 1,2 okunur).
const TR_THOUSANDS = /(?<![\d.,])\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\d.,]*\d)/g;
const TR_DECIMAL = /(?<![\d.,])\d+,\d+(?![\d.,]*\d)/g;
const NBSP = "\u00a0";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Türkçe biçimli sayıyı hedef dile çevirir (rakamlar aynı). */
export function formatTrNumber(token: string, locale: "en" | "ru"): string {
  const [int = "", dec] = token.split(",");
  const intOut = int.includes(".") ? int.split(".").join(locale === "en" ? "," : NBSP) : int;
  if (dec === undefined) return intOut;
  return `${intOut}${locale === "en" ? "." : ","}${dec}`;
}

/** Kaynakta Türkçe biçimli olup hedefte AYNEN kopyalanmış sayıları düzeltir. */
export function localizeNumbers(src: string, dst: string, locale: "en" | "ru"): string {
  const tokens = new Set([...(src.match(TR_THOUSANDS) ?? []), ...(src.match(TR_DECIMAL) ?? [])]);
  let out = dst;
  for (const tok of [...tokens].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\d.,])${escapeRe(tok)}(?![\\d.,]*\\d)`, "g");
    out = out.replace(re, formatTrNumber(tok, locale));
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
const CODE_TOKEN = /(?<![\p{L}\d])(?=[A-Za-z0-9/-]*[A-Z])(?=[A-Za-z0-9/-]*\d)[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*(?![\p{L}\d])/gu;
const NUMBER_WITH_UNIT = /^\d+(?:[.,]\d+)?[A-Za-z]{1,4}[²³]?$/;

export function codeTokens(src: string): string[] {
  return [...new Set((src.match(CODE_TOKEN) ?? []).filter((t) => !NUMBER_WITH_UNIT.test(t)))];
}

/**
 * İçerik çevirisine özel yasaklı terimler (UI kataloğundan AYRI: orada
 * "открытые торги" açık eksiltme için meşru). "конкурс" ihale çağrışımı taşır.
 */
const CONTENT_BANNED: Partial<Record<Locale, RegExp[]>> = {
  en: [/\btenders?\b/i, /\btendering\b/i],
  ru: [/тендер/i, /конкурс/i],
};
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
  if (locale === "en" && /[А-Яа-яЁё]/.test(dst)) errs.push(`${field}: Cyrillic text in English translation`);
  // Latin ve Kiril harfi aynı sözcükte (kod Kiril benzer harfle yazılmış: "Мodel", "S420МC").
  const mixed = dst.match(/[\p{L}\d]*(?:[A-Za-z][\p{L}\d]*[А-Яа-яЁё]|[А-Яа-яЁё][\p{L}\d]*[A-Za-z])[\p{L}\d]*/u);
  if (mixed) errs.push(`${field}: "${mixed[0]}" mixes Latin and Cyrillic letters — codes stay in Latin`);
  return errs;
}

/** Alanın kaynak metnindeki kodlar hedefte AYNEN var mı? */
export function codeErrors(field: string, src: string, dst: string): string[] {
  const missing = codeTokens(src).filter((c) => !new RegExp(`(?<![\\p{L}\\d])${escapeRe(c)}(?![\\p{L}\\d])`, "u").test(dst));
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
 * Doğrulanmış çeviriye kalite katmanı: (1) kaynak Türkçeyse sayı biçimi,
 * (2) Rusçada birim sembolleri — kesin düzeltme; (3) yasaklı terim,
 * çevrilmemiş Türkçe, İngilizcede Kiril — REDDEDİLİR (geri bildirimle yeniden).
 */
export function polishTranslations(
  type: TranslatableEntityType,
  source: SourceFields,
  parsed: ParsedTranslation,
): ParsedTranslation | { error: string } {
  const errors: string[] = [];
  const all = sourceTextOf(source);
  const perLocale = { ...parsed.perLocale };
  for (const locale of LOCALES) {
    if (locale === parsed.sourceLocale || (locale !== "en" && locale !== "ru")) continue;
    perLocale[locale] = mapFields(type, source, perLocale[locale], (src, dst, field) => {
      let out = dst;
      if (parsed.sourceLocale === "tr") out = localizeNumbers(src, out, locale);
      if (locale === "ru") out = localizeRuUnits(out);
      for (const e of qualityErrors(field, locale, all, out)) errors.push(`${locale}.${e}`);
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
  if (d.length > src.length * 3 + 80) errors.push(`${field}: translation is unreasonably long`);
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
  const rawSource = asString(json.sourceLocale) ?? "other";
  const sourceLocale: ModelLocale = (LOCALES as readonly string[]).includes(rawSource)
    ? (rawSource as Locale)
    : "other";
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
export const SEARCH_TEXT_I18N_MAX = 4000;

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
