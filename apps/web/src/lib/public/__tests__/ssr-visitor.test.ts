/**
 * SSR ZİYARETÇİ İLİŞKİLENDİRMESİ (derin denetim MU-12, gözden geçirme): tek
 * ortak SSR kovasını tek ziyaretçi doldurmasın diye parametreli dinamik çizim
 * gerçek ziyaretçi IP'sini `x-rothern-client-ip` ile API'ye iletir. Kanonik
 * (parametresiz) çizim IP taşımaz — paylaşılan veri önbelleği bölünmez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerStore.get(k) ?? null }),
}));
// Vitest istemci React'ı yükler (`cache` ezberlemez); RSC'deki istek kapsamını taklit et.
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return {
    ...actual,
    cache: <T,>(fn: () => T) => {
      let memo: { v: T } | undefined;
      return () => (memo ??= { v: fn() }).v;
    },
  };
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  headerStore.clear();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  vi.stubEnv("SEO_REVALIDATE_SECRET", "s".repeat(32));
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0, page: 1, pageSize: 24 }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentHeaders = (i = 0) => (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;

describe("ssr-visitor", () => {
  it("hasSearchParams: boş değer ve boş nesne sayılmaz", async () => {
    const { hasSearchParams } = await import("../ssr-visitor");
    expect(hasSearchParams(undefined)).toBe(false);
    expect(hasSearchParams({})).toBe(false);
    expect(hasSearchParams({ q: "", sayfa: undefined, x: [" "] })).toBe(false);
    expect(hasSearchParams({ q: "celik" })).toBe(true);
    expect(hasSearchParams({ kategori: ["a"] })).toBe(true);
    expect(hasSearchParams(new URLSearchParams("onizleme=1"))).toBe(true);
    expect(hasSearchParams(new URLSearchParams(""))).toBe(false);
  });

  it("visitorIpFrom: x-real-ip önce, sonra x-forwarded-for ilk öğe", async () => {
    const { visitorIpFrom } = await import("../ssr-visitor");
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(visitorIpFrom(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(visitorIpFrom(h({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" }))).toBe("198.51.100.2");
    expect(visitorIpFrom(h({}))).toBeUndefined();
  });

  it("parametreli çizim: sonraki pazar yeri çağrısı ziyaretçi IP'sini iletir", async () => {
    headerStore.set("x-real-ip", "203.0.113.7");
    const { attributeSsrToVisitor, SSR_CLIENT_IP_HEADER } = await import("../ssr-visitor");
    const { fetchCompanyProducts } = await import("../marketplace-api");
    await attributeSsrToVisitor({ q: "rastgele-123" });
    await fetchCompanyProducts("demo", { q: "rastgele-123" });
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBe("203.0.113.7");
    expect(sentHeaders()["x-rothern-ssr"]).toBe("s".repeat(32));
  });

  it("parametresiz (kanonik) çizim IP taşımaz — paylaşılan önbellek anahtarı bölünmez", async () => {
    headerStore.set("x-real-ip", "203.0.113.7");
    const { attributeSsrToVisitor, SSR_CLIENT_IP_HEADER } = await import("../ssr-visitor");
    const { fetchCompanyProducts } = await import("../marketplace-api");
    await attributeSsrToVisitor({});
    await fetchCompanyProducts("demo");
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBeUndefined();
  });

  it("SSR sırrı yoksa IP de gönderilmez (API zaten güvenmez)", async () => {
    vi.stubEnv("SEO_REVALIDATE_SECRET", "");
    headerStore.set("x-real-ip", "203.0.113.7");
    const { attributeSsrToVisitor, SSR_CLIENT_IP_HEADER } = await import("../ssr-visitor");
    const { fetchCompanyProducts } = await import("../marketplace-api");
    await attributeSsrToVisitor({ onizleme: "1" });
    await fetchCompanyProducts("demo", { fresh: true });
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBeUndefined();
    expect(sentHeaders()["x-rothern-ssr"]).toBeUndefined();
  });
});
