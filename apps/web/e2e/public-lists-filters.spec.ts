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

test("firmalar: 'Doğrulanmış' seçimi URL'ye yazılır ve sayaç düşer ya da eşit kalır", async ({ page }) => {
  await page.goto("/firmalar");
  await expect(page.locator('aside[aria-label="Süzgeçler"]')).toBeVisible();
  const before = num(await resultCountText(page));
  const verified = page.locator('aside[aria-label="Süzgeçler"] input[type=checkbox][id$="-verified"]');
  await verified.click();
  await expect(page).toHaveURL(/[?&]dogrulanmis=1/);
  await expect(page.locator('aside[aria-label="Süzgeçler"] input[type=checkbox][id$="-verified"]')).toBeChecked();
  await expect(page.getByRole("button", { name: /Doğrulanmış süzgecini kaldır/ })).toBeVisible();
  expect(num(await resultCountText(page))).toBeLessThanOrEqual(before);
  // Sıralama çipi URL'ye yazılır.
  await page.getByRole("button", { name: "A-Z" }).click();
  await expect(page).toHaveURL(/sirala=ad/);
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
