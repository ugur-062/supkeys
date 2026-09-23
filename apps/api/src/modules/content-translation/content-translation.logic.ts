import { createHash } from "node:crypto";
import { LOCALES, type Locale } from "@rothern/i18n";

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
}
export interface ListingSource {
  title: string;
  description: string | null;
  keywords: string[];
  /** Kalem adları (herkese açık kısım). */
  items: string[];
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
}
export interface ListingTranslation {
  title: string;
  description: string | null;
  keywords: Pair[];
  items: Pair[];
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

/** Kaynak alanların kararlı özeti — değişince çeviri bayatlar. */
export function sourceHash(type: TranslatableEntityType, source: SourceFields): string {
  return createHash("sha256").update(`${type}:${canonical(source)}`).digest("hex").slice(0, 32);
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

export const TRANSLATION_SYSTEM_PROMPT = `You are a professional translator for an industrial B2B sourcing marketplace based in Turkey (buyers and suppliers in Turkey, Russia, Central Asia, China and the UAE).
You receive SOURCE fields written by a user and return the SAME fields in Turkish (tr), English (en) and Russian (ru).
Rules:
- Detect the source language. For the source language itself return the text UNCHANGED (no edits, no fixes).
- Keep every number, unit, standard (DIN, ISO, EN, TSE, GOST), part/model number, brand name, product code, chemical formula and currency EXACTLY as in the source. Never add, invent or drop information. Never add marketing language.
- Keep line breaks and list structure. Company legal names stay unchanged (e.g. "San. Tic. A.Ş.", "ООО", "LLC").
- Glossary: "satın alma talebi / alım talebi / talep" = "buying request / request" (en), "заявка на закупку / запрос" (ru) — NEVER "tender" / "тендер". "teklif" = "quote" (en), "предложение" (ru). "kapalı zarf" = "sealed bid" / "закрытое предложение". "vitrin" = "showcase" / "витрина".
- Product and item names: natural naming in the target language with the technical terms industry buyers actually use.
- keywords / services: translate each entry as a search term a buyer would type; keep the array length and order.
- attributes: translate label and textual value; keep numeric values, codes and units; keep the array length and order.
- Tone: neutral, commercial, concise.
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

/** Kaynaktaki her sayı hedefte de var mı (çoklu küme olarak)? */
export function numbersPreserved(src: string, dst: string): boolean {
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
    };
  }
  if (type === "LISTING") {
    const s = source as ListingSource;
    return {
      title: checkText("title", s.title, d.title, errors) ?? s.title,
      description: checkText("description", s.description, d.description, errors),
      keywords: checkList("keywords", s.keywords, d.keywords, errors),
      items: checkList("items", s.items, d.items, errors),
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
  return { sourceLocale, perLocale };
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

export function localizeAttributes<T extends { label: string; value: string }>(
  list: T[],
  pairs: AttributePair[] | undefined,
): T[] {
  if (!pairs?.length) return list;
  const m = new Map(pairs.map((p) => [`${p.label.src}${ATTR_SEP}${p.value.src}`, p]));
  return list.map((a) => {
    const p = m.get(`${a.label}${ATTR_SEP}${a.value}`);
    return p ? { ...a, label: p.label.dst, value: p.value.dst } : a;
  });
}

type Loose = Record<string, unknown>;

/** Ürün kartı / detayı — var olan alanlar üzerine yazılır (kartta description yok, excerpt var). */
export function localizeProduct<T extends { name: string }>(item: T, t: ProductTranslation): T {
  const src = item as unknown as Loose;
  const out: Loose = { ...src, name: t.name || item.name };
  if ("description" in src) out.description = t.description ?? src.description;
  if ("excerpt" in src && t.description) out.excerpt = productExcerpt(t.description);
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
  if (Array.isArray(src.items)) {
    const m = pairMap(t.items);
    out.items = (src.items as { name: string }[]).map((i) => ({ ...i, name: m.get(i.name) ?? i.name }));
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
