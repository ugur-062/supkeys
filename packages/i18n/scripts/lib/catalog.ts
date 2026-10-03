import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Flat = Record<string, string>;
export type Tree = { [key: string]: string | Tree };

export type TranslationStatus = "machine" | "reviewed";
export interface StatusEntry {
  /** Türkçe kaynağın çeviri anındaki özeti — değişirse anahtar BAYAT sayılır. */
  hash: string;
  status: TranslationStatus;
  at: string;
}
export type StatusMap = Record<string, StatusEntry>;

export function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** İç içe kataloğu `a.b.c` → metin sözlüğüne düzleştirir (sıra korunur). */
export function flatten(tree: Tree, prefix = ""): Flat {
  const out: Flat = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (isTree(value)) Object.assign(out, flatten(value, full));
    else if (typeof value === "string") out[full] = value;
  }
  return out;
}

/** Düz sözlüğü iç içe kataloğa çevirir (ekleme sırası korunur). */
export function unflatten(flat: Flat): Tree {
  const out: Tree = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let node: Tree = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const next = node[part];
      if (!isTree(next)) node[part] = {};
      node = node[part] as Tree;
    }
    node[parts[parts.length - 1]!] = value;
  }
  return out;
}

/**
 * Hedef kataloğu KAYNAK sırasına dizer; kaynakta olmayan anahtarlar (orphan)
 * sona atılır. Böylece dil dosyaları diff'lenebilir kalır.
 */
export function orderLike(flat: Flat, reference: Flat): Flat {
  const out: Flat = {};
  for (const key of Object.keys(reference)) {
    if (key in flat) out[key] = flat[key]!;
  }
  for (const key of Object.keys(flat)) {
    if (!(key in out)) out[key] = flat[key]!;
  }
  return out;
}

/**
 * ICU argüman adları (`{n}`, `{count, plural, …}`) — sıralı, tekil. Yalnız
 * `{ad}` ya da `{ad,` biçimi sayılır; çoğul dallarının içi (`one {# öğe}`,
 * `other {Select # items}`) argüman DEĞİLDİR.
 */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  parseIcuMessage(message, 0, names, false);
  return [...names].sort();
}

/**
 * Küçük ICU ayrıştırıcısı (bağımlılıksız): yalnız ARGÜMAN adlarını toplar.
 * Düz regex `select`/`plural` dal gövdesindeki tek sözcüğü (`other {order}`,
 * `extended {uzatıldı}`) argüman sanıyordu → dal sözcüğü ASCII olan dilde
 * sahte "yer tutucu uyumsuz" reddi. Dal gövdeleri yeniden MESAJ olarak
 * ayrıştırılır (iç içe `{{title}}` argümanı yine sayılır). ICU tırnaklaması:
 * `''` tek tırnak, `'{…'` kaçışlı metin.
 */
function parseIcuMessage(s: string, start: number, names: Set<string>, nested: boolean): number {
  let i = start;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'") {
      if (s[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (s[i + 1] === "{" || s[i + 1] === "}" || s[i + 1] === "#") {
        const end = s.indexOf("'", i + 1);
        i = end < 0 ? s.length : end + 1;
        continue;
      }
      i++;
      continue;
    }
    if (c === "}" && nested) return i + 1;
    if (c === "{") {
      i = parseIcuArgument(s, i + 1, names);
      continue;
    }
    i++;
  }
  return i;
}

function parseIcuArgument(s: string, start: number, names: Set<string>): number {
  let i = start;
  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i]!)) i++;
  };
  const readToken = () => {
    const from = i;
    while (i < s.length && !/[\s,{}]/.test(s[i]!)) i++;
    return s.slice(from, i);
  };
  skipWs();
  const name = readToken();
  if (name) names.add(name);
  skipWs();
  if (s[i] === "}") return i + 1;
  if (s[i] !== ",") return skipToClose(s, i);
  i++;
  skipWs();
  const type = readToken();
  skipWs();
  if (s[i] === "}") return i + 1;
  if (s[i] !== ",") return skipToClose(s, i);
  i++;
  if (type !== "plural" && type !== "select" && type !== "selectordinal") return skipToClose(s, i);
  // Seçenekler: `seçici {mesaj}` çiftleri (+ `offset:n`), argümanın `}`ine dek.
  while (i < s.length) {
    skipWs();
    if (s[i] === "}") return i + 1;
    if (s[i] === "{") {
      i = parseIcuMessage(s, i + 1, names, true);
      continue;
    }
    if (!readToken()) i++;
  }
  return i;
}

/** Biçim stili (`{d, date, ::yyyy}`) gibi yapısız kuyruğu derinlik sayarak atlar. */
function skipToClose(s: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < s.length && depth > 0) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") depth--;
    i++;
  }
  return i;
}

export function placeholdersMatch(source: string, target: string): boolean {
  const a = placeholders(source);
  const b = placeholders(target);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function hashSource(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex").slice(0, 10);
}

export interface CoverageReport {
  total: number;
  covered: number;
  missing: string[];
  stale: string[];
  /** Çeviri var ama durum kaydı yok (elle yazılmış, sync görmemiş). */
  unknown: string[];
  orphans: string[];
}

/**
 * Kapsam: kaynakta olup hedefte olmayan = eksik; hedefte var ama kaynak özeti
 * değişmiş = bayat; durum kaydı yok = bilinmez (kapsama girer, raporlanır).
 */
export function coverage(source: Flat, target: Flat, status: StatusMap): CoverageReport {
  const missing: string[] = [];
  const stale: string[] = [];
  const unknown: string[] = [];
  let covered = 0;
  for (const [key, text] of Object.entries(source)) {
    if (!(key in target) || target[key] === "") {
      missing.push(key);
      continue;
    }
    const entry = status[key];
    if (!entry) {
      unknown.push(key);
      covered++;
      continue;
    }
    if (entry.hash !== hashSource(text)) {
      stale.push(key);
      continue;
    }
    covered++;
  }
  const orphans = Object.keys(target).filter((k) => !(k in source));
  return { total: Object.keys(source).length, covered, missing, stale, unknown, orphans };
}

export function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/* ---------- cırcır (ratchet) ---------- */

export type Baseline = Record<string, number>;

export interface RatchetViolation {
  file: string;
  count: number;
  baseline: number;
}

/** Sayı tabanı AŞAN her dosya ihlaldir; tabanda olmayan dosya sıfır olmalı. */
export function ratchetViolations(current: Baseline, baseline: Baseline): RatchetViolation[] {
  const out: RatchetViolation[] = [];
  for (const [file, count] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) out.push({ file, count, baseline: allowed });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Tabanı GÜNCELLER: yalnız DÜŞÜRÜR (sıfıra inen ve silinen dosyalar çıkar).
 * Artış/yeni dosya ancak `force` ile kabul edilir — bilinçli ve incelemede görünür.
 */
export function nextBaseline(current: Baseline, baseline: Baseline, force = false): Baseline {
  const out: Baseline = {};
  const files = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const file of files) {
    const now = current[file] ?? 0;
    const before = baseline[file];
    if (now === 0) continue;
    if (before === undefined) {
      if (force) out[file] = now;
      continue;
    }
    out[file] = force ? now : Math.min(now, before);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
