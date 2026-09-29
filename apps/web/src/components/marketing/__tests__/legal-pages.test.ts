import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SÖZLEŞME SAYFALARI BEKÇİSİ (derin denetim LU-23): `LegalDoc` `updatedAt`i
 * `formatDate` ile biçimler; ISO olmayan değer ("26 Temmuz 2026") geçersiz
 * tarih → ekranda "Son güncelleme: —". Meta başlık/açıklama da katalogdan
 * gelir (kabuk ve meta çevrilir, gövde Türkçe kalır) — Türkçe literal EN/RU
 * sekme başlığında ve OG kartında Türkçe çıkıyordu.
 */
const DIR = path.resolve(__dirname, "../../../app/[locale]/sozlesmeler");
const pages = readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => ({ name: e.name, src: readFileSync(path.join(DIR, e.name, "page.tsx"), "utf8") }));

describe("sözleşme sayfaları", () => {
  it("en az bir sayfa bulunur", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages)("$name: updatedAt ISO tarih ve geçerli", ({ src }) => {
    const m = src.match(/updatedAt="([^"]*)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(new Date(m![1]).getTime())).toBe(true);
  });

  it.each(pages)("$name: meta başlık ve açıklama katalogdan", ({ src }) => {
    expect(src).toMatch(/namespace: "web\.marketing\.legal\.\w+"/);
    expect(src).toContain('title: t("metaTitle")');
    expect(src).toContain('description: t("metaDesc")');
  });
});
