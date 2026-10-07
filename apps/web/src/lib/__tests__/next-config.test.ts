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

  it("kaldırılan 2FA ayar sayfasının eski adresleri her dilde Ayarlar anasayfasına 308'lenir", async () => {
    const mod = await import("../../../next.config");
    const config = mod.default as {
      redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
    };
    const rules = await config.redirects();
    const hedef = (source: string) => rules.find((r) => r.source === source);
    for (const [source, destination] of [
      ["/company/ayarlar/2fa", "/company/ayarlar"],
      ["/en/company/ayarlar/2fa", "/en/company/settings"],
      ["/ru/company/ayarlar/2fa", "/ru/kompaniya/nastroyki"],
      ["/en/company/settings/2fa", "/en/company/settings"],
      ["/ru/kompaniya/nastroyki/2fa", "/ru/kompaniya/nastroyki"],
    ]) {
      expect(hedef(source), source).toMatchObject({ destination, permanent: true });
    }
  });
});
