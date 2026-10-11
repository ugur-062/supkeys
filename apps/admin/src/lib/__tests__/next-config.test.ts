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

  // Ücretsiz dönem (2026-10-07): üyelik raporu ekranı kaldırıldı, eski adres
  // (yer imi, eski e-posta bağlantısı) 404 vermez.
  it("kaldırılan /admin/uyelik-raporu firma listesine kalıcı yönlenir", async () => {
    const mod = await import("../../../next.config");
    const config = mod.default as {
      redirects?: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
    };
    const rules = (await config.redirects?.()) ?? [];
    expect(rules).toContainEqual({
      source: "/admin/uyelik-raporu",
      destination: "/admin/firmalar",
      permanent: true,
    });
  });
});
