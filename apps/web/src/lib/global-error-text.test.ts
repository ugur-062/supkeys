import { describe, expect, it } from "vitest";
import { globalErrorText, localeFromPathname } from "./global-error-text";

describe("kök hata sınırı metni — sağlayıcısız, adresin dilinde", () => {
  it("dil adresin ön ekinden; Türkçe ön eksiz", () => {
    expect(localeFromPathname("/en/products")).toBe("en");
    expect(localeFromPathname("/ru/kompaniya/vhod")).toBe("ru");
    expect(localeFromPathname("/urunler")).toBe("tr");
    expect(localeFromPathname("/")).toBe("tr");
    expect(localeFromPathname("/enerji")).toBe("tr");
  });

  it("üç dilde ayrı metin", () => {
    expect(globalErrorText("tr").retry).toBe("Tekrar dene");
    expect(globalErrorText("en").title).toBe("Something went wrong");
    expect(globalErrorText("ru").retry).toBe("Повторить");
  });
});
