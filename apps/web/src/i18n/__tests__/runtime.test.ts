import { describe, expect, it } from "vitest";
import { registerI18nRuntime, runtimeLocale, tRuntime, unregisterI18nRuntime } from "../runtime";

describe("i18n runtime köprüsü (React dışı)", () => {
  it("köprü yokken Türkçe common yedeği ve varsayılan dil", () => {
    unregisterI18nRuntime();
    expect(runtimeLocale()).toBe("tr");
    expect(tRuntime("common.errors.forbidden")).toBe("Bu işlem için yetkiniz yok");
  });

  it("köprü kaydedilince aktif dilde çevirir, kaldırılınca yedeğe döner", () => {
    registerI18nRuntime("en", {
      common: { errors: { forbidden: "Forbidden!" } },
      web: {},
    } as never);
    expect(runtimeLocale()).toBe("en");
    expect(tRuntime("common.errors.forbidden")).toBe("Forbidden!");
    unregisterI18nRuntime();
    expect(tRuntime("common.errors.forbidden")).toBe("Bu işlem için yetkiniz yok");
  });

  it("eksik anahtar boş değil, anahtar yolu döner", () => {
    registerI18nRuntime("en", { common: { errors: {} }, web: {} } as never);
    expect(tRuntime("common.errors.server")).toBe("common.errors.server");
    unregisterI18nRuntime();
  });
});
