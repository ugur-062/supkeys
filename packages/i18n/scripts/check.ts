/**
 * i18n kapısı — `pnpm --filter @rothern/i18n check` (CI'da da koşar).
 *
 *  1. Katalog bütünlüğü: orphan anahtar (hedefte var, kaynakta yok) · boş kaynak
 *     değeri · ICU yer tutucu paritesi · yasaklı terim (sözlük).
 *  2. Kapsam: ZORUNLU dillerde (EN) eksik + bayat = 0, aksi hâlde kırmızı;
 *     diğer diller yalnız rapor. Bayat = Türkçe kaynak değişmiş, çeviri yenilenmemiş
 *     (`pnpm i18n:sync` çözer).
 *  3. Cırcır: sabit Türkçe literal sayısı dosya başına tabanı AŞAMAZ; tabanda
 *     olmayan (yeni) dosya sıfır olmalı. `--update-baseline` yalnız DÜŞÜRÜR;
 *     artış `--force` ister (bilinçli, incelemede görünür).
 */
import path from "node:path";
import { findBannedTerm } from "../src/glossary";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "../src/locales";
import { NAMESPACES } from "../src/messages";
import {
  coverage,
  flatten,
  nextBaseline,
  placeholdersMatch,
  ratchetViolations,
  readJson,
  writeJson,
  type Baseline,
  type Flat,
  type StatusMap,
  type Tree,
} from "./lib/catalog";
import { scanRepo } from "./lib/scan-literals";

const PKG = path.resolve(__dirname, "..");
const REPO = path.resolve(PKG, "../..");
const BASELINE_FILE = path.join(PKG, "baseline/hardcoded.json");

/** Canlıya çıkmadan %100 olması ŞART diller. RU rapor kalır (karar: docs/plan-i18n.md). */
const REQUIRED_LOCALES: Locale[] = ["en"];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const updateBaseline = flag("--update-baseline");
const force = flag("--force");
const skipRatchet = flag("--no-ratchet");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--require" && args[i + 1]) {
    const l = args[i + 1] as Locale;
    if (!REQUIRED_LOCALES.includes(l)) REQUIRED_LOCALES.push(l);
  }
}

function loadFlat(locale: Locale): Flat {
  const out: Flat = {};
  for (const ns of NAMESPACES) {
    const tree = readJson<Tree>(path.join(PKG, `src/messages/${locale}/${ns}.json`), {});
    Object.assign(out, flatten(tree, ns));
  }
  return out;
}

const errors: string[] = [];
const warnings: string[] = [];
const source = loadFlat(DEFAULT_LOCALE);

// Kaynak kataloğun kendi denetimi.
for (const [key, text] of Object.entries(source)) {
  if (!text.trim()) errors.push(`tr: "${key}" boş`);
  const banned = findBannedTerm(text, DEFAULT_LOCALE);
  if (banned) errors.push(`tr: "${key}" yasaklı terim taşıyor: "${banned}"`);
}

console.log(`Kaynak (tr): ${Object.keys(source).length} anahtar`);

for (const locale of LOCALES) {
  if (locale === DEFAULT_LOCALE) continue;
  const target = loadFlat(locale);
  const status = readJson<StatusMap>(path.join(PKG, `src/status/${locale}.json`), {});
  const report = coverage(source, target, status);
  const required = REQUIRED_LOCALES.includes(locale);
  const pct = report.total === 0 ? 100 : Math.round((report.covered / report.total) * 1000) / 10;
  const machine = Object.values(status).filter((s) => s.status === "machine").length;

  console.log(
    `${locale}${required ? " (zorunlu)" : ""}: %${pct} — kapsanan ${report.covered}/${report.total}` +
      ` · eksik ${report.missing.length} · bayat ${report.stale.length}` +
      ` · durumsuz ${report.unknown.length} · makine ${machine}`,
  );

  for (const key of report.orphans) errors.push(`${locale}: "${key}" kaynakta yok (orphan) — sil`);
  for (const [key, text] of Object.entries(target)) {
    if (!(key in source)) continue;
    if (!placeholdersMatch(source[key]!, text)) {
      errors.push(`${locale}: "${key}" yer tutucuları kaynağa uymuyor`);
    }
    const banned = findBannedTerm(text, locale);
    if (banned) errors.push(`${locale}: "${key}" yasaklı terim taşıyor: "${banned}"`);
  }
  const gap = [...report.missing, ...report.stale];
  if (gap.length > 0) {
    const preview = gap.slice(0, 8).join(", ") + (gap.length > 8 ? ` … (+${gap.length - 8})` : "");
    const line = `${locale}: ${report.missing.length} eksik + ${report.stale.length} bayat anahtar → \`pnpm i18n:sync --locale ${locale}\` (${preview})`;
    if (required) errors.push(line);
    else warnings.push(line);
  }
  if (report.unknown.length > 0) {
    warnings.push(
      `${locale}: ${report.unknown.length} anahtarın durum kaydı yok (elle yazılmış) → \`pnpm i18n:sync --locale ${locale} --mark-reviewed <önek>\``,
    );
  }
}

if (!skipRatchet) {
  const current = scanRepo(REPO);
  const baseline = readJson<Baseline>(BASELINE_FILE, {});
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  const files = Object.keys(current).length;
  if (updateBaseline) {
    const next = nextBaseline(current, baseline, force);
    writeJson(BASELINE_FILE, next);
    const nextTotal = Object.values(next).reduce((a, b) => a + b, 0);
    console.log(
      `Cırcır tabanı yazıldı: ${Object.keys(next).length} dosya / ${nextTotal} literal` +
        (force ? " (FORCE — artışlar kabul edildi)" : ""),
    );
  } else {
    const violations = ratchetViolations(current, baseline);
    console.log(`Cırcır: ${files} dosyada ${total} sabit Türkçe literal (taban ${Object.keys(baseline).length} dosya)`);
    for (const v of violations) {
      errors.push(
        `cırcır: ${v.file} → ${v.count} literal, taban ${v.baseline}` +
          ` — metni kataloğa taşı (tr.json + t("…")); bilinçli istisna için \`pnpm --filter @rothern/i18n ratchet:update --force\``,
      );
    }
  }
}

for (const w of warnings) console.log(`UYARI ${w}`);
for (const e of errors) console.error(`HATA ${e}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} hata.`);
  process.exit(1);
}
console.log("\ni18n kapısı yeşil.");
