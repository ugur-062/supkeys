/**
 * SSR ZİYARETÇİ İLİŞKİLENDİRMESİ (derin denetim MU-12, RM-12): tek ortak SSR
 * kovasını tek ziyaretçi doldurmasın diye dinamik çizim gerçek ziyaretçi IP'sini
 * `x-rothern-client-ip` ile API'ye iletir. Veri önbelleği (URL, dil) anahtarlı
 * `unstable_cache`te: IP yalnız ıskalamada API'ye gider, anahtara GİRMEZ —
 * kanonik çağrının paylaşılan önbelleği ziyaretçi başına bölünmez.
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

interface CacheCall {
  keyParts: string[];
  opts: { revalidate?: number | false; tags?: string[] };
  outcome?: Promise<"ok" | "thrown">;
}
const cacheCalls: CacheCall[] = [];
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[], opts: CacheCall["opts"]) =>
    async () => {
      const rec: CacheCall = { keyParts, opts };
      cacheCalls.push(rec);
      const p = fn();
      rec.outcome = p.then(
        () => "ok" as const,
        () => "thrown" as const,
      );
      return p;
    },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  headerStore.clear();
  cacheCalls.length = 0;
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  vi.stubEnv("SEO_REVALIDATE_SECRET", "s".repeat(32));
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, pageSize: 24 }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sentInit = (i = 0) => fetchMock.mock.calls[i][1] as RequestInit & { next?: unknown };
const sentHeaders = (i = 0) => sentInit(i).headers as Record<string, string>;

/** Yeni istek: modüller (ve React `cache` istek yuvası) sıfırlanır. */
async function visit(ip: string | null) {
  vi.resetModules();
  headerStore.clear();
  if (ip) headerStore.set("x-real-ip", ip);
  const visitor = await import("../ssr-visitor");
  const api = await import("../marketplace-api");
  if (ip) await visitor.attributeSsrToVisitor();
  return { ...visitor, ...api };
}

describe("ssr-visitor", () => {
  it("visitorIpFrom: x-real-ip önce, sonra x-forwarded-for ilk öğe", async () => {
    const { visitorIpFrom } = await import("../ssr-visitor");
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(visitorIpFrom(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(visitorIpFrom(h({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" }))).toBe("198.51.100.2");
    expect(visitorIpFrom(h({}))).toBeUndefined();
  });

  it("parametreli çizim: ıskalamada ziyaretçi IP'si API'ye gider", async () => {
    const { fetchCompanyProducts, SSR_CLIENT_IP_HEADER } = await visit("203.0.113.7");
    await fetchCompanyProducts("demo", { q: "rastgele-123" });
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBe("203.0.113.7");
    expect(sentHeaders()["x-rothern-ssr"]).toBe("s".repeat(32));
  });

  it("kanonik çağrı da ilişkilendirilir (rastgele yol parçası ortak kovaya düşmez)", async () => {
    const { fetchCompanyProfile, SSR_CLIENT_IP_HEADER } = await visit("203.0.113.7");
    await fetchCompanyProfile("rastgele-slug");
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBe("203.0.113.7");
  });

  it("IP önbellek anahtarına GİRMEZ — iki ziyaretçi aynı girdiyi paylaşır; etiket/süre korunur", async () => {
    await (await visit("203.0.113.7")).fetchListings({});
    await (await visit("198.51.100.2")).fetchListings({});
    await (await visit(null)).fetchListings({});
    expect(cacheCalls).toHaveLength(3);
    const [a, b, c] = cacheCalls;
    expect(a.keyParts).toEqual(b.keyParts);
    expect(a.keyParts).toEqual(c.keyParts);
    expect(a.keyParts.join(" ")).not.toMatch(/203\.0\.113\.7|198\.51\.100\.2/);
    expect(a.keyParts).toContain("tr");
    expect(a.opts).toEqual({ revalidate: 60, tags: ["seo:facets"] });
    // İçerideki çağrı no-store: Next `fetch` önbelleği başlıkları anahtara katardı.
    for (let i = 0; i < 3; i++) {
      expect(sentInit(i).cache).toBe("no-store");
      expect(sentInit(i).next).toBeUndefined();
    }
  });

  it("detay çağrısı: etiketler unstable_cache'e, 404 önbelleğe YAZILMAZ (içeride atılır)", async () => {
    const { fetchListing } = await visit("203.0.113.7");
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await fetchListing("rot-000001")).toBeNull();
    expect(cacheCalls[0].opts).toEqual({ revalidate: 120, tags: ["listing:rot-000001", "seo:listings"] });
    expect(await cacheCalls[0].outcome).toBe("thrown");
  });

  it("fresh (önizleme): önbellek tamamen atlanır, IP gider", async () => {
    const { fetchCompanyProfile, SSR_CLIENT_IP_HEADER } = await visit("203.0.113.7");
    await fetchCompanyProfile("demo", { fresh: true });
    expect(cacheCalls).toHaveLength(0);
    expect(sentInit().cache).toBe("no-store");
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBe("203.0.113.7");
  });

  it("ilişkilendirilmemiş istek (ISR / rota işleyicisi) IP taşımaz", async () => {
    const { fetchCompanyProducts, SSR_CLIENT_IP_HEADER } = await visit(null);
    await fetchCompanyProducts("demo");
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBeUndefined();
  });

  it("SSR sırrı yoksa IP de gönderilmez (API zaten güvenmez)", async () => {
    vi.stubEnv("SEO_REVALIDATE_SECRET", "");
    const { fetchCompanyProducts, SSR_CLIENT_IP_HEADER } = await visit("203.0.113.7");
    await fetchCompanyProducts("demo", { fresh: true });
    expect(sentHeaders()[SSR_CLIENT_IP_HEADER]).toBeUndefined();
    expect(sentHeaders()["x-rothern-ssr"]).toBeUndefined();
  });
});
