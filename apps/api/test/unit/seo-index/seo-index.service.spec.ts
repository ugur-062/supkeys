import { ConfigService } from "@nestjs/config";
import { SEO_TAGS, SITEMAP_PATHS, SeoIndexService } from "../../../src/modules/seo-index/seo-index.service";

/**
 * Yayın anı bildirimi — sözleşme:
 *  · adresler web ile AYNI fonksiyondan (kod/numara önde),
 *  · kapalı içerik IndexNow'a GİTMEZ ama dizin/sitemap tazelenir,
 *  · 5 sn içinde biriken değişiklikler TEK istekte gider,
 *  · anahtar yoksa kanal sessizce atlanır, hata iş akışını durdurmaz.
 */

function makeConfig(env: Record<string, string | undefined>) {
  return { get: (k: string) => env[k] } as unknown as ConfigService;
}

function makePrisma(over: Partial<Record<"companyItem" | "company" | "listing" | "category", unknown>> = {}) {
  return {
    companyItem: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    listing: { findUnique: jest.fn() },
    category: { findUnique: jest.fn().mockResolvedValue({ nameTr: "Elektrik Malzemeleri" }) },
    ...over,
  };
}

const ENV = {
  NODE_ENV: "production",
  WEB_URL: "https://www.rothern.com",
  INDEXNOW_KEY: "abc123",
  SEO_REVALIDATE_SECRET: "s3cret",
};

describe("SeoIndexService", () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  async function flushSoon(svc: SeoIndexService) {
    // Kuyruk `void` ile doldurulur; DB sözü çözülsün diye bir tur bekle.
    await new Promise((r) => setImmediate(r));
    await svc.flush();
  }

  it("yayındaki ürün: ürün + firma + kategori sayfası IndexNow'a, dizin/sitemap web'e", async () => {
    const prisma = makePrisma();
    (prisma.companyItem.findUnique as jest.Mock).mockResolvedValue({
      slug: "celik-boru",
      isPublic: true,
      isActive: true,
      categoryId: "39121004",
      company: { slug: "acme-metal", city: "İstanbul", publicEnabled: true },
    });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.productChanged("item1");
    await flushSoon(svc);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [revalidateCall, indexNowCall] = fetchMock.mock.calls;
    expect(revalidateCall[0]).toBe("https://www.rothern.com/api/seo/revalidate");
    expect(revalidateCall[1].headers["x-seo-secret"]).toBe("s3cret");
    const body = JSON.parse(revalidateCall[1].body);
    expect(body.paths).toEqual(
      expect.arrayContaining([
        "/firma/acme-metal/urun/celik-boru",
        "/firma/acme-metal",
        "/urunler",
        "/urunler/kategori/39000000-elektrik-malzemeleri",
        "/urunler/sehir/istanbul",
        SITEMAP_PATHS.products,
        SITEMAP_PATHS.index,
      ]),
    );
    expect(body.tags).toEqual(
      expect.arrayContaining([SEO_TAGS.product("acme-metal", "celik-boru"), SEO_TAGS.company("acme-metal"), SEO_TAGS.sitemap]),
    );

    expect(indexNowCall[0]).toBe("https://api.indexnow.org/indexnow");
    const inBody = JSON.parse(indexNowCall[1].body);
    expect(inBody.host).toBe("www.rothern.com");
    expect(inBody.key).toBe("abc123");
    expect(inBody.keyLocation).toBe("https://www.rothern.com/indexnow/abc123.txt");
    expect(inBody.urlList).toEqual([
      "https://www.rothern.com/firma/acme-metal/urun/celik-boru",
      "https://www.rothern.com/firma/acme-metal",
      "https://www.rothern.com/urunler/kategori/39000000-elektrik-malzemeleri",
    ]);
  });

  it("vitrinden çekilen ürün: IndexNow'a GİTMEZ, web yine tazelenir", async () => {
    const prisma = makePrisma();
    (prisma.companyItem.findUnique as jest.Mock).mockResolvedValue({
      slug: "celik-boru",
      isPublic: false,
      isActive: true,
      categoryId: null,
      company: { slug: "acme-metal", city: null, publicEnabled: true },
    });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.productChanged("item1");
    await flushSoon(svc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/seo/revalidate");
  });

  it("ilan sahibi anonim: IndexNow yalnız talep adresini alır, PUBLIC değilse hiç almaz", async () => {
    const prisma = makePrisma();
    (prisma.listing.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        number: "ROT-000042",
        title: "Çelik Boru Alımı",
        status: "OPEN",
        visibility: "PUBLIC",
        publicIndexable: true,
        company: { publicListingsEnabled: true, city: "Ankara" },
      })
      .mockResolvedValueOnce({
        number: "ROT-000043",
        title: "Gizli",
        status: "OPEN",
        visibility: "CONNECTIONS",
        publicIndexable: true,
        company: { publicListingsEnabled: true, city: null },
      });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.listingChanged("l1");
    svc.listingChanged("l2");
    await flushSoon(svc);
    // İKİ değişiklik, TEK IndexNow + TEK revalidate isteği (toplu).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const inBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(inBody.urlList).toEqual(["https://www.rothern.com/talep/rot-000042-celik-boru-alimi"]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(expect.arrayContaining([SEO_TAGS.listing("ROT-000042"), SEO_TAGS.listing("ROT-000043")]));
  });

  it("askıya alınan firma: profil IndexNow'a gitmez; ürün sayfaları etiketle tazelenir", async () => {
    const prisma = makePrisma();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      slug: "acme-metal",
      city: "İzmir",
      publicEnabled: true,
      isActive: true,
      isBlocked: true,
    });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.companyChanged("c1");
    await flushSoon(svc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toContain(SEO_TAGS.company("acme-metal"));
    expect(body.paths).toEqual(expect.arrayContaining(["/firmalar/sehir/izmir", "/urunler/sehir/izmir"]));
  });

  it("anahtar yoksa kanal atlanır; NODE_ENV=test'te hiç çağrı yok; hata yutulur", async () => {
    const prisma = makePrisma();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      slug: "acme",
      city: null,
      publicEnabled: true,
      isActive: true,
      isBlocked: false,
    });
    const noKeys = new SeoIndexService(prisma as never, makeConfig({ ...ENV, INDEXNOW_KEY: undefined, SEO_REVALIDATE_SECRET: undefined }));
    noKeys.companyChanged("c1");
    await flushSoon(noKeys);
    expect(fetchMock).not.toHaveBeenCalled();

    const testEnv = new SeoIndexService(prisma as never, makeConfig({ ...ENV, NODE_ENV: "test" }));
    testEnv.companyChanged("c1");
    await flushSoon(testEnv);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRejectedValue(new Error("ağ yok"));
    const failing = new SeoIndexService(prisma as never, makeConfig(ENV));
    failing.companyChanged("c1");
    await expect(flushSoon(failing)).resolves.toBeUndefined();

    (prisma.company.findUnique as jest.Mock).mockRejectedValue(new Error("db yok"));
    failing.companyChanged("c1");
    await expect(flushSoon(failing)).resolves.toBeUndefined();
  });
});
