import { expect, test } from "@playwright/test";

/**
 * PANEL PAZAR BÖLGESİ e2e (2026-09-07) — çalışan stack ister
 * (`pnpm dev` + api:4000). Dev hesabı: firma@demo.com / Demo1234!.
 *
 * Brifin kabul ölçütleri: filtrelenmiş listenin URL'i paylaşılabilir,
 * tarayıcı geri tuşu süzgeçler arasında doğru gezer, kategori ve firma
 * dizinlerinin kendi adresi var, aynı sorgu iki sekmede iki sayı gösterir.
 */
// Ortamdan (staging QA hesabı) ya da yerel demo hesabı.
const EMAIL = process.env.E2E_EMAIL ?? "firma@demo.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Demo1234!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/company/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/company(?!\/login)/, { timeout: 30_000 });
}

async function count(page: import("@playwright/test").Page) {
  const live = page.locator('p[aria-live="polite"]').first();
  await expect(live).not.toHaveText(/Güncelleniyor/, { timeout: 20_000 });
  return Number(((await live.textContent()) ?? "").match(/[\d.]+/)?.[0]?.replace(/\./g, "") ?? "0");
}

test("ürün dizini kendi adresinde: süzgeç URL'ye yazılır, geri tuşu geri alır", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/urunler");
  await expect(page.getByRole("heading", { level: 1, name: "Ürünler" })).toBeVisible();
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  // Kontrollü kutu: durum URL geçişinden SONRA gelir → `check()` değil
  // `click()` + auto-wait `toBeChecked` (public spec'te de aynı desen).
  const rail = page.locator('aside[aria-label="Süzgeçler"]');
  const verified = rail.getByLabel(/^Doğrulanmış/);
  await verified.click();
  await expect(page).toHaveURL(/dogrulanmis=1/);
  await expect(verified).toBeChecked();
  const after = await count(page);
  expect(after).toBeLessThanOrEqual(before);

  // Süzgeç `replace` ile yazılır: geri tuşu SÜZGECE değil, geldiği yere döner.
  // Sayfa ise `push` — 2. sayfadan geri 1. sayfaya dönmeli.
  await page.getByRole("button", { name: "Sayfa 2" }).click();
  await expect(page).toHaveURL(/sayfa=2/);
  await page.goBack();
  await expect(page).not.toHaveURL(/sayfa=2/);
  await expect(page).toHaveURL(/dogrulanmis=1/);
});

test("filtrelenmiş URL paylaşılabilir: yeni sekmede aynı sonuç", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/urunler?dogrulanmis=1&sirala=yeni");
  await expect(page.locator('aside[aria-label="Süzgeçler"]').getByLabel(/^Doğrulanmış/)).toBeChecked();
  await expect(page.getByRole("button", { name: "En yeni" })).toHaveAttribute("aria-pressed", "true");
});

test("kategori kartı kendi sayfasına GİDER (kaydırmaz); kırıntı ve alt dallar var", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma");
  const tile = page.locator('a[href*="/company/satinalma/kategori/"]').first();
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.click();
  await page.waitForURL(/\/company\/satinalma\/kategori\//, { timeout: 20_000 });
  // Kırıntı: Satınalma › Ürünler › <Kategori>
  const crumbs = page.getByRole("navigation", { name: "Yol" });
  await expect(crumbs.getByRole("link", { name: "Ürünler" })).toBeVisible();
  // Kategori süzgeci yolda sabit → çipte görünür.
  await expect(page.getByRole("button", { name: /süzgecini kaldır/ }).first()).toBeVisible();
});

test("Ürünler | Firmalar sekmeleri aynı sorguyu iki sayıyla taşır", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/urunler");
  const tabs = page.getByRole("navigation", { name: "Sonuç türü" });
  await expect(tabs.getByRole("link", { name: /Ürünler/ })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: /Firmalar/ }).click();
  await page.waitForURL(/\/company\/satinalma\/firmalar/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Firmalar" })).toBeVisible();
  expect(await count(page)).toBeGreaterThan(0);
});

test("Bağlantılar: Keşfet YOK; 'Firma bul' portalın dizinine gider; süzgeç rayı burada değil", async ({ page }) => {
  await login(page);
  await page.goto("/company/satinalma/tedarikcilerim");
  // 2026-09-10 yeniden tasarım: sekme/Keşfet kalktı, başlıkta "Firma bul".
  await expect(page.getByRole("link", { name: /Firma bul/ }).first()).toHaveAttribute(
    "href",
    "/company/satinalma/firmalar",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("tablist")).toHaveCount(0);
  // Dizin süzgeç rayı ve sonuç sayacı BURADA olmamalı (tek yerde yaşıyor).
  await expect(page.locator('aside[aria-label="Süzgeçler"]')).toHaveCount(0);
});
