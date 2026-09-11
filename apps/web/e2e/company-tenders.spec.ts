import { expect, test } from "@playwright/test";
import { uiLogin } from "./staging-helpers";

/**
 * İhaleler e2e smoke — gerçek tarayıcı, çalışan stack gerektirir
 * (`pnpm dev` + api:4000). Dev hesabı: firma@demo.com / Demo1234!.
 * Giriş → Taleplerim listesi render olur.
 */
// Ortamdan (staging QA hesabı) ya da yerel demo hesabı.
const EMAIL = process.env.E2E_EMAIL ?? "firma@demo.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Demo1234!";

async function login(page: import("@playwright/test").Page) {
  // Ortak yardımcı: giriş ucu IP başına 10/dk sınırlı, 429'da bekleyip yineler.
  await uiLogin(page, EMAIL);
}


test("giriş yapıp Taleplerim listesini görür", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/taleplerim");
  // Etiket ürün sözlüğünden gelir ("ihale" sözcüğü 2026-09-01'de kalktı) —
  // düğme adres ile bulunur, metne bağlanmaz.
  await expect(page.locator('a[href="/company/satinalma/taleplerim/yeni"]').first()).toBeVisible();
  await expect(page.getByPlaceholder(/ara/i).first()).toBeVisible();
});

test("Yeni talep sayfasını açar", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/taleplerim");
  await page.locator('a[href="/company/satinalma/taleplerim/yeni"]').first().click();
  await page.waitForURL(/\/taleplerim\/yeni/, { timeout: 20_000 });
  // Hızlı talep ekranı (kalemler + adres + kime) yüklendi.
  await expect(page.locator("body")).toContainText(/Kalem|Talep/i);
});
