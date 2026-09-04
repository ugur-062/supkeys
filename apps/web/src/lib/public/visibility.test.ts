import { describe, expect, it } from "vitest";
import { VISIBILITY, canSee, loginHref, signupHref } from "./visibility";

describe("görünürlük katmanı v2", () => {
  it("ürün ve firma anonime açık: fiyat, MOQ, kuruluş, Hakkında, ortalama puan", () => {
    expect(canSee("anon", "product", "price")).toBe(true);
    expect(canSee("anon", "product", "moq")).toBe(true);
    expect(canSee("anon", "company", "foundedYear")).toBe(true);
    expect(canSee("anon", "company", "about")).toBe(true);
    expect(canSee("anon", "company", "ratingAvg")).toBe(true);
    expect(canSee("anon", "directory", "list")).toBe(true);
  });
  it("üyeye kalanlar: bilgi iste, iletişim, Rothern ID, puan dağılımı, alıcı adı, kalem adları", () => {
    expect(canSee("anon", "product", "inquiry")).toBe(false);
    expect(canSee("anon", "company", "contact")).toBe(false);
    expect(canSee("anon", "company", "rothernId")).toBe(false);
    expect(canSee("anon", "company", "ratingDistribution")).toBe(false);
    expect(canSee("anon", "listing", "buyerName")).toBe(false);
    expect(canSee("anon", "listing", "itemNames")).toBe(false);
    expect(canSee("member", "listing", "itemNames")).toBe(true);
  });
  it("talepte ölçek açık, hedef fiyat hiçbir katmanda", () => {
    expect(canSee("anon", "listing", "itemSummary")).toBe(true);
    expect(canSee("anon", "listing", "itemQuantities")).toBe(true);
    expect(canSee("premium", "listing", "targetPrice")).toBe(false);
  });
  it("giriş/kayıt bağlantıları yalnız site içi yola yönlendirir", () => {
    expect(loginHref("/company/firma/x")).toBe("/company/login?next=%2Fcompany%2Ffirma%2Fx");
    expect(loginHref("https://kotu.example")).toBe("/company/login");
    expect(signupHref("teklif", "/talep/rot-000001-x")).toBe(
      "/company/kayit?intent=teklif&redirect=%2Ftalep%2Frot-000001-x",
    );
    expect(signupHref(undefined, "//kotu")).toBe("/company/kayit");
  });
  it("tablo her varlıkta en az bir anon alan taşır (SEO ön koşulu)", () => {
    for (const [entity, fields] of Object.entries(VISIBILITY)) {
      expect(Object.values(fields).includes("anon"), entity).toBe(true);
    }
  });
});
