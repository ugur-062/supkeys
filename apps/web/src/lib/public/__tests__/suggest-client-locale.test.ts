/**
 * Derin denetim S093/X05/X06: typeahead ve mega menü istekleri SAYFA dilini
 * Accept-Language ile gönderir (tarayıcının kendi başlığı değil); menü
 * önbelleği dil başınadır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCategoryMenu, fetchSuggest } from "../suggest-client";

const fetchMock = vi.fn();
const NODE = { id: "n1", slug: "elektrik", name: "Elektrik", children: [] };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => [NODE] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const langOf = (call: unknown[]) =>
  ((call[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.["accept-language"];

describe("suggest-client sayfa dili", () => {
  it("fetchSuggest sayfa dilini accept-language olarak yollar", async () => {
    await fetchSuggest("boru", "products", "en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(langOf(fetchMock.mock.calls[0]!)).toBe("en");
  });

  it("fetchCategoryMenu dil başına önbelleklenir ve her dil kendi başlığıyla çekilir", async () => {
    await fetchCategoryMenu("ru");
    await fetchCategoryMenu("ru");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(langOf(fetchMock.mock.calls[0]!)).toBe("ru");
    await fetchCategoryMenu("tr");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(langOf(fetchMock.mock.calls[1]!)).toBe("tr");
  });
});

describe("mega menü önbelleği — geçici hata kalıcı değil (derin denetim LU-24)", () => {
  it("5xx / ağ hatası / boş yanıt önbelleğe girmez; sonraki açılış yeniden dener", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
    expect(await fetchCategoryMenu("en")).toEqual([]);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await fetchCategoryMenu("en")).toEqual([]);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    expect(await fetchCategoryMenu("en")).toEqual([]);
    expect(await fetchCategoryMenu("en")).toEqual([NODE]);
    expect(await fetchCategoryMenu("en")).toEqual([NODE]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
