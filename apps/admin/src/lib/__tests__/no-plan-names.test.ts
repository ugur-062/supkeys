import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ÜCRETSİZ DÖNEM NÖBETÇİSİ (sahip kararı 2026-10-07): admin paneli hiçbir
 * yerde üyelik kademesi adı ya da üyelik ücreti dili basmaz; kademenin
 * gösterildiği her yerde doğrulama durumu gösterilir. Kaynak dosyalar yorumlar
 * ayıklanarak taranır. İç tanımlayıcılar (BÜYÜK HARFLİ enum kodları, `tier`
 * alan adı) yasak değildir — yalnız ekrana basılabilecek yazımlar aranır.
 *
 * TEK İSTİSNA: `lib/audit-format.ts` `LEGACY_TIER_VALUES` — geçmiş denetim
 * satırlarındaki eski kademe kodlarının okunur karşılığı (3 satır).
 */
const SRC = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Blok ve satır yorumlarını boşaltır (satır sayısı korunur). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s;,{(])\/\/.*$/gm, "$1");
}

const BANNED =
  /\b(Gold|Silver|Premium|Standart|gold|silver|premium|standart|Gümüş|Altın)\b|[Pp]aket|PAKET|ücretli|Ücretli|\b[Tt]arife/;

// İstisna kalmadı (2026-10-07): geçmiş denetim satırlarının kademe kodları da
// nötr adla okunur (`LEGACY_TIER_VALUES`: Temel / Orta kademe / Üst kademe).
const ALLOWED_HITS: Record<string, number> = {};

describe("admin: üyelik kademesi adı / üyelik ücreti dili yok (ücretsiz dönem)", () => {
  it("kaynakta ekrana basılabilecek kademe adı kalmadı", () => {
    const hits: Record<string, string[]> = {};
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split("\\").join("/");
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (BANNED.test(line)) (hits[rel] ??= []).push(`${rel}:${i + 1} ${line.trim()}`);
        });
    }
    const unexpected = Object.entries(hits).flatMap(([rel, lines]) =>
      lines.length === (ALLOWED_HITS[rel] ?? 0) ? [] : lines,
    );
    expect(unexpected).toEqual([]);
    // İstisna gerçekten kullanılıyor (sözlük silinirse liste de temizlensin).
    for (const rel of Object.keys(ALLOWED_HITS)) {
      expect(hits[rel]?.length ?? 0).toBe(ALLOWED_HITS[rel]);
    }
  });

  it("kaldırılan ekranların dosyaları geri gelmedi", () => {
    const files = walk(SRC).map((f) => relative(SRC, f).split("\\").join("/"));
    expect(files.filter((f) => /uyelik-raporu|membership-tab|tier-warnings|membership-event/.test(f))).toEqual([]);
  });
});
