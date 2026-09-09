import { UNITS, normalizeUnit } from "@rothern/shared";

/**
 * "NE LAZIM?" SATIR AYRIŞTIRICI — AI olmadan da çalışır (2026-09-09).
 *
 * Alıcı bir satıra "1200 m 3/4 inç dikişsiz çelik boru" ya da "çelik boru
 * 1200 metre" ya da "vida M8 x 500 adet" yazar; buradan ad + miktar + birim
 * çıkar. Kural: satırın BAŞINDAKİ ya da SONUNDAKİ "sayı + birim" çifti
 * miktar sayılır; ortadaki sayılar (3/4, M8, 400A) ürün adının parçasıdır.
 * Birim tanınmazsa miktar 1 / "adet" — kullanıcı tabloda düzeltir.
 *
 * AI (Silver+) varsa satırlar yine önce buradan geçer; AI yalnız kategori,
 * başlık ve daha iyi kalem adları için çağrılır — ağ olmadan da form dolar.
 */
export interface ParsedLine {
  name: string;
  quantity: number;
  unit: string;
  unitCode: string | null;
}

const UNIT_ALIASES = new Set<string>();
for (const u of UNITS) {
  UNIT_ALIASES.add(u.nameTr.toLocaleLowerCase("tr"));
  UNIT_ALIASES.add(u.symbol.toLocaleLowerCase("tr"));
  for (const a of u.aliases ?? []) UNIT_ALIASES.add(a.toLocaleLowerCase("tr"));
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
/** başta: "1200 m çelik boru", "1.200 metre …", "50 adet …" */
const LEAD_RE = new RegExp(`^${NUM}\\s*([^\\s\\d][^\\s]*)\\s+(.+)$`, "u");
/** sonda: "çelik boru 1200 m", "vida M8 x 500 adet", "boru — 1200 metre" */
const TAIL_RE = new RegExp(`^(.+?)[\\s\\-–—x×:,]*\\s${NUM}\\s*([^\\s\\d][^\\s]*)$`, "u");

function toNumber(raw: string): number {
  // "1.200,5" → 1200.5 ; "1200.5" → 1200.5 ; "1,5" → 1.5
  const s = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\.(?=\d{3}\b)/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function isUnit(token: string): boolean {
  return UNIT_ALIASES.has(token.toLocaleLowerCase("tr").replace(/[.]/g, ""));
}

export function parseLine(line: string): ParsedLine | null {
  const text = line.replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const lead = LEAD_RE.exec(text);
  if (lead && isUnit(lead[2])) {
    return build(lead[3], toNumber(lead[1]), lead[2]);
  }
  const tail = TAIL_RE.exec(text);
  if (tail && isUnit(tail[3])) {
    return build(tail[1], toNumber(tail[2]), tail[3]);
  }
  // Birimsiz sondaki sayı: "çelik boru 1200" → adet
  const bare = /^(.+?)[\s\-–—x×:,]*\s(\d+(?:[.,]\d+)?)$/u.exec(text);
  if (bare && bare[1].trim().length >= 3) return build(bare[1], toNumber(bare[2]), "adet");
  return build(text, 1, "adet");
}

function build(name: string, quantity: number, unitRaw: string): ParsedLine {
  const code = normalizeUnit(unitRaw);
  const def = code ? UNITS.find((u) => u.code === code) : null;
  return {
    name: name.replace(/[\s\-–—,:]+$/u, "").trim().slice(0, 200),
    quantity,
    unit: def?.nameTr ?? unitRaw,
    unitCode: code,
  };
}

/** Çok satırlı metin → kalemler (boş satır atlanır, en fazla `max`). */
export function parseNeed(text: string, max = 50): ParsedLine[] {
  return text
    .split(/\r?\n|;/)
    .map(parseLine)
    .filter((p): p is ParsedLine => !!p && p.name.length >= 2)
    .slice(0, max);
}

/** Kalemlerden talep başlığı: "Çelik boru, vida M8 alımı" (en fazla 80). */
export function titleFromItems(items: { name: string }[]): string {
  const names = items.map((i) => i.name.trim()).filter(Boolean);
  if (!names.length) return "";
  const head = names.slice(0, 2).join(", ");
  const rest = names.length > 2 ? ` ve ${names.length - 2} kalem` : "";
  const t = `${head}${rest} alımı`;
  return (t.charAt(0).toLocaleUpperCase("tr") + t.slice(1)).slice(0, 80);
}
