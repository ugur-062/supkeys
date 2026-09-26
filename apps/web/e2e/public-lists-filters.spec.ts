import { expect, test } from "@playwright/test";

/**
 * /firmalar ve /alim-talepleri süzgeç senaryoları (PROMPT 4): aynı kabuk,
 * aynı davranış — süzgeç seç → URL değişir → sayaç değişir, sayfa yenilenmez.
 * Çalışan web sunucusu ister (`PLAYWRIGHT_BASE_URL`, pazar yeri anahtarı açık).
 */
async function resultCountText(page: import("@playwright/test").Page) {
  const live = page.locator('p[aria-live="polite"]').first();
  await expect(live).not.toHaveText(/Güncelleniyor/);
  return (await live.textContent())?.trim() ?? "";
}
const num = (t: string) => Number((t.match(/[\d.]+/)?.[0] ?? "0").replace(/\./g, ""));

test("firmalar: üyeliğe yönlendiren vitrin — süzgeç yok, en fazla 6 kart, kayıt çağrısı var (2026-09-22 kararı)", async ({ page }) => {
  await page.goto("/firmalar");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Süzgeç/arama/sayfalama/sayaç bilinçli KALDIRILDI: dizinin tamamı üyelere.
  await expect(page.locator('aside[aria-label="Süzgeçler"]')).toHaveCount(0);
  const cards = await page.locator('a[href^="/firma/"]').evaluateAll((as) => new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")?.split("#")[0])).size);
  expect(cards, "en fazla 6 firma kartı").toBeLessThanOrEqual(6);
  await expect(page.locator('a[href*="/company/kayit"]').first()).toBeVisible();
});

test("alım talepleri: kapsam seçimi URL'ye yazılır; kalan süre radyo gibi davranır", async ({ page }) => {
  await page.goto("/alim-talepleri");
  await expect(page.locator('aside[aria-label="Süzgeçler"]')).toBeVisible();
  const scope = page.locator('aside[aria-label="Süzgeçler"] input[type=checkbox][id$="-scope-yurtici"]');
  if ((await scope.count()) === 0) test.skip(true, "yurtiçi talep yok");
  await scope.click();
  await expect(page).toHaveURL(/kapsam=yurtici/);
  const w7 = page.locator('aside[aria-label="Süzgeçler"] input[type=checkbox][id$="-within-7"]');
  await w7.click();
  await expect(page).toHaveURL(/sure=7/);
  const w30 = page.locator('aside[aria-label="Süzgeçler"] input[type=checkbox][id$="-within-30"]');
  await w30.click();
  await expect(page).toHaveURL(/sure=30/);
  await expect(page).not.toHaveURL(/sure=7/);
  await expect(page.locator('p[aria-live="polite"]').first()).toContainText(/talebi|talep/i);
});
