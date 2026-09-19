import { mergeShowcaseInput, type ShowcaseBeforeRow } from "../../src/common/company/showcase-merge";

const before: ShowcaseBeforeRow = {
  images: ["https://cdn/a.webp"],
  keywords: ["kompresör", "8 bar"],
  attributes: { power_kw: 22 },
  videoUrl: "https://youtu.be/x",
  externalUrl: null,
  documents: [{ url: "https://cdn/d.pdf", title: "Katalog" }],
  priceMode: "FIXED",
  priceAmount: 1250.5,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: 2,
};

describe("mergeShowcaseInput — kısmi PATCH mevcut alanı silmez", () => {
  it("yalnız description gönderilince görsel/anahtar/nitelik/fiyat korunur", () => {
    const out = mergeShowcaseInput(before, { description: "yeni açıklama" });
    expect(out.description).toBe("yeni açıklama");
    expect(out.images).toEqual(before.images);
    expect(out.keywords).toEqual(before.keywords);
    expect(out.attributes).toEqual(before.attributes);
    expect(out.videoUrl).toBe(before.videoUrl);
    expect(out.documents).toEqual(before.documents);
    expect(out.priceMode).toBe("FIXED");
    expect(out.priceAmount).toBe(1250.5);
    expect(out.priceCurrency).toBe("TRY");
    expect(out.moq).toBe(2);
  });

  it("boş dizi / null BİLİNÇLİ silmedir, korunmaz", () => {
    const out = mergeShowcaseInput(before, { images: [], keywords: [], videoUrl: null, documents: null, moq: null, priceAmount: null });
    expect(out.images).toEqual([]);
    expect(out.keywords).toEqual([]);
    expect(out.videoUrl).toBeNull();
    expect(out.documents).toBeNull();
    expect(out.moq).toBeNull();
    expect(out.priceAmount).toBeNull();
  });

  it("gönderilen alan öncekini ezer; Decimal benzeri değerler sayıya çevrilir", () => {
    const dec = { toString: () => "99.90" };
    const out = mergeShowcaseInput({ ...before, priceAmount: dec, moq: dec }, { priceMode: "TIERED", priceTiers: [{ minQty: 10, unitPrice: 5 }] });
    expect(out.priceMode).toBe("TIERED");
    expect(out.priceTiers).toEqual([{ minQty: 10, unitPrice: 5 }]);
    expect(out.priceAmount).toBe(99.9);
    expect(out.moq).toBe(99.9);
  });
});
