import { describe, expect, it } from "vitest";
import { createApiTranslator, createFormatterFor, createTranslatorFor, createWebTranslator } from "../translator";

describe("translator", () => {
  it("ICU parametreli mesajı dile göre üretir", () => {
    const tr = createApiTranslator("tr");
    const en = createApiTranslator("en");
    expect(tr("api.validation.stringMin", { n: 3 })).toBe("En az 3 karakter olmalı");
    expect(en("api.validation.stringMin", { n: 3 })).toBe("Must be at least 3 characters");
  });

  it("web çevirmeni ad alanıyla çalışır", () => {
    const t = createWebTranslator("tr");
    expect(t("web.settings.language.label")).toBe("Dil");
    expect(t("common.errors.notFound")).toBe("Kayıt bulunamadı");
  });

  it("eksik anahtar boş değil, anahtar yolu döner (geliştirici görsün)", () => {
    const t = createTranslatorFor("tr", ["common"]);
    // Bilinçli: tip dışı anahtar — çalışma zamanı davranışı sınanıyor.
    expect((t as unknown as (k: string) => string)("common.errors.yok")).toBe("common.errors.yok");
  });

  it("biçimlendirici dile göre sayı basar", () => {
    expect(createFormatterFor("tr").number(1234.5)).toBe("1.234,5");
    expect(createFormatterFor("en").number(1234.5)).toBe("1,234.5");
  });
});
