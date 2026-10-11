import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const captureRequestError = vi.fn();
vi.mock("@sentry/nextjs", () => ({ init: (...a: unknown[]) => init(...a), captureRequestError }));

/**
 * Derin denetim Y-12: Next instrumentation kancasını `path.join(appDir, "..")`
 * altında arar (next/dist/build/index.js). `src/app` düzeninde bu `src/`dir;
 * dosya uygulama kökündeyken `register()` hiç çalışmıyor, Sentry başlamıyordu.
 */
describe("instrumentation (sunucu Sentry kancası)", () => {
  const appRoot = path.resolve(__dirname, "..");
  const appDir = path.join(appRoot, "src", "app");
  const EXT = ["ts", "js", "mts", "mjs"];

  it("Next'in aradığı yerde durur (appDir'in bir üstü)", () => {
    expect(existsSync(appDir)).toBe(true);
    const hookDir = path.join(appDir, "..");
    expect(EXT.some((e) => existsSync(path.join(hookDir, `instrumentation.${e}`)))).toBe(true);
  });

  it("uygulama kökünde (Next'in görmediği yerde) kopyası yok", () => {
    for (const e of EXT) expect(existsSync(path.join(appRoot, `instrumentation.${e}`))).toBe(false);
  });

  describe("register()", () => {
    beforeEach(() => {
      init.mockClear();
      vi.unstubAllEnvs();
    });
    afterEach(() => vi.unstubAllEnvs());

    it("DSN varken Sentry'i süzgeçle başlatır", async () => {
      vi.stubEnv("SENTRY_DSN", "https://k@o0.ingest.sentry.io/1");
      const { register } = await import("./instrumentation");
      await register();
      expect(init).toHaveBeenCalledTimes(1);
      const [opts] = init.mock.calls[0] as [Record<string, unknown>];
      expect(opts.dsn).toBe("https://k@o0.ingest.sentry.io/1");
      expect(opts.sendDefaultPii).toBe(false);
      expect(typeof opts.beforeSend).toBe("function");
    });

    it("DSN yoksa NO-OP", async () => {
      vi.stubEnv("SENTRY_DSN", "");
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
      const { register } = await import("./instrumentation");
      await register();
      expect(init).not.toHaveBeenCalled();
    });
  });

  it("sunucu istek hatalarını Sentry'e bağlar (onRequestError)", async () => {
    const mod = await import("./instrumentation");
    expect(mod.onRequestError).toBe(captureRequestError);
  });
});
