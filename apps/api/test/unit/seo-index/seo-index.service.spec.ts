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

  it("yayındaki ürün: ürün + firma + kategori + şehir + ülke sayfası IndexNow'a, dizin/sitemap web'e", async () => {
    const prisma = makePrisma();
    (prisma.companyItem.findUnique as jest.Mock).mockResolvedValue({
      slug: "celik-boru",
      isPublic: true,
      isActive: true,
      categoryId: "39121004",
      company: { slug: "acme-metal", cityId: -1034, country: "TR", publicEnabled: true },
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
        "/urunler/ulke/tr-turkiye",
        SITEMAP_PATHS.products,
        SITEMAP_PATHS.cities,
        SITEMAP_PATHS.countries,
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
    /**
     * KÖK KONUM — pazarlık konusu değil. IndexNow'da anahtar dosyasının
     * bulunduğu DİZİN, bildirilebilecek adreslerin KAPSAMINI sınırlar.
     * `/indexnow/abc123.txt` gösterildiğinde canlı **422** dönüyordu
     * ("URLs are not related to your site verified through the keylocation
     * parameter") ve kanal tek bir ürün/firma/talep adresini bile
     * bildiremiyordu — fail-open olduğu için SESSİZCE. 2026-09-13'te
     * ölçüldü ve düzeltildi; web tarafı aynı dosyayı `next.config.ts`
     * rewrite'ıyla kökten de servis eder.
     */
    expect(inBody.keyLocation).toBe("https://www.rothern.com/abc123.txt");
    /* Kapsam kuralı: keyLocation'ın dizini, bildirilen HER adresin ön eki
       olmalı. Kök olduğu için bu her zaman sağlanır. */
    const kapsam = inBody.keyLocation.slice(0, inBody.keyLocation.lastIndexOf("/") + 1);
    for (const u of inBody.urlList) expect(u.startsWith(kapsam)).toBe(true);
    // Her adres ÜÇ dilde (i18n SEO 2026-09-25, `localizedIndexNowUrls`).
    expect(inBody.urlList).toEqual([
      "https://www.rothern.com/firma/acme-metal/urun/celik-boru",
      "https://www.rothern.com/en/companies/acme-metal/products/celik-boru",
      "https://www.rothern.com/ru/kompanii/acme-metal/tovary/celik-boru",
      "https://www.rothern.com/firma/acme-metal",
      "https://www.rothern.com/en/companies/acme-metal",
      "https://www.rothern.com/ru/kompanii/acme-metal",
      "https://www.rothern.com/urunler/kategori/39000000-elektrik-malzemeleri",
      "https://www.rothern.com/en/products/category/39000000-elektrik-malzemeleri",
      "https://www.rothern.com/ru/tovary/kategoriya/39000000-elektrik-malzemeleri",
      // Şehir/ülke açılış sayfaları da ürün listesidir (2026-09-27 SEO denetimi).
      "https://www.rothern.com/urunler/sehir/istanbul",
      "https://www.rothern.com/en/products/city/istanbul",
      "https://www.rothern.com/ru/tovary/gorod/istanbul",
      "https://www.rothern.com/urunler/ulke/tr-turkiye",
      "https://www.rothern.com/en/products/country/tr-turkiye",
      "https://www.rothern.com/ru/tovary/strana/tr-turtsiya",
    ]);
  });

  it("vitrinden çekilen ürün: IndexNow'a GİTMEZ, web yine tazelenir", async () => {
    const prisma = makePrisma();
    (prisma.companyItem.findUnique as jest.Mock).mockResolvedValue({
      slug: "celik-boru",
      isPublic: false,
      isActive: true,
      categoryId: null,
      company: { slug: "acme-metal", cityId: null, country: null, publicEnabled: true },
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
        publishedAt: new Date("2026-09-01T00:00:00Z"),
        bidsOpenAt: null,
        company: { publicListingsEnabled: true, isActive: true, isBlocked: false, city: "Ankara" },
      })
      .mockResolvedValueOnce({
        number: "ROT-000043",
        title: "Gizli",
        status: "OPEN",
        visibility: "CONNECTIONS",
        publicIndexable: true,
        publishedAt: new Date("2026-09-01T00:00:00Z"),
        bidsOpenAt: null,
        company: { publicListingsEnabled: true, isActive: true, isBlocked: false, city: null },
      });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.listingChanged("l1");
    svc.listingChanged("l2");
    await flushSoon(svc);
    // İKİ değişiklik, TEK IndexNow + TEK revalidate isteği (toplu).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const inBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(inBody.urlList).toEqual([
      "https://www.rothern.com/talep/rot-000042-celik-boru-alimi",
      "https://www.rothern.com/en/buying-requests/rot-000042-celik-boru-alimi",
      "https://www.rothern.com/ru/zayavki/rot-000042-celik-boru-alimi",
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(expect.arrayContaining([SEO_TAGS.listing("ROT-000042"), SEO_TAGS.listing("ROT-000043")]));
  });

  it("embargolu / indekse kapalı / kapanmış / yayımlanmamış talep IndexNow'a GİTMEZ, web yine tazelenir (derin denetim LU-19)", async () => {
    const base = {
      number: "ROT-000050",
      title: "Gizli Başlık",
      status: "OPEN",
      visibility: "PUBLIC",
      publicIndexable: true,
      publishedAt: new Date("2026-09-01T00:00:00Z"),
      bidsOpenAt: null as Date | null,
      company: { publicListingsEnabled: true, isActive: true, isBlocked: false, city: null },
    };
    const variants = [
      { ...base, bidsOpenAt: new Date(Date.now() + 86_400_000) },
      { ...base, publicIndexable: false },
      { ...base, status: "CLOSED" },
      { ...base, publishedAt: null },
      { ...base, company: { ...base.company, isBlocked: true } },
    ];
    for (const v of variants) {
      fetchMock.mockClear();
      const prisma = makePrisma();
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(v);
      const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
      svc.listingChanged("lx");
      await flushSoon(svc);
      // Yalnız revalidate isteği; IndexNow çağrısı yok.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.tags).toEqual(expect.arrayContaining([SEO_TAGS.listing("ROT-000050")]));
    }
  });

  it("embargosu GEÇMİŞ talep IndexNow'a gider", async () => {
    const prisma = makePrisma();
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      number: "ROT-000051",
      title: "Acik",
      status: "OPEN",
      visibility: "PUBLIC",
      publicIndexable: true,
      publishedAt: new Date("2026-09-01T00:00:00Z"),
      bidsOpenAt: new Date(Date.now() - 60_000),
      company: { publicListingsEnabled: true, isActive: true, isBlocked: false, city: null },
    });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.listingChanged("ly");
    await flushSoon(svc);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("yayındaki firma: profil + şehir + ülke sayfası IndexNow'a (üç dilde)", async () => {
    const prisma = makePrisma();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      slug: "acme-metal",
      cityId: -1035, // İzmir
      country: "TR",
      publicEnabled: true,
      isActive: true,
      isBlocked: false,
    });
    const svc = new SeoIndexService(prisma as never, makeConfig(ENV));
    svc.companyChanged("c1");
    await flushSoon(svc);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.paths).toEqual(expect.arrayContaining([SITEMAP_PATHS.cities, SITEMAP_PATHS.countries]));
    const inBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(inBody.urlList).toEqual([
      "https://www.rothern.com/firma/acme-metal",
      "https://www.rothern.com/en/companies/acme-metal",
      "https://www.rothern.com/ru/kompanii/acme-metal",
      "https://www.rothern.com/urunler/sehir/izmir",
      "https://www.rothern.com/en/products/city/izmir",
      "https://www.rothern.com/ru/tovary/gorod/izmir",
      "https://www.rothern.com/urunler/ulke/tr-turkiye",
      "https://www.rothern.com/en/products/country/tr-turkiye",
      "https://www.rothern.com/ru/tovary/strana/tr-turtsiya",
    ]);
  });

  it("askıya alınan firma: profil IndexNow'a gitmez; ürün sayfaları etiketle tazelenir", async () => {
    const prisma = makePrisma();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      slug: "acme-metal",
      cityId: -1035, // İzmir (dünya şehir listesi, 2026-09-27)
      country: "TR",
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
    // Firma şehir sayfası 2026-09-22'de kalktı (308) → yalnız ürün şehir sayfası + ülke sayfası.
    expect(body.paths).toEqual(expect.arrayContaining(["/urunler/sehir/izmir", "/urunler/ulke/tr-turkiye"]));
    expect(body.paths).not.toContain("/firmalar/sehir/izmir");
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
