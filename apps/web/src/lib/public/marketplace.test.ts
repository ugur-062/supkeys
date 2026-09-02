import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_PREFIXES, isPublicRoute } from "../public-routes";
import {
  MARKETPLACE_ROUTES,
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
  it("her pazar yeri rotası public listede VAR", () => {
    for (const route of Object.values(MARKETPLACE_ROUTES)) {
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
