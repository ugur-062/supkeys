/**
 * `Category.keywords` kolonunun TEK KAYNAĞI.
 *
 * İki script bu kolonu yazıyor — `seed-categories.ts` (tam reseed) ve
 * `apply-category-keywords.ts` (canlıya in-place). İkisi de aynı bileşimi
 * üretmeli, yoksa apply koşumu seed'in yazdığının bir kısmını SİLER: apply
 * `SET keywords = …` ile REPLACE yapıyor, merge değil.
 *
 * Tam da bu oldu (2026-09-02 yakalandı): seed, çakışan kodların düşen adlarını
 * keywords'e katlıyordu; apply ise yalnız sözlük TSV'lerini biliyordu ve
 * ardından koşulduğunda "Hazır Beton" araması sessizce ölürdü.
 *
 * Bileşim iki parçadır:
 *   1. Küratörlü eşanlamlı sözlüğü — İKİ dosya, sıra kritik: üretilen ÖNCE,
 *      elle yazılan SONRA (aynı kodda insan kararı kazanır ve yeniden
 *      üretimde kaybolmaz).
 *   2. Ariba kataloğunda aynı kodu paylaşan DÜŞEN adlar
 *      (`ariba-categories.tsv` 7. sütun). Etiket olarak gösterilmezler ama
 *      arama onları bulmalı — bkz. docs/category-duplicate-codes.md.
 *   3. ÇEVRİLEN adların İNGİLİZCE ASLI (`category-translations.tsv` 3. sütun).
 *      "ball bearing" arayan "Bilyalı rulman"ı bulmaya devam etmeli; çeviri
 *      arama hazinesini DARALTMAMALI.
 *
 * Hepsi YALNIZ aramayı besler (`searchText`); gösterilen ad `nameTr`'dir.
 */
import * as fs from "fs";
import * as path from "path";

function readTwoColumnTsv(
  filePath: string,
  into: Map<string, string>,
): number {
  if (!fs.existsSync(filePath)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [code, kw] = line.split("\t");
    if (code?.trim() && kw?.trim()) {
      into.set(code.trim(), kw.trim());
      n++;
    }
  }
  return n;
}

/** Ariba TSV 7. sütunu: `|` ile ayrılmış düşen adlar → boşluklu tek dize. */
function readAltNames(seedsDir: string, into: Map<string, string>): number {
  const p = path.join(seedsDir, "ariba-categories.tsv");
  if (!fs.existsSync(p)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cols = line.split("\t");
    const code = cols[0]?.trim();
    const alt = (cols[6] ?? "").split("|").join(" ").trim();
    if (code && alt) {
      into.set(code, alt);
      n++;
    }
  }
  return n;
}

/**
 * Çeviri overlay'i: kod → { tr: gösterilecek ad, source: İngilizce aslı }.
 *
 * İKİ DOSYA, sıra kritik — sözlükle AYNI öncelik kuralı:
 *   1. category-translations.tsv          — AI üretti (gen-category-translations)
 *   2. category-translations.curated.tsv  — ELLE yazıldı, aynı kodda EZER
 * Gerekçe: insan düzeltmesi AI yeniden koşulduğunda kaybolmamalı. Üst
 * seviyeler (segment/aile) elle yazılmaya değer — herkes onları görüyor.
 */
export function readTranslations(
  seedsDir: string,
): Map<string, { tr: string; source: string }> {
  const out = new Map<string, { tr: string; source: string }>();
  for (const name of [
    "category-translations.tsv",
    "category-translations.curated.tsv",
  ]) {
    const p = path.join(seedsDir, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const [code, tr, source] = line.split("\t");
      if (code?.trim() && tr?.trim()) {
        // Elle yazılan dosyada 3. sütun boş olabilir — o kodda ÜRETİLEN
        // satırın kaynağı korunur, yoksa arama İngilizce terimi kaybederdi.
        const prev = out.get(code.trim());
        out.set(code.trim(), {
          tr: tr.trim(),
          source: (source ?? "").trim() || prev?.source || "",
        });
      }
    }
  }
  return out;
}

export interface KeywordBuild {
  /** Kod → nihai `keywords` dizesi (sözlük + düşen adlar + İngilizce asıl). */
  byCode: Map<string, string>;
  generated: number;
  curated: number;
  altNames: number;
  sourceNames: number;
}

/**
 * Nihai keywords haritasını kurar. İki script de YALNIZ bunu çağırmalı —
 * kolonu elle bileştiren ikinci bir yer olmamalı.
 */
export function buildKeywordsByCode(seedsDir: string): KeywordBuild {
  const curatedMap = new Map<string, string>();
  const generated = readTwoColumnTsv(
    path.join(seedsDir, "category-keywords.generated.tsv"),
    curatedMap,
  );
  const curated = readTwoColumnTsv(
    path.join(seedsDir, "category-keywords.tsv"),
    curatedMap,
  );

  const altMap = new Map<string, string>();
  const altNames = readAltNames(seedsDir, altMap);

  // Çevrilen adın İngilizce aslı da aramaya girer.
  const srcMap = new Map<string, string>();
  for (const [code, t] of readTranslations(seedsDir)) {
    if (t.source) srcMap.set(code, t.source);
  }

  const byCode = new Map<string, string>();
  for (const code of new Set([
    ...curatedMap.keys(),
    ...altMap.keys(),
    ...srcMap.keys(),
  ])) {
    const merged = [curatedMap.get(code), altMap.get(code), srcMap.get(code)]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (merged) byCode.set(code, merged);
  }

  return { byCode, generated, curated, altNames, sourceNames: srcMap.size };
}
