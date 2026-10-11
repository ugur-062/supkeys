/**
 * HERKESE AÇIK VERİ KATMANI — gizli segment (2026-10-09; arayüz denetimi W-19).
 * "Popüler kategoriler" (`/public/stats`) ve dizin özeti (`/public/companies/
 * summary`) listeleri bugün hiçbir sayfada çizilmiyor; çizen bileşenler
 * yeniden bağlanırsa gizli segmentin alt kategorisi adı + sayısıyla çıkmasın
 * diye süzgeç veriyi GETİREN yerde.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDirectorySummary, fetchStats } from "../marketplace-api";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => () => fn(),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// 2026-10-10: 46 görünür sektör (koruyucu giysi listede kalır); silah /
// kolluk dalları gizli — gizli aile (4610) ve gizli sınıf (461825) düşer.
const ROWS = [
  { id: "46101500", name: "Ateşli silahlar", count: 40 },
  { id: "39121000", name: "Panolar", count: 12 },
  { id: "77101500", name: "Çevre danışmanlığı", count: 3 },
  { id: "46181500", name: "Koruyucu giysi", count: 9 },
  { id: "46182500", name: "Kişisel güvenlik cihazları veya silahları", count: 2 },
];

describe("fetchStats — popularCategories", () => {
  it("gizli segmentin alt kategorisi listeden düşer; sayılar ve sıra korunur", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ products: 5, companies: 2, categories: 1, openDemands: 0, productsThisWeek: 0, bidsLast24h: 0, verifiedCompanies: 1, popularCategories: ROWS }),
    });
    const stats = await fetchStats();
    expect(stats.popularCategories).toEqual([
      { id: "39121000", name: "Panolar", count: 12 },
      { id: "46181500", name: "Koruyucu giysi", count: 9 },
    ]);
    expect(stats.products).toBe(5);
  });

  it("eski yanıt (alan yok) güvenli: boş liste", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ products: 1 }) });
    expect((await fetchStats()).popularCategories).toEqual([]);
  });
});

describe("fetchDirectorySummary — topCategories", () => {
  it("gizli segment 'en çok firma olan kategoriler'e girmez", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ verifiedCompanies: 7, topCategories: ROWS }) });
    const summary = await fetchDirectorySummary();
    expect(summary.topCategories.map((c) => c.id)).toEqual(["39121000", "46181500"]);
    expect(summary.verifiedCompanies).toBe(7);
  });
});
