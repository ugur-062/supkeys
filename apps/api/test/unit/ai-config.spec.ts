/**
 * Faz AI-0 — AI anahtar sağlık kontrolü (saf fonksiyon).
 * Politika: anahtar yok → AI kapalı (boot devam, gürültülü); placeholder/bozuk
 * → prod'da boot FAIL (main.ts). loadAiConfig: fiyatsız model = config hatası.
 */
import { checkAiKey } from "../../src/common/config/ai-config";
import { loadAiConfig } from "../../src/modules/ai/ai.config";
import { costFromUsage } from "../../src/modules/ai/ai-budget.service";

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
    expect(on.models.default).toBe("gemini-2.5-flash"); // env override çalışıyor
    expect(on.monthlyBudgetUsd.SILVER).toBe(6);
    expect(on.monthlyBudgetUsd.GOLD).toBe(25);

    // Env verilmezse stabil -latest alias default (404/dalgalı-preview değil).
    const def = loadAiConfig(envSource({ GEMINI_API_KEY: "test-gecerli-uzun-anahtar-fixture" }));
    expect(def.models.default).toBe("gemini-flash-latest");
    expect(def.models.premium).toBe("gemini-pro-latest");
  });

  it("STANDART istek tavanı Google Search'lü tek profil çağrısını karşılar; diğer paketler %5 (derin denetim S013/X21)", () => {
    const cfg = loadAiConfig(envSource({ GEMINI_API_KEY: "test-gecerli-uzun-anahtar-fixture" }));
    // Profil zenginleştirme grounded çağrısının rezervasyon tahmini (girdi ~1k token).
    const est = costFromUsage(
      { inputTokens: 1000, outputTokens: cfg.maxOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cfg.pricing[cfg.models.default]!,
      { grounded: true },
    );
    const share = cfg.caps.requestShareByTier?.STANDART ?? cfg.caps.requestShare;
    expect(est.toNumber()).toBeLessThanOrEqual(cfg.monthlyBudgetUsd.STANDART! * share);
    // Günün 3 denemesinin EN KÖTÜ hâli (her biri grounded + şema çağrısı,
    // zaman aşımı tahmini tutar) STANDART günlük tavanına sığmalı: önceki
    // iz varken şema çağrısı tavana takılıp grounded ücreti boşa gidiyordu
    // (MU-06 gözden geçirme).
    const sema = costFromUsage(
      { inputTokens: 2_800, outputTokens: cfg.maxOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cfg.pricing[cfg.models.default]!,
    );
    const daily = cfg.caps.dailyShareByTier?.STANDART ?? cfg.caps.dailyShare;
    expect(est.add(sema).toNumber() * 3).toBeLessThanOrEqual(cfg.monthlyBudgetUsd.STANDART! * daily);
    expect(cfg.caps.requestShareByTier?.SILVER).toBeUndefined();
    expect(cfg.caps.requestShareByTier?.GOLD).toBeUndefined();
    expect(cfg.caps.dailyShareByTier?.SILVER).toBeUndefined();
    expect(cfg.caps.dailyShareByTier?.GOLD).toBeUndefined();
  });

  it("fiyat tanımı olmayan model → fail-closed (throw)", () => {
    expect(() =>
      loadAiConfig(envSource({ AI_MODEL_PREMIUM: "gemini-99-ultra" })),
    ).toThrow(/fiyat tanımı yok/);
  });
});
