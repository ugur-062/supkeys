/**
 * Derin denetim LU-24: arama sekmesi sayaçları ikincildir — karşı yüzeyin ucu
 * kesintide (5xx/429/ağ) hata atsa da `crossCounts` reddedilmez; yalnız o
 * rozet düşer, arama sayfası hata sayfasına gitmez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crossCounts } from "../cross-counts";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("crossCounts", () => {
  it("sorgu yoksa istek atmaz", async () => {
    expect(await crossCounts(undefined, "products")).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("karşı yüzey 500 / 429 / ağ hatası → rozet yok, reddetmez", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(crossCounts("vana", "products")).resolves.toEqual({});
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(crossCounts("vana", "listings")).resolves.toEqual({});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(crossCounts("vana", "products")).resolves.toEqual({});
  });

  it("sağlıklı uç → toplam", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [], total: 7, page: 1, pageSize: 20 }) });
    await expect(crossCounts("vana", "products")).resolves.toEqual({ listings: 7 });
  });
});
