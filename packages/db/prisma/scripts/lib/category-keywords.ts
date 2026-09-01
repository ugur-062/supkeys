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
 *
 * Hepsi YALNIZ aramayı besler (`searchText`); `nameTr` asla değişmez.
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

export interface KeywordBuild {
  /** Kod → nihai `keywords` dizesi (sözlük + düşen adlar). */
  byCode: Map<string, string>;
  generated: number;
  curated: number;
  altNames: number;
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

  const byCode = new Map<string, string>();
  for (const code of new Set([...curatedMap.keys(), ...altMap.keys()])) {
    const merged = [curatedMap.get(code), altMap.get(code)]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (merged) byCode.set(code, merged);
  }

  return { byCode, generated, curated, altNames };
}
