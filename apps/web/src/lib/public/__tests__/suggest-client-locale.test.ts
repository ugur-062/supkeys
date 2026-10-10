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

/**
 * GİZLİ DAL MENÜYE GİRMEZ (2026-10-10, sahip kararı). 46 "İş Güvenliği ve
 * Yangın Ekipmanları" görünür sektördür; silah ve kolluk aileleri gizli. Menü
 * ağacı sektörün ALT listesini çizer — gizli aile orada satır olmaz. API aynı
 * süzgeci uygular; istemci ikinci kattır (eski yanıt, kenar önbelleği).
 */
describe("mega menü — gizli sektör ve görünür sektörün gizli ailesi", () => {
  it("gizli sektör düğümü ve gizli aile düşer; görünür sektör ve aileleri sırasıyla kalır", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "46000000",
          slug: "is-guvenligi-ve-yangin-ekipmanlari",
          name: "İş Güvenliği ve Yangın Ekipmanları",
          count: 12,
          children: [
            { id: "46100000", name: "Hafif silahlar ve mühimmat", count: 3 },
            { id: "46180000", name: "Kişisel koruyucu donanım", count: 7 },
            { id: "46150000", name: "Kolluk ekipmanları", count: 1 },
            { id: "46190000", name: "Yangından korunma", count: 5 },
          ],
        },
        { id: "77000000", slug: "cevre-hizmetleri", name: "Çevre Hizmetleri", count: 2, children: [] },
        { id: "39000000", slug: "elektrik", name: "Elektrik", count: 4, children: [{ id: "39120000", name: "Panolar", count: 4 }] },
      ],
    });
    const menu = await fetchCategoryMenu("de");
    expect(menu.map((n) => n.id)).toEqual(["46000000", "39000000"]);
    expect(menu[0]!.children.map((c) => c.id)).toEqual(["46180000", "46190000"]);
    expect(menu[1]!.children).toEqual([{ id: "39120000", name: "Panolar", count: 4 }]);
    expect(JSON.stringify(menu)).not.toMatch(/silah|Kolluk|Çevre/);
  });
});
