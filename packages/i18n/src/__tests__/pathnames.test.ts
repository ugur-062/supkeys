import { describe, expect, it } from "vitest";
import { LOCALES } from "../locales";
import {
  ROUTE_PATHNAMES,
  findPathnameCollisions,
  internalRoutePath,
  matchInternalRoute,
  internalPathForLocale,
  localizedRedirectDestination,
  translateRoutePath,
} from "../pathnames";
import { COUNTRY_SLUG_CODES, localizeCountrySlugParam, localizedCountrySlug } from "../country-slugs";

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
    expect(internalRoutePath("/products/country/de-germany", "en")).toBe("/urunler/ulke/de-almanya");
    expect(internalRoutePath("/products/country/de-almanya", "en")).toBe("/urunler/ulke/de-almanya");
    expect(internalRoutePath("/tovary/strana/de-almanya", "ru")).toBe("/urunler/ulke/de-almanya");
    expect(internalRoutePath("/kompaniya/vhod?next=1", "ru")).toBe("/company/login?next=1");
    expect(internalRoutePath("/bilinmeyen/yol", "en")).toBe("/bilinmeyen/yol");
  });

  it("sabit parça dinamik parçadan önce gelir; sondaki eğik çizgi eşleşmeyi bozmaz", () => {
    expect(matchInternalRoute("/company/satinalma/taleplerim/yeni")?.internal).toBe("/company/satinalma/taleplerim/yeni");
    expect(matchInternalRoute("/firmalar/")?.internal).toBe("/firmalar");
    expect(matchInternalRoute("/firma/acme")?.params).toEqual({ slug: "acme" });
  });
});

describe("ülke sayfası slug'ı dile göre (2026-09-27)", () => {
  it("iç (Türkçe) yol → o dilin adıyla dış yol; sorgu korunur", () => {
    expect(translateRoutePath("/urunler/ulke/de-almanya", "tr")).toBe("/urunler/ulke/de-almanya");
    expect(translateRoutePath("/urunler/ulke/de-almanya", "en")).toBe("/products/country/de-germany");
    expect(translateRoutePath("/urunler/ulke/de-almanya?sayfa=2", "ru")).toBe("/tovary/strana/de-germaniya?sayfa=2");
    expect(translateRoutePath("/urunler/ulke/tr-turkiye", "ru")).toBe("/tovary/strana/tr-turtsiya");
  });

  it("ad kısmı ne olursa olsun kod önekten okunur (eski/başka dil biçimi tek sıçramada doğru biçime)", () => {
    expect(translateRoutePath("/urunler/ulke/de-germany", "tr")).toBe("/urunler/ulke/de-almanya");
    expect(translateRoutePath("/urunler/ulke/de", "en")).toBe("/products/country/de-germany");
    expect(localizeCountrySlugParam("DE-xyz", "ru")).toBe("de-germaniya");
  });

  it("önbellek anahtarı: iç şablon + dilin parametresi (revalidate)", () => {
    expect(internalPathForLocale("/urunler/ulke/de-almanya", "en")).toBe("/urunler/ulke/de-germany");
    expect(internalPathForLocale("/urunler/ulke/de-almanya", "tr")).toBe("/urunler/ulke/de-almanya");
    expect(internalPathForLocale("/firma/acme", "ru")).toBe("/firma/acme");
  });

  it("tanınmayan kod olduğu gibi kalır (sayfa 404'ü kendisi verir)", () => {
    expect(translateRoutePath("/urunler/ulke/zz-yok", "en")).toBe("/products/country/zz-yok");
    expect(localizedCountrySlug("ZZ", "en")).toBeNull();
  });

  it("her ülkenin üç dilde tekil, ASCII slug'ı var; kısaltma yok", () => {
    expect(COUNTRY_SLUG_CODES.length).toBeGreaterThanOrEqual(245);
    for (const locale of LOCALES) {
      const seen = new Set<string>();
      for (const cc of COUNTRY_SLUG_CODES) {
        const slug = localizedCountrySlug(cc, locale)!;
        expect(slug).toMatch(/^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(slug).not.toMatch(/-(o-va|o-v|st|sar)(-|$)/);
        expect(seen.has(slug)).toBe(false);
        seen.add(slug);
      }
    }
  });
});

describe("yönlendirme hedefi dil sürümü (next.config, 2026-09-27)", () => {
  it("tam şablon hedefi tek sıçramada o dilin dış yoluna", () => {
    expect(localizedRedirectDestination("/company/login", "ru")).toBe("/ru/kompaniya/vhod");
    expect(localizedRedirectDestination("/company/kayit", "en")).toBe("/en/company/signup");
    expect(localizedRedirectDestination("/talep/:number", "en")).toBe("/en/buying-requests/:number");
    expect(localizedRedirectDestination("/firmalar", "ru")).toBe("/ru/kompanii");
    expect(localizedRedirectDestination("/company/onaylar?tab=flows", "en")).toBe("/en/company/approvals?tab=flows");
    expect(localizedRedirectDestination("/urunler", "tr")).toBe("/urunler");
  });

  it("joker kuyruklu hedef iç biçimde kalır (next-intl kuyruğu kendisi çevirir)", () => {
    expect(localizedRedirectDestination("/company/satinalma/taleplerim/:path*", "en")).toBe("/en/company/satinalma/taleplerim/:path*");
    expect(localizedRedirectDestination("/firmalar/:path+", "ru")).toBe("/ru/firmalar/:path+");
  });
});
