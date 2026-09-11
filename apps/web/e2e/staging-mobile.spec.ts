import { expect, test, type Page } from "@playwright/test";
import { QA, uiLogin } from "./staging-helpers";

/**
 * PARÇA 8 — MOBİL (400 px). Ana ekranlar: yatay taşma yok, menü düğmesi
 * görünür, süzgeç çekmecesi açılır.
 */
test.use({ viewport: { width: 400, height: 800 } });

async function expectNoHorizontalOverflow(page: Page, label: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${label}: yatay taşma (scrollWidth ${sw} > ${iw})`).toBeLessThanOrEqual(iw + 1);
}

test("ziyaretçi: anasayfa, ürünler (süzgeç çekmecesi), firmalar, alım talepleri, talep detayı", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page, "/");

  await page.goto("/urunler");
  await expectNoHorizontalOverflow(page, "/urunler");
  await page.getByRole("button", { name: /^Filtrele/ }).first().click();
  await expect(page.getByRole("dialog").getByText("Filtreler", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  for (const path of ["/firmalar", "/alim-talepleri"]) {
    await page.goto(path);
    await expectNoHorizontalOverflow(page, path);
  }
  const first = page.locator('a[href^="/talep/"]').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.click();
  await page.waitForURL(/\/talep\//);
  await expectNoHorizontalOverflow(page, "talep detayı");
});

test("üye: panel anasayfa, Taleplerim, Siparişler, Bağlantılar, Ayarlar", async ({ page }) => {
  test.setTimeout(180_000);
  await uiLogin(page, QA.aliciKurucu);
  for (const path of [
    "/company/satinalma",
    "/company/satinalma/taleplerim",
    "/company/satinalma/siparisler",
    "/company/satinalma/tedarikcilerim",
    "/company/ayarlar",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, path);
  }
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  await expect(page.getByRole("button", { name: "Menüyü kapat" })).toBeVisible();
});
