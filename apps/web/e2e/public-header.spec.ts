import { expect, test } from "@playwright/test";

/**
 * ÜST ÇUBUK (PROMPT 6) — iki katman, mega menü, typeahead.
 *
 * Kabul ölçütleri: mega menü klavyeyle gezilebilir ve Esc ile kapanır;
 * typeahead üç kapsamda çalışır; header 390 px'te YATAY TAŞMAZ.
 */
test.describe("herkese açık üst çubuk", () => {
  test("mega menü açılır, Esc kapatır, kategori bağlantısı kırılmaz", async ({ page }) => {
    await page.goto("/urunler");
    const btn = page.getByRole("button", { name: /Kategoriler/ });
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");

    const all = page.getByRole("link", { name: /ürünleri →$/ });
    await expect(all).toBeVisible();
    const href = await all.getAttribute("href");
    expect(href).toMatch(/^\/urunler\/kategori\/\d{8}-/);

    await page.keyboard.press("Escape");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  test("typeahead: kapsam formun hedefini değiştirir, öneri klavyeyle seçilir", async ({ page }) => {
    await page.goto("/urunler");
    // Hidrasyon ÖNCESİ `select` değişimi React'e ulaşmaz (JS'siz form yine
    // varsayılan kapsama gider — istenen davranış); testin etkileşimi
    // hidrasyondan sonra başlamalı.
    await page.waitForLoadState("networkidle");
    // Sayfanın KENDİ arama formu da `role=search` — typeahead'i kapsam
    // seçicisiyle ayırt et (liste sayfasında iki form var).
    const scope = page.getByLabel("Arama kapsamı").first();
    const form = page.locator("form[role=search]:has(select)");
    await scope.selectOption("companies");
    await expect(form).toHaveAttribute("action", "/firmalar");

    await scope.selectOption("products");
    const input = page.getByRole("combobox", { name: /içinde ara/ }).first();
    await input.click();
    await input.type("pano", { delay: 30 });
    const list = page.getByRole("listbox", { name: "Arama önerileri" });
    await expect(list).toBeVisible({ timeout: 10_000 });
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page).not.toHaveURL(/\/urunler$/);
  });

  test("390 px: yatay taşma yok, menü çekmecesi arama ve bağlantıları taşır", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/urunler");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Menüyü aç" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("combobox", { name: /içinde ara/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Alım Talepleri" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Ücretsiz Kaydol" })).toBeVisible();
  });
});
