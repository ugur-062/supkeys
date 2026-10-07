/**
 * THROTTLE_* env → hız sınırı (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * Kök neden: `Number(process.env.X ?? 100)` yalnız `undefined`ı yakalar. Render
 * panelinde boş bırakılan anahtar `""` gelir → `Number("")` = 0 → sınır 0 → her
 * istek 429 (API kilitlenir).
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_THROTTLE_AUTH_LIMIT,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_PUBLIC_LIMIT,
  resolveThrottleLimit,
} from "../../src/common/http/throttle-limit";

describe("resolveThrottleLimit", () => {
  const NAME = "THROTTLE_SPEC_ONLY_LIMIT";
  beforeAll(() => {
    delete process.env[NAME];
  });
  const run = (raw: string | undefined, fallback = 100) => {
    const warnings: string[] = [];
    // Test ortamında TANIMSIZ bir ad: `raw` undefined iken varsayılan parametre
    // gerçek process.env'i okur (jest ortamı THROTTLE_DEFAULT_LIMIT'i yükseltir).
    const limit = resolveThrottleLimit(NAME, fallback, raw, (m) => warnings.push(m));
    return { limit, warnings };
  };

  it("tanımsız → varsayılan, uyarı YOK", () => {
    expect(run(undefined)).toEqual({ limit: 100, warnings: [] });
  });

  it.each([["", "boş"], ["   ", "yalnız boşluk"], ["abc", "sayı değil"], ["0", "sıfır"], ["-5", "negatif"], ["0.4", "yuvarlanınca 0"], ["Infinity", "sonsuz"], ["NaN", "NaN"], ["100 req", "birimli"]])(
    "%j (%s) → varsayılan + uyarı (0 sınırı API'yi 429'a kilitlerdi)",
    (raw) => {
      const { limit, warnings } = run(raw);
      expect(limit).toBe(100);
      expect(limit).toBeGreaterThan(0);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(NAME);
      expect(warnings[0]).toContain("100");
    },
  );

  it("geçerli pozitif değer aynen kullanılır (boşluk kırpılır, kesir aşağı yuvarlanır), uyarı yok", () => {
    expect(run("250")).toEqual({ limit: 250, warnings: [] });
    expect(run(" 250 ")).toEqual({ limit: 250, warnings: [] });
    expect(run("1")).toEqual({ limit: 1, warnings: [] });
    expect(run("99.9")).toEqual({ limit: 99, warnings: [] });
  });

  it("env'den okur (üçüncü parametre verilmezse)", () => {
    process.env[NAME] = "";
    const warnings: string[] = [];
    expect(resolveThrottleLimit(NAME, 100, undefined, (m) => warnings.push(m))).toBe(100);
    expect(warnings).toHaveLength(1);
    process.env[NAME] = "42";
    expect(resolveThrottleLimit(NAME, 100, undefined, () => undefined)).toBe(42);
    delete process.env[NAME];
  });

  it("uyarı uzun değeri kırpar", () => {
    const { warnings } = run("x".repeat(500));
    expect(warnings[0]!.length).toBeLessThan(300);
  });

  it("varsayılan sabitler belgelenen değerlerde", () => {
    expect(DEFAULT_THROTTLE_LIMIT).toBe(100);
    expect(DEFAULT_THROTTLE_AUTH_LIMIT).toBe(1000);
    expect(DEFAULT_THROTTLE_PUBLIC_LIMIT).toBe(600);
  });
});

describe("kablolama — boş env gerçek dekoratörde 0 sınırı üretmez", () => {
  const prev = process.env.THROTTLE_PUBLIC_LIMIT;
  afterEach(() => {
    if (prev === undefined) delete process.env.THROTTLE_PUBLIC_LIMIT;
    else process.env.THROTTLE_PUBLIC_LIMIT = prev;
  });

  const publicLimitWith = (value: string | undefined): unknown => {
    if (value === undefined) delete process.env.THROTTLE_PUBLIC_LIMIT;
    else process.env.THROTTLE_PUBLIC_LIMIT = value;
    let limit: unknown;
    jest.isolateModules(() => {
      const mod = require("../../src/modules/public-profile/public-profile.controller") as {
        PublicProfileController: object;
      };
      limit = Reflect.getMetadata("THROTTLER:LIMITdefault", mod.PublicProfileController);
    });
    return limit;
  };

  it("THROTTLE_PUBLIC_LIMIT boş → 600 (eskiden 0)", () => {
    expect(publicLimitWith("")).toBe(600);
  });
  it("THROTTLE_PUBLIC_LIMIT tanımsız → 600; geçerli → o değer", () => {
    expect(publicLimitWith(undefined)).toBe(600);
    expect(publicLimitWith("900")).toBe(900);
  });

  it("src altında ham `Number(process.env.THROTTLE_…)` kalmadı", () => {
    for (const rel of [
      "app.module.ts",
      "modules/public-profile/public-profile.controller.ts",
      "modules/public-marketplace/public-marketplace.controller.ts",
    ]) {
      const code = readFileSync(join(__dirname, "../../src", rel), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(code).not.toMatch(/Number\(\s*process\.env\.THROTTLE_/);
    }
    const appModule = readFileSync(join(__dirname, "../../src/app.module.ts"), "utf8");
    expect(appModule).toContain('resolveThrottleLimit("THROTTLE_DEFAULT_LIMIT", DEFAULT_THROTTLE_LIMIT)');
    expect(appModule).toContain('resolveThrottleLimit("THROTTLE_AUTH_LIMIT", DEFAULT_THROTTLE_AUTH_LIMIT)');
  });
});
