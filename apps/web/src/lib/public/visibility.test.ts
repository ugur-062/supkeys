import { describe, expect, it } from "vitest";
import { VISIBILITY, canSee, loginHref } from "./visibility";

describe("görünürlük katmanı", () => {
  it("anonim ziyaretçi fiyat, MOQ, kalem listesi, puan, Rothern ID göremez", () => {
    expect(canSee("anon", "product", "price")).toBe(false);
    expect(canSee("anon", "product", "moq")).toBe(false);
    expect(canSee("anon", "listing", "itemList")).toBe(false);
    expect(canSee("anon", "company", "ratingDistribution")).toBe(false);
    expect(canSee("anon", "company", "rothernId")).toBe(false);
    expect(canSee("anon", "directory", "list")).toBe(false);
  });
  it("anonim ziyaretçi SEO kimliğini görür", () => {
    expect(canSee("anon", "product", "name")).toBe(true);
    expect(canSee("anon", "product", "companyName")).toBe(true);
    expect(canSee("anon", "company", "aboutExcerpt")).toBe(true);
    expect(canSee("anon", "listing", "description")).toBe(true);
  });
  it("ilan sahibi hiçbir katmanda herkese açık yüzeye çıkmaz", () => {
    expect(canSee("premium", "listing", "ownerName")).toBe(false);
  });
  it("katmanlar sıralı — premium üyenin gördüğünü de görür", () => {
    expect(canSee("premium", "company", "aboutFull")).toBe(true);
    expect(canSee("member", "company", "rothernId")).toBe(false);
    expect(canSee("connected", "company", "rothernId")).toBe(true);
  });
  it("giriş bağlantısı yalnız site içi yola yönlendirir", () => {
    expect(loginHref("/company/firma/x")).toBe("/company/login?next=%2Fcompany%2Ffirma%2Fx");
    expect(loginHref("https://kotu.example")).toBe("/company/login");
    expect(loginHref("//kotu.example")).toBe("/company/login");
    expect(loginHref()).toBe("/company/login");
  });
  it("tablo her varlıkta en az bir anon alan taşır (SEO ön koşulu)", () => {
    for (const [entity, fields] of Object.entries(VISIBILITY)) {
      expect(Object.values(fields).includes("anon"), entity).toBe(true);
    }
  });
});
