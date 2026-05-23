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
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
