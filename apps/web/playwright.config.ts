import { defineConfig, devices } from "@playwright/test";

/**
 * V2-7 — Playwright UI test config.
 *
 * Beklenti: web dev (http://localhost:3000) + api dev (http://localhost:4000)
 * önceden çalışır halde. Test başlatmadan önce `pnpm dev` ile başlatın.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // testler aynı kullanıcı session'ını paylaşıyor
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    // Staging Vercel Deployment Protection arkasında: bypass anahtarı
    // (Project → Deployment Protection → Protection Bypass for Automation)
    // `PLAYWRIGHT_VERCEL_BYPASS` ile gelir; ikinci başlık çerezi de yazdırır
    // ki istemci yönlendirmeleri korumaya takılmasın.
    ...(process.env.PLAYWRIGHT_VERCEL_BYPASS
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": process.env.PLAYWRIGHT_VERCEL_BYPASS,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    /**
     * TARAYICI MATRİSİ (2026-09-12) — yalnız Chromium test etmek, Safari'ye
     * özgü kırılmaları (çerez/ITP davranışı, tarih-saat alanları, Intl)
     * göremiyordu. WebKit YERELDE koşmaz: 216 sistem paketi ister (sudo) →
     * bu projeler CI'da (.github/workflows/e2e-staging.yml) koşar.
     *
     * Kapsam bilinçli DAR: giriş (çerez), herkese açık başlık (SEO yüzeyi) ve
     * mobil ekranlar. Tüm paketi iki motorda koşmak süreyi ikiye katlardı,
     * karşılığı yok.
     */
    {
      name: "webkit-kritik",
      use: { ...devices["Desktop Safari"] },
      testMatch: /(staging-role-logins|public-header|staging-mobile)\.spec\.ts/,
    },
    {
      name: "mobil-safari",
      use: { ...devices["iPhone 14"] },
      testMatch: /(public-header|staging-mobile)\.spec\.ts/,
    },
  ],
});
