/**
 * SAHİBİN ÖNİZLEMESİ ÖNBELLEĞİ ATLAR (2026-09-17): `?onizleme=1` ile gelen
 * istek profili ve ürünleri önbelleksiz (`cache: "no-store"`) çeker; normal
 * istek ISR etiketli veri önbelleğinde kalır (RM-12'den beri `unstable_cache`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCompanyProfile, fetchCompanyProducts } from "../marketplace-api";

const cacheOpts: { revalidate?: number; tags?: string[] }[] = [];
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, _key: string[], opts: { revalidate?: number; tags?: string[] }) =>
    () => {
      cacheOpts.push(opts);
      return fn();
    },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  cacheOpts.length = 0;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0, page: 1, pageSize: 24 }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchCompanyProfile / fetchCompanyProducts — fresh", () => {
  it("varsayılan: ISR etiketli önbellek", async () => {
    await fetchCompanyProfile("demo");
    expect(cacheOpts).toHaveLength(1);
    expect(cacheOpts[0].revalidate).toBe(300);
    expect(cacheOpts[0].tags).toContain("company:demo");
  });

  it("fresh: no-store, etiket yok (profil + ürünler)", async () => {
    await fetchCompanyProfile("demo", { fresh: true });
    await fetchCompanyProducts("demo", { fresh: true });
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit & { next?: unknown };
      expect(init.cache).toBe("no-store");
      expect(init.next).toBeUndefined();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cacheOpts).toHaveLength(0);
  });
});
