/**
 * next.config güvenlik ayarları (G3): `x-powered-by: Next.js` çerçeve
 * bilgisini sızdırıyordu. Yapılandırma gerçekten yüklenip doğrulanır.
 */
import { describe, expect, it } from "vitest";

describe("next.config", () => {
  it("X-Powered-By başlığı kapalı", async () => {
    const mod = await import("../../../next.config");
    const config = mod.default as { poweredByHeader?: boolean };
    expect(config.poweredByHeader).toBe(false);
  });
});
