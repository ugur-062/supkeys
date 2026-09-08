import { expect, test } from "@playwright/test";

/**
 * ÜST ÇUBUK — TEK KATMAN, SADE MENÜ (2026-09-09, kullanıcı kararı).
 *
 * Eski iki katmanlı çubuk (siyah şerit + Kategoriler mega menüsü + üst çubuk
 * araması + "Alım Talepleri") KALDIRILDI; onları doğrulayan senaryolar da
 * bu dosyadan düştü. Mega menü ve typeahead bileşenlerinin kendi birim
 * testleri duruyor — burada artık header'ın taşımadığını doğruluyoruz.
 *
 * Kabul ölçütleri: menü logonun yanında; kaldırılanlar HİÇ çizilmiyor;
 * header 390 px'te YATAY TAŞMIYOR ve çekmece aynı satırları taşıyor.
 */
test.describe("herkese açık üst çubuk", () => {
  test("logonun yanında Nasıl Çalışır + Fiyatlar, sağda giriş/kayıt", async ({ page }) => {
    await page.goto("/urunler");
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Nasıl Çalışır" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Fiyatlar" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Giriş Yap" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Ücretsiz Kaydol" })).toBeVisible();
  });

  test("kaldırılanlar çizilmez: siyah şerit, Kategoriler, arama, Alım Talepleri", async ({ page }) => {
    await page.goto("/urunler");
    const header = page.locator("header").first();
    await expect(header.getByRole("button", { name: /Kategoriler/ })).toHaveCount(0);
    await expect(header.locator("form[role=search]")).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Alım Talepleri" })).toHaveCount(0);
    await expect(header.getByText("Tedarikçi misin?")).toHaveCount(0);
  });

  test("390 px: yatay taşma yok, menü çekmecesi aynı satırları taşır", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/urunler");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Menüyü aç" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Nasıl Çalışır" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Fiyatlar" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Ücretsiz Kaydol" })).toBeVisible();
  });
});
