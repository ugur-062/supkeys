/**
 * HERKESE AÇIK SÖZLÜK KİLİDİ (2026-09-04): ziyaretçinin gördüğü hiçbir
 * yerde "ihale", "e-ihale", "Satışçı" geçmez. Tek terminoloji: alım talebi /
 * satış ilanı / ürün / firma. Panel rol adları (Satışçı) ürün sözlüğüdür ve
 * panelde kalır — bu test yalnız public yüzeyi tarar.
 *
 * Yorumlar taranmaz (kod adları/gerekçeler kalabilir); JSX metni, dize ve
 * özniteliklerdeki her geçiş kırar.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const PUBLIC_DIRS = [
  "app/page.tsx",
  "app/alim-talepleri",
  "app/urunler",
  "app/firmalar",
  "app/firma",
  "app/talep",
  "app/nasil-calisir",
  "app/hakkimizda",
  "app/iletisim",
  "app/talep-onayla",
  "components/marketplace",
  "components/marketing",
];
const FORBIDDEN = /\b(e-ihale|ihale\w*|Satışçı|Satılık)\b/iu;

function files(p: string): string[] {
  const full = path.join(SRC, p);
  const st = statSync(full);
  if (st.isFile()) return [full];
  return readdirSync(full).flatMap((f) => files(path.join(p, f)));
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

describe("herkese açık yüzeyde yasak terimler", () => {
  it("ihale / e-ihale / Satışçı / Satılık geçmez (satış ilanı denir)", () => {
    const hits: string[] = [];
    for (const dir of PUBLIC_DIRS) {
      for (const f of files(dir)) {
        if (!/\.(tsx?|mdx?)$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
        const lines = stripComments(readFileSync(f, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (FORBIDDEN.test(line)) hits.push(`${path.relative(SRC, f)}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
