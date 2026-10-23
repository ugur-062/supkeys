import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEKTÖR SAYFASI METASI — son sayfanın ötesi indekslenmez (2026-10-10).
 *
 * `/urunler/kategori/<kod>-<ad>?sayfa=N` son sayfadan büyükken sayfa 200 döner
 * ve "Bu sayfada sonuç yok" çizer; metası ise `index, follow` ve KENDİ
 * kanoniğini (`?sayfa=N`) basıyordu — var olmayan sayfa arama motoruna gerçek
 * sayfa diye sunuluyordu. Artık o adres `noindex` (gövde durur). Gerçek
 * `?sayfa=N` sayfası kendi kanoniğiyle indekslenmeyi sürdürür; süzgeçli varyant
 * eskisi gibi tabana işaret eder.
 *
 * Sayfanın GERÇEK `generateMetadata`sı; yalnız veri katmanı ve gövde sahte.
 */
const api = vi.hoisted(() => ({
  fetchSegments: vi.fn(),
  fetchProducts: vi.fn(),
  fetchProductFacets: vi.fn(),
}));
vi.mock("@/lib/public/marketplace-api", () => api);
vi.mock("@/lib/site-url", () => ({ resolveSiteUrl: () => "https://www.rothern.com" }));
vi.mock("@/components/marketplace/product-index", () => ({ ProductIndex: () => null }));
vi.mock("@/components/marketplace/public-layout", () => ({ PublicLayout: () => null, MARKET_GROUND: "" }));

import { generateMetadata } from "../page";

const SLUG = "31000000-uretim-bilesenleri";
const BASE = `https://www.rothern.com/urunler/kategori/${SLUG}`;
const NOINDEX = { index: false, follow: true };

/** Segmentte `total` ürün; uç sayfa başına 24 döner. */
function segmentHas(total: number, pageSize = 24) {
  api.fetchProducts.mockResolvedValue({ items: [], total, page: 1, pageSize });
}
const meta = (query: Record<string, string>, locale = "tr", slug = SLUG) =>
  generateMetadata({ params: Promise.resolve({ locale, slug }), searchParams: Promise.resolve(query) });

beforeEach(() => {
  api.fetchSegments.mockResolvedValue([{ id: "31000000", nameTr: "Üretim Bileşenleri", slug: "uretim-bilesenleri" }]);
  segmentHas(30); // iki sayfa: 24 + 6
});

describe("sektör sayfası — gerçek sayfalar indekslenir, `?sayfa=N` kendi kanoniği", () => {
  it("1. sayfa: taban kanonik, robots yönergesi yok (indekslenir)", async () => {
    const m = await meta({});
    expect(m.alternates?.canonical).toBe(BASE);
    expect(m.robots).toBeUndefined();
  });

  it("son sayfa (`?sayfa=2`): kendi kanoniği, indekslenir, başlıkta sayfa eki", async () => {
    const m = await meta({ sayfa: "2" });
    expect(m.alternates?.canonical).toBe(`${BASE}?sayfa=2`);
    expect(m.robots).toBeUndefined();
    expect(String(m.title)).toContain("Sayfa 2");
  });

  it("görünüm tercihi süzgeç değildir: `?sayfa=2&gorunum=liste` de kendi kanoniğiyle indekslenir", async () => {
    const m = await meta({ sayfa: "2", gorunum: "liste" });
    expect(m.alternates?.canonical).toBe(`${BASE}?sayfa=2`);
    expect(m.robots).toBeUndefined();
  });

  it("tam dolu son sayfa gerçek sayfadır (48 ürün, 2. sayfa)", async () => {
    segmentHas(48);
    expect((await meta({ sayfa: "2" })).robots).toBeUndefined();
  });
});

describe("sektör sayfası — son sayfanın ötesi `noindex`", () => {
  it("`?sayfa=3` (iki sayfalık sektör): noindex, follow; kanonik kendi adresi", async () => {
    const m = await meta({ sayfa: "3" });
    expect(m.robots).toEqual(NOINDEX);
    // `noindex` sayfa kendi adresini söyler (noindex + başka kanonik çelişkili sayılır).
    expect(m.alternates?.canonical).toBe(`${BASE}?sayfa=3`);
  });

  it.each(["4", "25", "999"])("`?sayfa=%s`: noindex", async (sayfa) => {
    expect((await meta({ sayfa })).robots).toEqual(NOINDEX);
  });

  it("sınır ürün sayısından okunur: 49 ürün üç sayfadır — 3 indekslenir, 4 indekslenmez", async () => {
    segmentHas(49);
    expect((await meta({ sayfa: "3" })).robots).toBeUndefined();
    expect((await meta({ sayfa: "4" })).robots).toEqual(NOINDEX);
  });

  it("sayfa boyu uçtan okunur (elle 24 yazılmaz): uç 12 dönerse 30 ürün üç sayfadır", async () => {
    segmentHas(30, 12);
    expect((await meta({ sayfa: "3" })).robots).toBeUndefined();
    expect((await meta({ sayfa: "4" })).robots).toEqual(NOINDEX);
  });

  it("ucun sayfa tavanının (200) ötesi: içerik 200. sayfanın kopyasıdır → noindex", async () => {
    segmentHas(6000); // 250 sayfa
    expect((await meta({ sayfa: "200" })).robots).toBeUndefined();
    expect((await meta({ sayfa: "201" })).robots).toEqual(NOINDEX);
  });

  it("öteki dillerde de aynı (EN, RU)", async () => {
    for (const locale of ["en", "ru"]) {
      const past = await meta({ sayfa: "3" }, locale);
      expect(past.robots, locale).toEqual(NOINDEX);
      expect(String(past.alternates?.canonical), locale).toMatch(/\?sayfa=3$/);
      expect((await meta({ sayfa: "2" }, locale)).robots, locale).toBeUndefined();
    }
  });
});

describe("sektör sayfası — bu kuralın dokunmadığı hâller", () => {
  it("süzgeçli varyant eskisi gibi tabana işaret eder ve kendi robots yönergesini almaz", async () => {
    const m = await meta({ sayfa: "9", dogrulanmis: "1" });
    expect(m.alternates?.canonical).toBe(BASE);
    expect(m.robots).toBeUndefined();
  });

  it("bilinmeyen / ürünü olmayan sektör: eskisi gibi 'bulunamadı' metası (noindex)", async () => {
    segmentHas(0);
    const m = await meta({ sayfa: "2" });
    expect(m.robots).toEqual(NOINDEX);
    expect(m.alternates?.canonical).toBe("https://www.rothern.com/urunler");
  });
});
