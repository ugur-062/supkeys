/**
 * SAHİBİN ÖNİZLEMESİ ÖNBELLEĞİ ATLAR (2026-09-17): `?onizleme=1` ile gelen
 * istek profili ve ürünleri `cache: "no-store"` ile çeker; normal istek ISR
 * etiketli önbellekte kalır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCompanyProfile, fetchCompanyProducts } from "../marketplace-api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
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
    const init = fetchMock.mock.calls[0][1] as RequestInit & { next?: { revalidate: number; tags: string[] } };
    expect(init.cache).toBeUndefined();
    expect(init.next?.revalidate).toBe(300);
    expect(init.next?.tags).toContain("company:demo");
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
  });
});
