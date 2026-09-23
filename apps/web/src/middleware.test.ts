import { describe, expect, it, vi } from "vitest";

// next-intl middleware fabrikası vitest altında `next/server`ı çözemiyor; burada yalnız
// `config.matcher` sınanıyor — fabrika sahte.
vi.mock("next-intl/middleware", () => ({ default: () => () => null }));

const { config } = await import("./middleware");

/**
 * i18n Faz 1 (2026-09-23): Türkçe adresler ÖN EKSİZ ve `/tr/...`a yeniden yazımı
 * bu middleware yapar. `<Link>` ön yüklemeleri (`Next-Router-Prefetch` /
 * `Purpose: prefetch`) middleware'den MUAF tutulursa ham yol `[locale]="urunler"`
 * gibi yanlış eşleşir ve ön yükleme 404 döner; tıklanınca "Sayfa bulunamadı"
 * açılır (staging'de ölçüldü). Eşleştirici bu istekleri dışarıda bırakamaz.
 */
describe("middleware matcher", () => {
  it("ön yükleme isteklerini muaf tutmaz (missing: next-router-prefetch / purpose yok)", () => {
    const entries = config.matcher as unknown[];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      if (typeof entry === "string") continue;
      const missing = (entry as { missing?: { key: string }[] }).missing ?? [];
      expect(missing.map((m) => m.key.toLowerCase())).not.toContain("next-router-prefetch");
      expect(missing.map((m) => m.key.toLowerCase())).not.toContain("purpose");
    }
  });

  it("API ve Next iç varlıklarını eşleştirmez, sayfaları eşleştirir", () => {
    const source = (config.matcher as (string | { source: string })[]).map((e) => (typeof e === "string" ? e : e.source))[0];
    const re = new RegExp(`^${source}$`);
    expect(re.test("/urunler")).toBe(true);
    expect(re.test("/en/urunler")).toBe(true);
    expect(re.test("/api/health")).toBe(false);
    expect(re.test("/_next/static/x.js")).toBe(false);
  });
});
