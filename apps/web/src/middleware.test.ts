import { describe, expect, it, vi } from "vitest";

// next-intl middleware fabrikası vitest altında `next/server`ı çözemiyor; burada yalnız
// `config.matcher` sınanıyor — fabrika sahte.
vi.mock("next-intl/middleware", () => ({ default: () => () => null }));

const { config, permanentize } = await import("./middleware");

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

describe("permanentize — next-intl 307'leri 308'e çevirir", () => {
  it("Location taşıyan 307 → 308, başlıklar (çerez dahil) korunur", () => {
    const headers = new Headers({ location: "/en/products", "set-cookie": "NEXT_LOCALE=en; Path=/" });
    const out = permanentize({ status: 307, headers } as never);
    expect(out.status).toBe(308);
    expect(out.headers.get("location")).toBe("/en/products");
    expect(out.headers.get("set-cookie")).toContain("NEXT_LOCALE=en");
  });

  it("yönlendirme olmayan yanıt olduğu gibi döner", () => {
    const res = { status: 200, headers: new Headers() };
    expect(permanentize(res as never)).toBe(res);
  });
});
