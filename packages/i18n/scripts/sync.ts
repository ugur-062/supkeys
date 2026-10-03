/**
 * Çeviri iş listesi ve uygulama — MAKİNE ÇEVİRİSİ YOK (kullanıcı kararı
 * 2026-09-23: "Gemini Flash çeviriye bağlanmayacak"). Çeviriyi Claude, fazlar
 * sırasında ekran bağlamıyla yazar; sonradan eklenen dizeler için ayrı çözüm
 * bulunacak. Bu betik yalnız LİSTELER, UYGULAR ve İŞARETLER:
 *
 *   pnpm i18n:sync                        dil başına eksik/bayat anahtarları Türkçe kaynakla listeler
 *   pnpm i18n:sync --out <dosya.json>     aynı listeyi { "<dil>": { "<anahtar>": "<tr metni>" } } olarak yazar
 *   pnpm i18n:sync --apply <dosya.json>   { "<dil>": { "<anahtar>": "<çeviri>" } } uygular
 *                                         (yer tutucu paritesi + yasaklı terim denetimi; durum `reviewed`)
 *   pnpm i18n:sync --mark-reviewed <önek> [--locale en]   var olan çevirileri onaylı işaretler
 *
 * Kataloglar kaynak sırasında yazılır (diff'lenebilir); kaynakta olmayan
 * anahtarlar (orphan) hedeften düşürülür.
 */
import path from "node:path";
import { findBannedTerm } from "../src/glossary";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "../src/locales";
import { NAMESPACES } from "../src/messages";
import {
  coverage,
  flatten,
  hashSource,
  orderLike,
  placeholdersMatch,
  readJson,
  unflatten,
  writeJson,
  type Flat,
  type StatusMap,
  type Tree,
} from "./lib/catalog";

const PKG = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const outFile = opt("--out");
const applyFile = opt("--apply");
const markReviewed = opt("--mark-reviewed");
const targets = (opt("--locale")?.split(",") ?? LOCALES.filter((l) => l !== DEFAULT_LOCALE)).filter(
  (l): l is Locale => (LOCALES as readonly string[]).includes(l) && l !== DEFAULT_LOCALE,
);

function loadFlat(locale: Locale): Flat {
  const out: Flat = {};
  for (const ns of NAMESPACES) {
    Object.assign(out, flatten(readJson<Tree>(path.join(PKG, `src/messages/${locale}/${ns}.json`), {}), ns));
  }
  return out;
}

function saveFlat(locale: Locale, flat: Flat, reference: Flat): void {
  for (const ns of NAMESPACES) {
    const prefix = `${ns}.`;
    const pick = (f: Flat): Flat =>
      Object.fromEntries(
        Object.entries(f)
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => [k.slice(prefix.length), v]),
      );
    writeJson(path.join(PKG, `src/messages/${locale}/${ns}.json`), unflatten(orderLike(pick(flat), pick(reference))));
  }
}

function saveStatus(locale: Locale, status: StatusMap): void {
  writeJson(
    path.join(PKG, `src/status/${locale}.json`),
    Object.fromEntries(Object.entries(status).sort(([a], [b]) => a.localeCompare(b))),
  );
}

function main(): void {
  const source = loadFlat(DEFAULT_LOCALE);
  const now = new Date().toISOString().slice(0, 10);
  const todoAll: Record<string, Record<string, string>> = {};
  const applyAll = applyFile ? readJson<Record<string, Record<string, string>>>(path.resolve(applyFile), {}) : null;

  for (const locale of targets) {
    const target = loadFlat(locale);
    const status = readJson<StatusMap>(path.join(PKG, `src/status/${locale}.json`), {});

    if (markReviewed !== undefined) {
      let n = 0;
      for (const key of Object.keys(source)) {
        if (!key.startsWith(markReviewed) || !(key in target)) continue;
        status[key] = { hash: hashSource(source[key]!), status: "reviewed", at: now };
        n++;
      }
      saveStatus(locale, status);
      console.log(`${locale}: ${n} anahtar "reviewed" işaretlendi (önek "${markReviewed}")`);
      continue;
    }

    if (applyAll) {
      const incoming = applyAll[locale] ?? {};
      let applied = 0;
      const rejected: string[] = [];
      for (const [key, raw] of Object.entries(incoming)) {
        const text = typeof raw === "string" ? raw.trim() : "";
        if (!(key in source)) {
          rejected.push(`${key} (kaynakta yok)`);
          continue;
        }
        if (!text) {
          rejected.push(`${key} (boş)`);
          continue;
        }
        if (!placeholdersMatch(source[key]!, text)) {
          rejected.push(`${key} (yer tutucu uyumsuz)`);
          continue;
        }
        const banned = findBannedTerm(text, locale);
        if (banned) {
          rejected.push(`${key} (yasaklı terim "${banned}")`);
          continue;
        }
        target[key] = text;
        status[key] = { hash: hashSource(source[key]!), status: "reviewed", at: now };
        applied++;
      }
      for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
      for (const key of Object.keys(status)) if (!(key in source)) delete status[key];
      saveFlat(locale, target, source);
      saveStatus(locale, status);
      console.log(`${locale}: ${applied} çeviri uygulandı${rejected.length ? `, ${rejected.length} reddedildi` : ""}`);
      for (const r of rejected) console.log(`  RED ${r}`);
      continue;
    }

    const report = coverage(source, target, status);
    const todo = [...report.missing, ...report.stale];
    console.log(`${locale}: eksik ${report.missing.length}, bayat ${report.stale.length}`);
    if (todo.length === 0) continue;
    todoAll[locale] = Object.fromEntries(todo.map((key) => [key, source[key]!]));
    if (!outFile) for (const key of todo) console.log(`  ${key}: ${source[key]}`);
  }

  if (outFile && !applyAll && markReviewed === undefined) {
    writeJson(path.resolve(outFile), todoAll);
    const n = Object.values(todoAll).reduce((a, m) => a + Object.keys(m).length, 0);
    console.log(`${n} anahtar iş listesi yazıldı: ${outFile}`);
  }
}

main();
