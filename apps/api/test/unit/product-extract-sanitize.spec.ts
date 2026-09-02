/**
 * "Katalogdan ürün ekle (AI)" — model çıktısının sınırları.
 *
 * Kilitlenen iddialar:
 *  · model KATEGORİ KODU yazamaz (kod gibi görünen ipucu düşer),
 *  · uydurma para birimi/fiyat modu düşer, sayı TR sezgisiyle 1000× olmaz,
 *  · kesik (MAX_TOKENS) çıktıdan tamamlanmış ürünler kurtarılır.
 */
import {
  salvageProducts,
  sanitizeProducts,
} from "../../src/modules/ai/product-extract/product-extract.service";

describe("sanitizeProducts", () => {
  it("adı olmayan satırı düşürür", () => {
    expect(sanitizeProducts([{ name: "" }, { name: "   " }, {}, null])).toEqual([]);
  });

  it("kategori KODU yazılmışsa ipucunu reddeder (uydurma kod sızmasın)", () => {
    const [a, b] = sanitizeProducts([
      { name: "Çelik boru", categoryHint: "40171501" },
      { name: "Panosu", categoryHint: "dağıtım panosu" },
    ]);
    expect(a.categoryHint).toBeNull();
    expect(b.categoryHint).toBe("dağıtım panosu");
  });

  it("sayıyı model sözleşmesiyle okur — '1.875' 1875 DEĞİL", () => {
    const [p] = sanitizeProducts([
      { name: "Rulman", priceMode: "FIXED", price: "1.875" },
    ]);
    expect(p.price).toBe(1.875);
  });

  it("tanınmayan fiyat modu ve para birimi düşer", () => {
    const [p] = sanitizeProducts([
      { name: "Vana", priceMode: "PAZARLIK", price: "10", currency: "XXX" },
    ]);
    expect(p.priceMode).toBe("ON_REQUEST");
    expect(p.price).toBeNull(); // ON_REQUEST'te fiyat taşınmaz
    expect(p.currency).toBeNull();
  });

  it("FIXED'te fiyat okunamadıysa null bırakır (uydurmaz)", () => {
    const [p] = sanitizeProducts([{ name: "Kablo", priceMode: "FIXED", price: "yok" }]);
    expect(p.priceMode).toBe("FIXED");
    expect(p.price).toBeNull();
  });

  it("anahtar kelimeleri 8 ile sınırlar ve küçük harfe indirir", () => {
    const [p] = sanitizeProducts([
      { name: "Boru", keywords: Array.from({ length: 20 }, (_, i) => `İLK${i}`) },
    ]);
    expect(p.keywords).toHaveLength(8);
    expect(p.keywords[0]).toBe("ilk0");
  });

  it("dizi olmayan çıktıda boş döner", () => {
    expect(sanitizeProducts(undefined)).toEqual([]);
    expect(sanitizeProducts({ products: [] })).toEqual([]);
  });
});

describe("salvageProducts — kesik JSON", () => {
  it("tamamlanmış ürünleri kurtarır, yarım olanı atar", () => {
    const truncated =
      '{ "products": [ { "name": "A", "code": "1" }, { "name": "B" }, { "name": "C';
    expect(salvageProducts(truncated).map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("ürün dizisi yoksa boş döner", () => {
    expect(salvageProducts('{ "foo": 1 }')).toEqual([]);
    expect(salvageProducts("")).toEqual([]);
  });
});
