import { describe, expect, it } from "vitest";
import { LOCALES } from "../locales";
import {
  ROUTE_PATHNAMES,
  findPathnameCollisions,
  internalRoutePath,
  matchInternalRoute,
  translateRoutePath,
} from "../pathnames";

describe("ROUTE_PATHNAMES — yol parçaları üç dilde", () => {
  it("her iç şablonun üç dilde karşılığı var, Türkçe iç şablonla aynı, parametre adları korunur", () => {
    for (const [internal, byLocale] of Object.entries(ROUTE_PATHNAMES)) {
      expect(byLocale.tr, internal).toBe(internal);
      const params = internal.match(/\[[^\]]+\]/g) ?? [];
      for (const locale of LOCALES) {
        const v = byLocale[locale];
        expect(v.startsWith("/"), `${locale} ${internal}`).toBe(true);
        expect(v.match(/\[[^\]]+\]/g) ?? [], `${locale} ${internal}`).toEqual(params);
        // Latin çeviriyazı: Kiril ya da Türkçe özel harf yok (kullanıcı kararı)
        expect(/^[a-z0-9/\-]*$/.test(v.replace(/\[[^\]]+\]/g, "")), `${locale} ${internal} → ${v}`).toBe(true);
      }
    }
  });

  it("aynı dilde iki iç şablon aynı dış şablona düşmez", () => {
    expect(findPathnameCollisions()).toEqual([]);
  });

  it("çeviri → geri çevirme gidiş-dönüşü her şablonda birebir", () => {
    for (const internal of Object.keys(ROUTE_PATHNAMES)) {
      const filled = internal.replace(/\[([^\]]+)\]/g, (_, n: string) => `x-${n.toLowerCase()}`);
      for (const locale of LOCALES) {
        const outer = translateRoutePath(filled, locale);
        expect(internalRoutePath(outer, locale), `${locale} ${internal}`).toBe(filled);
      }
    }
  });

  it("dize adres: sabit parça çevrilir, slug korunur, sorgu ve # olduğu gibi kalır", () => {
    expect(translateRoutePath("/urunler", "en")).toBe("/products");
    expect(translateRoutePath("/urunler", "tr")).toBe("/urunler");
    expect(translateRoutePath("/urunler/kategori/31000000-uretim?sayfa=2#liste", "ru")).toBe("/tovary/kategoriya/31000000-uretim?sayfa=2#liste");
    expect(translateRoutePath("/firma/ege-tekstil/urun/pamuk-penye", "en")).toBe("/companies/ege-tekstil/products/pamuk-penye");
    expect(translateRoutePath("/talep/rot-000042-celik-boru", "ru")).toBe("/zayavki/rot-000042-celik-boru");
    expect(translateRoutePath("/company/login", "ru")).toBe("/kompaniya/vhod");
    expect(translateRoutePath("/company/satinalma/taleplerim/abc123/duzenle", "en")).toBe("/company/purchasing/my-requests/abc123/edit");
    expect(translateRoutePath("/", "en")).toBe("/");
  });

  it("tanınmayan yol, mutlak adres ve özel şemalar olduğu gibi döner", () => {
    expect(translateRoutePath("/dev/ui", "en")).toBe("/dev/ui");
    expect(translateRoutePath("/api/health", "ru")).toBe("/api/health");
    expect(translateRoutePath("https://example.com/urunler", "en")).toBe("https://example.com/urunler");
    expect(translateRoutePath("mailto:x@y.z", "en")).toBe("mailto:x@y.z");
    expect(translateRoutePath("urunler", "en")).toBe("urunler");
    expect(translateRoutePath("/urunler/kategori/x/opengraph-image", "en")).toBe("/urunler/kategori/x/opengraph-image");
  });

  it("geri çevirme: verilen dil, iç biçim ve başka dilin biçimi sırasıyla tanınır", () => {
    expect(internalRoutePath("/products/city/izmir", "en")).toBe("/urunler/sehir/izmir");
    expect(internalRoutePath("/urunler/sehir/izmir", "en")).toBe("/urunler/sehir/izmir");
    expect(internalRoutePath("/tovary/gorod/izmir", "en")).toBe("/urunler/sehir/izmir");
    expect(internalRoutePath("/kompaniya/vhod?next=1", "ru")).toBe("/company/login?next=1");
    expect(internalRoutePath("/bilinmeyen/yol", "en")).toBe("/bilinmeyen/yol");
  });

  it("sabit parça dinamik parçadan önce gelir; sondaki eğik çizgi eşleşmeyi bozmaz", () => {
    expect(matchInternalRoute("/company/satinalma/taleplerim/yeni")?.internal).toBe("/company/satinalma/taleplerim/yeni");
    expect(matchInternalRoute("/firmalar/")?.internal).toBe("/firmalar");
    expect(matchInternalRoute("/firma/acme")?.params).toEqual({ slug: "acme" });
  });
});
