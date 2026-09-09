import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_PREFIXES } from "@/lib/public-routes";

/**
 * SAYFA METASI SÖZLEŞMESİ (SEO Parça 7).
 *
 * "Eklenen her sayfa otomatik olarak yüksek SEO'ya sahip olsun" kararının
 * dosya sistemi bekçisi: herkese açık her `page.tsx` metasını ŞABLONDAN
 * üretmek zorunda (`buildMetadata` ya da varlık üreticileri `productSeo`/
 * `companySeo`/`listingSeo`). Elle yazılan `metadata` nesneleri zamanla
 * ayrışıyordu — canlıda "… — Rothern · Rothern" başlıklar ve anasayfanın
 * açıklamasını miras alan sayfalar bundandı (2026-09-09 denetimi).
 *
 * İkinci kural: başlık dizesine "Rothern" ELLE eklenmez; kök şablon
 * (`%s · Rothern`) ekliyor. (Anasayfa istisna: `title.absolute`.)
 */

const APP_DIR = path.resolve(__dirname, "../../../app");
const TEMPLATE_RE = /\b(buildMetadata|productSeo|companySeo|listingSeo)\s*\(/;
const HAND_BRAND_RE = /title:\s*[`"'][^`"'\n]*Rothern[^`"'\n]*[`"']/;

function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pagesUnder(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

function publicPages(): string[] {
  const roots = [path.join(APP_DIR, "page.tsx"), ...PUBLIC_ROUTE_PREFIXES.map((p) => path.join(APP_DIR, p.slice(1)))];
  const files: string[] = [];
  for (const r of roots) {
    try {
      if (statSync(r).isDirectory()) files.push(...pagesUnder(r));
      else files.push(r);
    } catch {
      /* henüz oluşturulmamış rota */
    }
  }
  return files;
}

describe("herkese açık sayfa metası şablondan üretilir", () => {
  const files = publicPages();

  it("en az anasayfa + pazar yeri sayfaları taranıyor (test boşa dönmüyor)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("her public page.tsx buildMetadata/productSeo/companySeo/listingSeo çağırır", () => {
    const offenders = files.filter((f) => !TEMPLATE_RE.test(readFileSync(f, "utf-8")));
    expect(offenders.map((f) => path.relative(APP_DIR, f))).toEqual([]);
  });

  it("başlığa 'Rothern' elle eklenmez (kök şablon ekliyor)", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf-8");
      // `title: { absolute: "Rothern — …" }` bilinçli istisna (anasayfa).
      return HAND_BRAND_RE.test(src.replace(/absolute:\s*"[^"]*"/g, ""));
    });
    expect(offenders.map((f) => path.relative(APP_DIR, f))).toEqual([]);
  });
});
