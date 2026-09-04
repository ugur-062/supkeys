import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_PREFIXES, isPublicRoute } from "../public-routes";
import {
  MARKETPLACE_ROUTES,
  categoryPath,
  parseCategoryCode,
  isIndexableState,
  listingPath,
  listingSlug,
  parseListingNumber,
  publicState,
} from "./marketplace";

describe("pazar yeri rotaları ⇔ public rota listesi", () => {
  /**
   * `public-routes.ts` middleware'e girdiği için MARKETPLACE_ROUTES'u içe
   * aktaramaz (edge runtime'a @rothern/shared zinciri sokmamak için). İki
   * liste elle senkron tutuluyor; ayrışmayı burada yakalıyoruz.
   */
  /** v2 (2026-09-04): firma dizini de HERKESE AÇIK — her pazar yeri rotası public listede. */
  const PUBLIC_MARKETPLACE_ROUTES = Object.values(MARKETPLACE_ROUTES);

  it("her pazar yeri rotası public listede VAR", () => {
    for (const route of PUBLIC_MARKETPLACE_ROUTES) {
      expect(
        (PUBLIC_ROUTE_PREFIXES as readonly string[]).includes(route),
        `${route} PUBLIC_ROUTE_PREFIXES'te yok — nonce'lı CSP alır, statik üretilemez`,
      ).toBe(true);
    }
  });

  it("pazar yeri rotaları ve alt yolları public sayılır", () => {
    expect(isPublicRoute(MARKETPLACE_ROUTES.demands)).toBe(true);
    expect(isPublicRoute(`${MARKETPLACE_ROUTES.demand}/rot-42-celik`)).toBe(true);
    expect(isPublicRoute(`${MARKETPLACE_ROUTES.offers}?sayfa=2`)).toBe(true);
  });

  it("panel rotası /company/ilan pazar yerine SIZMAZ", () => {
    // "/ilan" öneki public; "/company/ilan/..." ise panel — segment sınırı
    // baştan başlar, bu yüzden eşleşmemeli.
    expect(isPublicRoute("/company/ilan/abc")).toBe(false);
  });
});

describe("slug — numara önde", () => {
  it("numara + başlık birleştirir", () => {
    expect(listingSlug("ROT-000042", "Çelik Boru Alımı")).toBe(
      "rot-000042-celik-boru-alimi",
    );
  });

  it("başlıktan slug çıkmazsa yalnız numara kalır", () => {
    expect(listingSlug("ROT-7", "🚀🚀")).toBe("rot-7");
  });

  it("numarayı geri okur", () => {
    expect(parseListingNumber("rot-000042-celik-boru-alimi")).toBe("ROT-000042");
    expect(parseListingNumber("rot-7")).toBe("ROT-7");
    expect(parseListingNumber("ROT-7-Baslik")).toBe("ROT-7");
  });

  it("numara taşımayan slug null döner", () => {
    expect(parseListingNumber("celik-boru-alimi")).toBeNull();
    expect(parseListingNumber("")).toBeNull();
    // "rot" var ama rakam yok
    expect(parseListingNumber("rot-abc")).toBeNull();
  });

  it("başlığı 'rot-N' ile BİTEN kayıt yanlış numara vermez", () => {
    // Numara sonda olsaydı bu slug ROT-9'u açardı; başta olduğu için ROT-1.
    expect(parseListingNumber("rot-1-yedek-parca-rot-9")).toBe("ROT-1");
  });

  it("tipe göre doğru tabana yazar", () => {
    expect(listingPath("ALIM", "ROT-1", "Boru")).toBe("/talep/rot-1-boru");
    expect(listingPath("SATIS", "ROT-2", "Vinç")).toBe("/ilan/rot-2-vinc");
  });
});

describe("durum daraltma ve indeks kapısı", () => {
  it("dokuz iç durumu üçe indirir", () => {
    expect(publicState("OPEN")).toBe("open");
    expect(publicState("IN_AWARD")).toBe("evaluating");
    expect(publicState("IN_AWARD_APPROVAL")).toBe("evaluating");
    expect(publicState("AWARDED")).toBe("closed");
    expect(publicState("CANCELLED")).toBe("closed");
  });

  it("bilinmeyen durum KAPALI sayılır (fail-closed)", () => {
    // Yeni bir ListingStatus eklenirse pazar yerinde açık görünmesin.
    expect(publicState("BRAND_NEW_STATUS")).toBe("closed");
    expect(publicState("DRAFT")).toBe("closed");
  });

  it("yalnız teklife açık kayıt indekslenir", () => {
    expect(isIndexableState("open")).toBe(true);
    expect(isIndexableState("evaluating")).toBe(false);
    expect(isIndexableState("closed")).toBe(false);
  });
});

/**
 * DEĞİŞMEZ: her pazar yeri rotası yayın anahtarını okumalı.
 *
 * `MARKETPLACE_LIVE` kapalıyken pazar yeri rotaları 404 döner, robots her şeyi
 * kapatır ve sitemap boşalır. Yeni bir pazar yeri rotası eklenip kapı
 * unutulursa o sayfa yayın öncesi CANLI olur ve arama motoru onu indeksler —
 * geri alınması bizim denetimimizde olmayan bir etki. Bu test dosya sistemi
 * üzerinden o unutmayı yakalar.
 */
describe("yayın anahtarı kapsamı", () => {
  const APP = path.resolve(__dirname, "../../app");
  const PAGES = [
    "alim-talepleri/page.tsx",
    "satilik/page.tsx",
    "firmalar/page.tsx",
    "talep/[slug]/page.tsx",
    "ilan/[slug]/page.tsx",
    "firma/[slug]/urun/[urunSlug]/page.tsx",
    "page.tsx", // anasayfa
  ];

  it("her pazar yeri sayfası MARKETPLACE_LIVE okur", () => {
    const missing = PAGES.filter((rel) => {
      const src = readFileSync(path.join(APP, rel), "utf-8");
      return !src.includes("MARKETPLACE_LIVE");
    });
    expect(missing).toEqual([]);
  });

  it("robots ve sitemap de anahtarı okur", () => {
    for (const f of ["robots.ts", "sitemap.ts"]) {
      expect(readFileSync(path.join(APP, f), "utf-8")).toContain(
        "MARKETPLACE_LIVE",
      );
    }
  });
});

describe("ürün kategori yolu", () => {
  it("kod ÖNDE — ayrıştırma tek regex'e iner", () => {
    const p = categoryPath("39000000", "Elektrik Malzemeleri");
    expect(p).toBe("/urunler/kategori/39000000-elektrik-malzemeleri");
    expect(parseCategoryCode("39000000-elektrik-malzemeleri")).toBe("39000000");
  });

  it("adsız da geçerli bir yol üretir", () => {
    expect(categoryPath("39000000")).toBe("/urunler/kategori/39000000");
    expect(parseCategoryCode("39000000")).toBe("39000000");
  });

  it("ad KODLA BİTİYORSA bile doğru kodu okur", () => {
    // Ad sonda olsaydı "…-39000000" ile biten bir ad yanlış kodu verirdi.
    expect(parseCategoryCode("40000000-boru-39000000")).toBe("40000000");
  });

  it("kod olmayan yol reddedilir", () => {
    expect(parseCategoryCode("elektrik")).toBeNull();
    expect(parseCategoryCode("3900000")).toBeNull(); // 7 hane
    expect(parseCategoryCode("")).toBeNull();
  });
});
