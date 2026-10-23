import { describe, expect, it } from "vitest";
import { localeForCountry, localeForDomain, recipientLocale } from "../recipient-locale";

describe("alıcı dili (ülkeden türet)", () => {
  it("ülke eşlemesi", () => {
    expect(localeForCountry("TR")).toBe("tr");
    expect(localeForCountry("xn")).toBe("tr");
    expect(localeForCountry("AZ")).toBe("tr");
    for (const cc of ["RU", "BY", "KZ", "KG", "UZ", "TJ", "TM", "AM"]) expect(localeForCountry(cc)).toBe("ru");
    // Rusçanın hassas olduğu ülkeler bilinçli olarak İngilizce.
    for (const cc of ["UA", "GE", "MD", "EE", "LV", "LT", "DE", "CN", "AE", "XK"]) expect(localeForCountry(cc)).toBe("en");
    expect(localeForCountry("")).toBeNull();
    expect(localeForCountry(null)).toBeNull();
    expect(localeForCountry("DEU")).toBeNull();
  });

  it("uzantı yalnız dili belirleyen ülkelerde sonuç verir", () => {
    expect(localeForDomain("info@firma.com.tr")).toBe("tr");
    expect(localeForDomain("sales@zavod.ru")).toBe("ru");
    expect(localeForDomain("https://www.baku-steel.az/contact")).toBe("tr");
    expect(localeForDomain("https://kz-metal.kz")).toBe("ru");
    expect(localeForDomain("info@firma.com")).toBeNull();
    expect(localeForDomain("info@gmbh.de")).toBeNull();
    expect(localeForDomain("")).toBeNull();
  });

  it("öncelik: açık seçim → ülke → e-posta → site → yedek", () => {
    expect(recipientLocale({ explicit: "ru", country: "DE" })).toBe("ru");
    expect(recipientLocale({ explicit: "xx", country: "DE" })).toBe("en");
    expect(recipientLocale({ country: "KZ", email: "a@b.com.tr" })).toBe("ru");
    expect(recipientLocale({ email: "a@b.com.tr", fallback: "en" })).toBe("tr");
    expect(recipientLocale({ email: "a@b.com", website: "https://b.kz", fallback: "tr" })).toBe("ru");
    expect(recipientLocale({ email: "a@b.com", fallback: "en" })).toBe("en");
    expect(recipientLocale({ email: "a@b.com" })).toBe("tr");
  });
});
