import { Prisma } from "@prisma/client";
import { showcaseContentChanged } from "../../src/common/company/product-content-diff";

/**
 * Yayındaki ürün, DEĞİŞMEYEN kaydetmede yeniden incelemeye DÜŞMEMELİ
 * (2026-09-19 kullanıcı bulgusu: "hiçbir değişiklik yapmadan Kaydet'e
 * basınca tekrar incelemeye giriyor").
 */
describe("showcaseContentChanged", () => {
  const before = {
    name: "Pnömatik Silindir Seti",
    description: "ISO 15552 uyumlu silindir seti.",
    categoryId: "40141600",
    images: ["https://cdn/a.webp"],
    keywords: ["silindir", "pnömatik"],
    attributes: null,
  };

  it("aynı içerik, normalize edilmiş patch (DbNull nitelik, trim) → DEĞİŞMEDİ", () => {
    expect(
      showcaseContentChanged(before, {
        name: "Pnömatik Silindir Seti",
        description: "ISO 15552 uyumlu silindir seti.",
        categoryId: "40141600",
        images: ["https://cdn/a.webp"],
        keywords: ["silindir", "pnömatik"],
        attributes: Prisma.DbNull,
      }),
    ).toBe(false);
  });

  it("nitelik anahtar sırası ve boş değerler fark sayılmaz", () => {
    const b = { ...before, attributes: { ip: "IP65", renk: "mavi" } };
    expect(showcaseContentChanged(b, { attributes: { renk: "mavi", ip: "IP65", bos: "" } })).toBe(false);
    expect(showcaseContentChanged(b, { attributes: { renk: "kırmızı", ip: "IP65" } })).toBe(true);
  });

  it("açıklama boş dize ↔ null aynı; gerçek metin değişimi fark", () => {
    expect(showcaseContentChanged({ ...before, description: null }, { description: "" })).toBe(false);
    expect(showcaseContentChanged(before, { description: "Başka açıklama." })).toBe(true);
  });

  it("görsel/anahtar kelime listesi değişince fark; patch'te olmayan alan fark değil", () => {
    expect(showcaseContentChanged(before, { images: ["https://cdn/b.webp"] })).toBe(true);
    expect(showcaseContentChanged(before, { keywords: ["silindir", "pnömatik", "iso"] })).toBe(true);
    expect(showcaseContentChanged(before, { priceAmount: 12 })).toBe(false);
  });
});
