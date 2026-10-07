/**
 * next.config güvenlik ayarları (G3): `x-powered-by: Next.js` çerçeve
 * bilgisini sızdırıyordu. Yapılandırma gerçekten yüklenip doğrulanır.
 */
import { describe, expect, it } from "vitest";

type Redirect = { source: string; destination: string; permanent: boolean };

async function loadConfig() {
  const mod = await import("../../../next.config");
  return mod.default as { poweredByHeader?: boolean; redirects?: () => Promise<Redirect[]> };
}

describe("next.config", () => {
  it("X-Powered-By başlığı kapalı", async () => {
    const config = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });

  /**
   * ÜCRETSİZ DÖNEM (2026-10-07): Paketler ve paket satın alma ekranları
   * silindi. Gönderilmiş e-postalardaki ve yer imlerindeki eski adresler her
   * dilde — iç (Türkçe) yol ve o dilin DIŞ yolu — tek sıçramayla (308) o dilin
   * doğrulama sayfasına gider; hiçbiri 404 olmaz.
   */
  describe("kaldırılan paket adresleri doğrulama sayfasına yönlenir", () => {
    const VERIFY = {
      tr: "/company/ayarlar/dogrulama",
      en: "/en/company/settings/verification",
      ru: "/ru/kompaniya/nastroyki/verifikatsiya",
    };
    const CASES: [string, string][] = [
      // Türkçe (ön eksiz)
      ["/company/premium", VERIFY.tr],
      ["/company/premium/satin-al", VERIFY.tr],
      // İngilizce: dış adres + iç yolun ön ekli biçimi
      ["/en/company/plans", VERIFY.en],
      ["/en/company/plans/checkout", VERIFY.en],
      ["/en/company/premium", VERIFY.en],
      ["/en/company/premium/satin-al", VERIFY.en],
      // Rusça: dış adres + iç yolun ön ekli biçimi
      ["/ru/kompaniya/tarify", VERIFY.ru],
      ["/ru/kompaniya/tarify/oformlenie", VERIFY.ru],
      ["/ru/company/premium", VERIFY.ru],
      ["/ru/company/premium/satin-al", VERIFY.ru],
    ];

    it.each(CASES)("%s → %s (kalıcı)", async (source, destination) => {
      const config = await loadConfig();
      const rules = await config.redirects!();
      const hits = rules.filter((r) => r.source === source);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ destination, permanent: true });
    });

    it("hiçbir yönlendirme kaldırılan paket adreslerini HEDEF almaz", async () => {
      const config = await loadConfig();
      const rules = await config.redirects!();
      for (const r of rules) {
        expect(r.destination).not.toMatch(/\/premium|\/plans|\/tarify/);
      }
    });
  });
});
