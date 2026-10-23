import { describe, expect, it } from "vitest";
import { pastEndLastPage } from "@/lib/public/filter-param-utils";
import {
  MIN_LANDING_PRODUCTS,
  canonicalListingListPage,
  canonicalProductListPage,
  landingIndexable,
  listPagePastEnd,
  queryStringOf,
} from "../landing";

/* Liste/açılış sayfası SEO kuralları (2026-09-27): sayfalanmış sayfa kendi
   kanoniği, süzgeçli varyant tabana; ince açılış sayfası eşiği. */
describe("canonicalProductListPage", () => {
  it("yalnız ?sayfa=N varsa N; görünüm tercihi sayılmaz", () => {
    expect(canonicalProductListPage({ sayfa: "3" })).toBe(3);
    expect(canonicalProductListPage({ sayfa: "3", gorunum: "liste" })).toBe(3);
    expect(canonicalProductListPage({})).toBe(1);
  });

  it("başka süzgeç, arama, sıralama ya da adet varsa taban (1)", () => {
    expect(canonicalProductListPage({ sayfa: "2", q: "boru" })).toBe(1);
    expect(canonicalProductListPage({ sayfa: "2", sirala: "yeni" })).toBe(1);
    expect(canonicalProductListPage({ sayfa: "2", adet: "48" })).toBe(1);
    expect(canonicalProductListPage({ sayfa: "2", sehir: "izmir" })).toBe(1);
  });

  it("talep dizini aynı kural (`durum=hepsi` de süzgeç)", () => {
    expect(canonicalListingListPage({ sayfa: "4" })).toBe(4);
    expect(canonicalListingListPage({ sayfa: "4", durum: "hepsi" })).toBe(1);
  });
});

/* SON SAYFANIN ÖTESİ (2026-10-10): `/urunler/kategori/<kod>-<ad>?sayfa=N` son
   sayfadan büyükken 200 + "Bu sayfada sonuç yok" çiziyor, metası ise `index,
   follow` ve kendi kanoniğini basıyordu. Kural kanonik sayfa numarasıyla çalışır. */
describe("listPagePastEnd — son sayfanın ötesi indekslenmez", () => {
  const list = { total: 30, pageSize: 24 }; // iki sayfa

  it("gerçek sayfalar (1 … son) kapsam dışı: `?sayfa=N` kendi kanoniğiyle indekslenir", () => {
    expect(listPagePastEnd(1, list)).toBe(false);
    expect(listPagePastEnd(2, list)).toBe(false);
    // Tam dolu son sayfa da gerçek sayfadır.
    expect(listPagePastEnd(2, { total: 48, pageSize: 24 })).toBe(false);
  });

  it("son sayfadan büyük her numara: noindex", () => {
    expect(listPagePastEnd(3, list)).toBe(true);
    expect(listPagePastEnd(999, list)).toBe(true);
    expect(listPagePastEnd(3, { total: 48, pageSize: 24 })).toBe(true);
    expect(listPagePastEnd(2, { total: 24, pageSize: 24 })).toBe(true);
    expect(listPagePastEnd(2, { total: 1, pageSize: 24 })).toBe(true);
  });

  it("ucun sayfa tavanının ötesi de (son kabul edilen sayfanın kopyası) noindex", () => {
    const big = { total: 6000, pageSize: 24 }; // 250 sayfa, uç 200'ü kabul eder
    expect(listPagePastEnd(200, big, 200)).toBe(false);
    expect(listPagePastEnd(201, big, 200)).toBe(true);
    expect(listPagePastEnd(250, big, 200)).toBe(true);
    // Tavan verilmezse yalnız son sayfa sınırdır.
    expect(listPagePastEnd(250, big)).toBe(false);
    expect(listPagePastEnd(251, big)).toBe(true);
  });

  it("süzgeçli varyant kanonikte 1'dir → kural onu ilgilendirmez", () => {
    expect(listPagePastEnd(canonicalProductListPage({ sayfa: "9", dogrulanmis: "1" }), list)).toBe(false);
    expect(listPagePastEnd(canonicalProductListPage({ sayfa: "9" }), list)).toBe(true);
    // Görünüm tercihi süzgeç değildir: adres yine sayfa 9'dur.
    expect(listPagePastEnd(canonicalProductListPage({ sayfa: "9", gorunum: "liste" }), list)).toBe(true);
  });

  it("toplam ya da sayfa boyu bilinmiyorsa karar verilmez (boş liste çağıranın kuralı)", () => {
    expect(listPagePastEnd(5, { total: 0, pageSize: 24 })).toBe(false);
    expect(listPagePastEnd(5, { total: 30, pageSize: 0 })).toBe(false);
    expect(listPagePastEnd(5, { total: 30, pageSize: undefined as unknown as number })).toBe(false);
    expect(listPagePastEnd(5, { total: Number.NaN, pageSize: 24 })).toBe(false);
  });

  // Gövde "Bu sayfada sonuç yok"u `pastEndLastPage` ile çizer; meta aynı işlevi
  // okur — her (toplam, sayfa) çiftinde aynı kararı verirler.
  it("gövdenin 'bu sayfa boş' kararıyla birebir (aynı son sayfa hesabı)", () => {
    for (const total of [1, 23, 24, 25, 47, 48, 49, 500]) {
      const last = Math.ceil(total / 24);
      for (let page = 1; page <= last + 3; page++) {
        const emptyBody = pastEndLastPage({ itemCount: page > last ? 0 : 1, total, page, pageSize: 24 }, 200) != null;
        expect(listPagePastEnd(page, { total, pageSize: 24 }, 200), `${total} ürün, sayfa ${page}`).toBe(emptyBody);
      }
    }
  });
});

describe("açılış sayfası eşiği ve sorgu koruma", () => {
  it("eşik altı indekslenmez", () => {
    expect(landingIndexable(MIN_LANDING_PRODUCTS)).toBe(true);
    expect(landingIndexable(MIN_LANDING_PRODUCTS - 1)).toBe(false);
    expect(landingIndexable(0)).toBe(false);
  });

  it("308 hedefi sorguyu korur (çoklu değer dahil)", () => {
    expect(queryStringOf({ sayfa: "2", nitelik: ["a:1", "b:2"], x: undefined })).toBe("?sayfa=2&nitelik=a%3A1&nitelik=b%3A2");
    expect(queryStringOf(new URLSearchParams("sayfa=3"))).toBe("?sayfa=3");
    expect(queryStringOf({})).toBe("");
    expect(queryStringOf(undefined)).toBe("");
  });
});
