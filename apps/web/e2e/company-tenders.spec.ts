import { expect, test } from "@playwright/test";

/**
 * İhaleler e2e smoke — gerçek tarayıcı, çalışan stack gerektirir
 * (`pnpm dev` + api:4000). Dev hesabı: firma@demo.com / Demo1234!.
 * Giriş → İhalelerim listesi render olur.
 */
const EMAIL = "firma@demo.com";
const PASSWORD = "Demo1234!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/company/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  // Giriş sonrası /company'ye yönlenir (login sayfasından çıkar).
  await page.waitForURL(/\/company(?!\/login)/, { timeout: 20_000 });
}

test("giriş yapıp İhalelerim listesini görür", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/taleplerim");
  await expect(
    page.getByRole("link", { name: /Yeni İhale Aç/ }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("İhale adı veya numarası ara…"),
  ).toBeVisible();
});

test("Yeni İhale Aç sihirbazını açar", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/taleplerim");
  await page.getByRole("link", { name: /Yeni İhale Aç/ }).click();
  await page.waitForURL(/\/ihalelerim\/yeni/, { timeout: 20_000 });
  // Sihirbazın ilk adımı (tür/kapsam) yüklendi.
  await expect(page.locator("body")).toContainText(/İhale|Alım|Tür/i);
});
