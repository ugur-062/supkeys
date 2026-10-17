/**
 * BOŞ DİZİN KORUMASI: dizin boşsa `noindex`; sayım yapılamıyorsa (API
 * erişilemez) sayfa İNDEKSLENEBİLİR kalır.
 *
 * Gerçek veri katmanıyla sınanır (yalnız `fetch` sahte): gözden geçirme C2-2 —
 * sayım İKİNCİL OKUMADIR. Ana liste çağrısıyla sayılırken `generateMetadata`
 * ana verinin yeniden deneme politikasını devralıyordu: API 500 dönünce dört
 * istek, ~4 sn bekleme ve süreç genelinde tek deneme kipi (sayfanın gerçek ana
 * okuması yeniden denemesiz kalıyordu).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchListing } from "@/lib/public/marketplace-api";
import { upstreamClock, upstreamInCooldown } from "@/lib/public/upstream-retry";
import { dizinBos, type DizinTuru } from "../empty-index-guard";

const fetchMock = vi.fn();
const response = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const page = (total: number) => response(200, { items: [], total, page: 1, pageSize: 24 });

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

describe("boş dizin koruması", () => {
  it("kayıt yokken noindex ister", async () => {
    fetchMock.mockResolvedValue(page(0));
    expect(await dizinBos("urunler")).toBe(true);
  });

  it("kayıt varken indekslenebilir kalır", async () => {
    fetchMock.mockResolvedValue(page(3));
    expect(await dizinBos("firmalar")).toBe(false);
  });

  it("API patlarsa İNDEKSLENEBİLİR kalır (geçici hata kalıcı SEO kaybına dönüşmesin)", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await dizinBos("talepler")).toBe(false);
  });

  it.each([500, 503, 429, 400])("HTTP %i → İNDEKSLENEBİLİR kalır (sayılamayan dizin boş sayılmaz)", async (status) => {
    fetchMock.mockResolvedValue(response(status));
    expect(await dizinBos("urunler")).toBe(false);
    expect(await dizinBos("firmalar")).toBe(false);
    expect(await dizinBos("talepler")).toBe(false);
  });

  it("404 kesinti değildir: API'de pazar yeri kapalıyken boş çizilen dizin noindex kalır (fail-closed)", async () => {
    fetchMock.mockResolvedValue(response(404));
    expect(await dizinBos("urunler")).toBe(true);
    expect(await dizinBos("firmalar")).toBe(true);
    expect(await dizinBos("talepler")).toBe(true);
  });

  it("her dizin ana listesinin adresini sayar (veri önbelleği girdisi paylaşılır)", async () => {
    fetchMock.mockResolvedValue(page(1));
    const asked = async (tur: DizinTuru) => {
      fetchMock.mockClear();
      await dizinBos(tur);
      return fetchMock.mock.calls.map((c) => String(c[0]));
    };
    expect(await asked("urunler")).toEqual(["https://api.test/api/public/products"]);
    expect(await asked("firmalar")).toEqual(["https://api.test/api/public/companies/directory"]);
    expect(await asked("talepler")).toEqual(["https://api.test/api/public/listings"]);
  });
});

describe("boş dizin sayımı — ikincil okuma (gözden geçirme C2-2)", () => {
  it.each<DizinTuru>(["urunler", "firmalar", "talepler"])("%s: API 500 dönerken TEK istek; yeniden deneme takvimi beklenmez", async (tur) => {
    fetchMock.mockResolvedValue(response(500));
    const sleep = vi.mocked(upstreamClock.sleep);
    sleep.mockClear();
    expect(await dizinBos(tur)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("sayımın vazgeçişi tek deneme kipini AÇMAZ: sayfanın ana okuması yeniden denemeyle toparlanır", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await dizinBos("talepler");
    expect(upstreamInCooldown()).toBe(false);
    fetchMock.mockReset().mockResolvedValueOnce(response(503)).mockResolvedValue(response(200, { number: "ROT-000001", title: "Vana" }));
    await expect(fetchListing("rot-000001")).resolves.toMatchObject({ title: "Vana" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
