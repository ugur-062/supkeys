import type { Locale } from "@rothern/i18n";

/**
 * Kategori adı TOPLU çevirisi — saf mantık (i18n Faz 4, 2026-09-23).
 *
 * Ürün/talep çevirisinden farkı: 19 bin kısa ad tek tek çağrılmaz, 120'lik
 * partilerle tek istemde gider (~160 çağrı, ~40 dk, birkaç dolar). Model
 * JSON dizi döner; kod kümesi ve boş ad denetlenir, hatalı parti ikiye
 * bölünüp yinelenir (serviste). Adres slug'ı Türkçe addan üretildiği için
 * çeviri metni URL'yi ETKİLEMEZ.
 */
export interface CategoryBatchRow {
  code: string;
  level: number;
  /** Türkçe ad (kaynak). */
  tr: string;
  /** Ariba kaynağındaki İngilizce ad (varsa) — ipucu; model bunu düzeltebilir. */
  sourceEn?: string | null;
  /** Üst kategorinin Türkçe adı — kısa adları bağlama oturtur ("Bağlantı elemanları" → hangi dal). */
  parentTr?: string | null;
}

export const CATEGORY_BATCH_SIZE = 120;

export const CATEGORY_SYSTEM_PROMPT = `You translate B2B procurement category names (UNSPSC-style taxonomy used by an e-procurement marketplace).
Rules:
- Output ONLY a JSON array, one object per input row: {"code": string, "en": string, "ru": string}. No prose, no code fences.
- Every input code must appear exactly once; never invent, drop or merge rows.
- Use standard industrial/procurement terminology (UNSPSC / trade vocabulary). Keep names short, noun phrases, sentence case (capitalize only the first word and proper nouns / abbreviations).
- Preserve numbers, units, standards, chemical symbols and brand names exactly.
- If the Turkish name is actually already in English (untranslated source), keep it as the English name, corrected for casing only.
- If "sourceEn" is given, prefer it as the English name unless it is clearly wrong or defective.
- Russian: use the established Russian procurement/industrial term; Cyrillic script; sentence case.
- Do not add explanations or parentheses that are not in the source.`;

export function buildCategoryPrompt(rows: CategoryBatchRow[], locales: Locale[]): string {
  const want = locales.filter((l) => l !== "tr");
  const payload = rows.map((r) => ({ code: r.code, level: r.level, tr: r.tr, ...(r.sourceEn ? { sourceEn: r.sourceEn } : {}), ...(r.parentTr ? { parent: r.parentTr } : {}) }));
  return [
    `Translate these ${rows.length} category names from Turkish into: ${want.join(", ")}.`,
    `"parent" is the parent category (context only, do not translate it). "level" 1 = segment (broadest) … 4 = commodity (most specific).`,
    `Return a JSON array of {"code","en","ru"} objects (include both languages even if only one is requested; the unrequested one may be an empty string).`,
    "",
    JSON.stringify(payload),
  ].join("\n");
}

export interface CategoryBatchResult {
  byCode: Map<string, { en: string | null; ru: string | null }>;
}

const CYRILLIC = /[Ѐ-ӿ]/;
const TR_SPECIAL = /[çğıöşüÇĞİÖŞÜ]/;

/** Model çıktısını ayrıştırır ve denetler; sorun varsa `error` (yeniden deneme mesajı). */
export function parseCategoryBatch(rows: CategoryBatchRow[], text: string): CategoryBatchResult | { error: string } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let arr: unknown;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("["), end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) return { error: "output is not a JSON array" };
    try { arr = JSON.parse(cleaned.slice(start, end + 1)); } catch { return { error: "output is not valid JSON" }; }
  }
  if (!Array.isArray(arr)) return { error: "output is not a JSON array" };
  const expected = new Set(rows.map((r) => r.code));
  const byCode = new Map<string, { en: string | null; ru: string | null }>();
  for (const item of arr as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const code = String(o.code ?? "").trim();
    if (!expected.has(code) || byCode.has(code)) continue;
    const en = typeof o.en === "string" ? o.en.trim() : "";
    const ru = typeof o.ru === "string" ? o.ru.trim() : "";
    byCode.set(code, { en: en || null, ru: ru || null });
  }
  const missing = [...expected].filter((c) => !byCode.has(c));
  if (missing.length) return { error: `missing codes: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}` };
  // Kalite kapıları: EN'de Türkçe özel harf, RU'da Kiril yokluğu (sayı/marka-only adlar hariç).
  const badEn = rows.filter((r) => { const v = byCode.get(r.code)!.en; return v && TR_SPECIAL.test(v) && !TR_SPECIAL.test(r.sourceEn ?? ""); });
  if (badEn.length > Math.max(2, rows.length * 0.05)) return { error: `english still contains Turkish letters for: ${badEn.slice(0, 5).map((r) => r.code).join(", ")}` };
  const badRu = rows.filter((r) => { const v = byCode.get(r.code)!.ru; return v && !CYRILLIC.test(v) && /[A-Za-zçğıöşü]{3,}/.test(v) && !/^[A-Z0-9 .\-/]+$/.test(v); });
  if (badRu.length > Math.max(2, rows.length * 0.05)) return { error: `russian is not Cyrillic for: ${badRu.slice(0, 5).map((r) => r.code).join(", ")}` };
  return { byCode };
}

/* ---------------------------------------------------------------- */
/* Nitelik etiketleri + seçenekleri (i18n Faz 4b)                    */
/* ---------------------------------------------------------------- */

export interface AttributeBatchRow {
  id: string;
  /** Kategori Türkçe adı — bağlam. */
  categoryTr: string;
  /** Etiket (Türkçe). */
  tr: string;
  unit?: string | null;
  /** Kanonik seçenekler (Türkçe); çıktıda AYNI SAYIDA ve AYNI SIRADA çeviri beklenir. */
  options: string[];
}

export const ATTRIBUTE_BATCH_SIZE = 40;

export const ATTRIBUTE_SYSTEM_PROMPT = `You translate product ATTRIBUTE labels and their option lists for a B2B industrial procurement marketplace.
Rules:
- Output ONLY a JSON array, one object per input row: {"id": string, "en": string, "ru": string, "optionsEn": string[], "optionsRu": string[]}. No prose, no code fences.
- Every input id must appear exactly once. "optionsEn"/"optionsRu" must have EXACTLY the same length and order as the input "options" (translate each option in place; keep an option unchanged if it is a code, standard, number or brand).
- Use standard industrial terminology; short noun phrases; sentence case. Preserve numbers, units, standards (ISO, EN, DIN, ASTM) and chemical symbols exactly.
- Russian in Cyrillic script.`;

export function buildAttributePrompt(rows: AttributeBatchRow[]): string {
  return [
    `Translate these ${rows.length} attribute labels and their options from Turkish into English and Russian.`,
    `"category" is context only (do not translate it). "unit" is context only.`,
    "",
    JSON.stringify(rows.map((r) => ({ id: r.id, category: r.categoryTr, tr: r.tr, ...(r.unit ? { unit: r.unit } : {}), options: r.options }))),
  ].join("\n");
}

export interface AttributeBatchResult {
  byId: Map<string, { en: string | null; ru: string | null; optionsEn: string[]; optionsRu: string[] }>;
}

export function parseAttributeBatch(rows: AttributeBatchRow[], text: string): AttributeBatchResult | { error: string } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let arr: unknown;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("["), end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) return { error: "output is not a JSON array" };
    try { arr = JSON.parse(cleaned.slice(start, end + 1)); } catch { return { error: "output is not valid JSON" }; }
  }
  if (!Array.isArray(arr)) return { error: "output is not a JSON array" };
  const expected = new Map(rows.map((r) => [r.id, r]));
  const byId = new Map<string, { en: string | null; ru: string | null; optionsEn: string[]; optionsRu: string[] }>();
  const problems: string[] = [];
  for (const item of arr as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const row = expected.get(id);
    if (!row || byId.has(id)) continue;
    const en = typeof o.en === "string" ? o.en.trim() : "";
    const ru = typeof o.ru === "string" ? o.ru.trim() : "";
    const oe = Array.isArray(o.optionsEn) ? (o.optionsEn as unknown[]).map((x) => String(x ?? "").trim()) : [];
    const or = Array.isArray(o.optionsRu) ? (o.optionsRu as unknown[]).map((x) => String(x ?? "").trim()) : [];
    if (row.options.length > 0 && (oe.length !== row.options.length || or.length !== row.options.length)) {
      problems.push(`${id}: options length ${oe.length}/${or.length} != ${row.options.length}`);
      continue;
    }
    byId.set(id, { en: en || null, ru: ru || null, optionsEn: row.options.length ? oe : [], optionsRu: row.options.length ? or : [] });
  }
  const missing = [...expected.keys()].filter((id) => !byId.has(id));
  if (missing.length) return { error: `${problems.length ? problems.slice(0, 3).join("; ") + "; " : ""}missing ids: ${missing.slice(0, 5).join(", ")}` };
  return { byId };
}
