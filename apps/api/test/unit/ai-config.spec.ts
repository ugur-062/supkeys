/**
 * Faz AI-0 — AI anahtar sağlık kontrolü (saf fonksiyon).
 * Politika: anahtar yok → AI kapalı (boot devam, gürültülü); placeholder/bozuk
 * → prod'da boot FAIL (main.ts). loadAiConfig: fiyatsız model = config hatası.
 */
import { checkAiKey } from "../../src/common/config/ai-config";
import { loadAiConfig } from "../../src/modules/ai/ai.config";

function envSource(vars: Record<string, string | undefined>) {
  return { get: (k: string) => vars[k] };
}

describe("checkAiKey", () => {
  it("boş/unset → missing (AI kapalı, boot engellenmez)", () => {
    expect(checkAiKey(undefined)).toBe("missing");
    expect(checkAiKey("")).toBe("missing");
    expect(checkAiKey("   ")).toBe("missing");
  });

  it("placeholder/kısa anahtar → placeholder (prod'da boot FAIL)", () => {
    expect(checkAiKey("change_me")).toBe("placeholder");
    expect(checkAiKey("your-api-key-here-123456789")).toBe("placeholder");
    expect(checkAiKey("<GEMINI_KEY>")).toBe("placeholder");
    expect(checkAiKey("xxx")).toBe("placeholder");
    expect(checkAiKey("kisa")).toBe("placeholder"); // < 20 karakter
  });

  it("gerçekçi anahtar → ok", () => {
    expect(checkAiKey("test-gecerli-uzun-anahtar-fixture")).toBe("ok");
  });
});

describe("loadAiConfig", () => {
  it("anahtar yoksa enabled=false; varsa true + env model override", () => {
    const off = loadAiConfig(envSource({}));
    expect(off.enabled).toBe(false);

    const on = loadAiConfig(
      envSource({
        GEMINI_API_KEY: "test-gecerli-uzun-anahtar-fixture",
        AI_MODEL_DEFAULT: "gemini-2.5-flash",
      }),
    );
    expect(on.enabled).toBe(true);
    expect(on.models.default).toBe("gemini-2.5-flash");
    expect(on.monthlyBudgetUsd.SILVER).toBe(6);
    expect(on.monthlyBudgetUsd.GOLD).toBe(25);
  });

  it("fiyat tanımı olmayan model → fail-closed (throw)", () => {
    expect(() =>
      loadAiConfig(envSource({ AI_MODEL_PREMIUM: "gemini-99-ultra" })),
    ).toThrow(/fiyat tanımı yok/);
  });
});
