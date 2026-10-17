import { COUNTRIES } from "@rothern/shared";
import { describe, expect, it, vi } from "vitest";
import { countryDisplayName } from "../domain";

/**
 * Ülke adı STATİK (arayüz testi O-019): EN/RU `Intl.DisplayNames`ten gelseydi
 * sunucu (Node ICU) ile tarayıcı farklı ad basıp telefon ülke listesinde
 * hidrasyon hatası üretiyordu.
 */
describe("countryDisplayName", () => {
  it("245 ülkenin hepsi EN ve RU'da statik tablodan ad alır (koda düşmez)", () => {
    for (const { code, name } of COUNTRIES) {
      const en = countryDisplayName(code, "en");
      const ru = countryDisplayName(code, "ru");
      expect(en, code).not.toBe(code);
      expect(ru, code).not.toBe(code);
      expect(ru, code).not.toBe(name);
    }
  });

  it("çalışma anı ICU'suna bağlı değil: HK/MO kısa adla, XN elle", () => {
    expect(countryDisplayName("HK", "en")).toBe("Hong Kong");
    expect(countryDisplayName("HK", "ru")).toBe("Гонконг");
    expect(countryDisplayName("XN", "en")).toBe("Northern Cyprus");
    expect(countryDisplayName("DE", "tr")).toBe("Almanya");
  });

  it("Intl.DisplayNames çağrılmaz", () => {
    const spy = vi.spyOn(Intl, "DisplayNames");
    try {
      expect(countryDisplayName("FR", "en")).toBe("France");
      expect(countryDisplayName("FR", "ru")).toBe("Франция");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
