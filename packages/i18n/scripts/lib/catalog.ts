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

/** ICU argüman adları (`{n}`, `{count, plural, …}`) — sıralı, tekil. */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  const re = /\{\s*([A-Za-z_][\w]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) names.add(m[1]!);
  return [...names].sort();
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
