import { describe, expect, it } from "vitest";
import { parseAdminInteger, parseAdminNumber } from "../number-input";

/**
 * Arayüz testi kapanış NUM (2026-10-03): admin sayı alanları `type="number"`
 * idi; Türkçe tarayıcıda manuel kur "34,5678" 345678, saatlik maliyet "1.500"
 * 1,5, katsayı "0,5" 5, üyelik "0,5" ay 5 gönderiliyordu.
 */
describe("parseAdminNumber — Türkçe kesin ayrıştırma", () => {
  it("manuel kur: virgül ondalık, fazla ondalık reddedilir", () => {
    expect(parseAdminNumber("34,5678", 6)).toBe(34.5678);
    expect(parseAdminNumber("34.5678", 6)).toBe(34.5678); // başka alışkanlık
    expect(parseAdminNumber("34,56789012", 6)).toBeNaN();
  });

  it("binlik nokta: '1.500' 1500, '1.250,5' 1250.5; EN yapıştırma '1,500.5'", () => {
    expect(parseAdminNumber("1.500", 2)).toBe(1500);
    expect(parseAdminNumber("1.250,5", 2)).toBe(1250.5);
    expect(parseAdminNumber("1,500.5", 2)).toBe(1500.5);
    expect(parseAdminNumber("0,5", 2)).toBe(0.5);
    expect(parseAdminNumber("12,50", 2)).toBe(12.5);
    expect(parseAdminNumber("2.5", 2)).toBe(2.5);
  });

  it("tam sayı alanında kesir, çöp ve düzensiz gruplama geçersiz; boş null", () => {
    expect(parseAdminNumber("0,5", 0)).toBeNaN();
    expect(parseAdminNumber("12,50", 0)).toBeNaN();
    expect(parseAdminNumber("1.2.3", 0)).toBeNaN();
    expect(parseAdminNumber("abc", 0)).toBeNaN();
    expect(parseAdminNumber("-3", 0)).toBeNaN();
    expect(parseAdminNumber("  ", 0)).toBeNull();
    expect(parseAdminNumber("12", 0)).toBe(12);
  });

  it("parseAdminInteger aralık + tam sayı", () => {
    expect(parseAdminInteger("0,5", 1, 60)).toBeNull();
    expect(parseAdminInteger("05", 1, 60)).toBe(5);
    expect(parseAdminInteger("61", 1, 60)).toBeNull();
    expect(parseAdminInteger("12", 1, 60)).toBe(12);
  });
});
