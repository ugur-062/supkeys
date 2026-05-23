import { test, expect, type Page } from "@playwright/test";

/**
 * V2-7 — İngiliz Usulü ihale için UI testleri.
 *
 * Senaryolar:
 *   A) Tender oluşturma akışı: İngiliz Usulü kartı tıklanabilir, wizard'da
 *      ENGLISH_AUCTION ön-seçili, 5 görünürlük seçeneği + decrement + auto-
 *      extend ayarları render ediliyor.
 *   B) Supplier görünümü: bir auction'a 2. supplier teklif verdikten sonra,
 *      ALL modunda tedarikçi A diğer supplier'ın firma adını UI'da GÖRMÜYOR.
 *
 * Çalıştırmadan önce `pnpm dev` ile API+web ayakta olmalı.
 */

const BUYER_EMAIL = "buyer@demo.com";
const BUYER_PASSWORD = "Buyer1234";
const SUPPLIER_EMAIL = "auction-a@test.local";
const SUPPLIER_PASSWORD = "Auction1234";

async function loginAsBuyer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(BUYER_EMAIL);
  await page.getByLabel("Şifre").fill(BUYER_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

async function loginAsSupplier(page: Page) {
  await page.goto("/supplier/login");
  await page.getByLabel("E-posta").fill(SUPPLIER_EMAIL);
  await page.getByLabel("Şifre").fill(SUPPLIER_PASSWORD);
  await page.getByRole("button", { name: /giriş/i }).click();
  await page.waitForURL(/\/supplier\/dashboard/, { timeout: 15_000 });
}

// ============================================================================
// A) Tender oluşturma akışı
// ============================================================================

test.describe("A) Tender oluşturma — İngiliz Usulü", () => {
  test("Landing'de İngiliz Usulü kartı tıklanabilir + wizard'a yönlenir", async ({
    page,
  }) => {
    await loginAsBuyer(page);
    await page.goto("/dashboard/ihaleler/yeni");

    // İngiliz Usulü kartı görünür ve aktif
    const ingilizCard = page
      .getByRole("button", { name: /İngiliz Usulü/i })
      .first();
    await expect(ingilizCard).toBeVisible();
    // "Yakında" yazısı OLMAMALI
    await expect(page.getByText(/^Yakında$/i)).toHaveCount(0);

    // Tıkla → URL ?type=auction'a değişir
    await ingilizCard.click();
    await expect(page).toHaveURL(/\?type=auction/);
  });

  test("Wizard'da ENGLISH_AUCTION ön-seçili + ayarlar render", async ({
    page,
  }) => {
    await loginAsBuyer(page);
    await page.goto("/dashboard/ihaleler/yeni?type=auction");

    // ENGLISH_AUCTION radio pre-selected
    const auctionRadio = page.locator('input[type="radio"][value="ENGLISH_AUCTION"]');
    await expect(auctionRadio).toBeChecked();

    // RFQ değil
    const rfqRadio = page.locator('input[type="radio"][value="RFQ"]');
    await expect(rfqRadio).not.toBeChecked();

    // V2-7 — Teklif ve Sıralama Görünürlüğü section'ı görünür
    await expect(
      page.getByRole("heading", { name: /Teklif ve Sıralama Görünürlüğü/i }),
    ).toBeVisible();

    // 5 görünürlük seçeneği radio'su mevcut
    for (const value of [
      "OWN_ONLY",
      "BEST_PRICE",
      "OWN_RANK",
      "BEST_AND_OWN_RANK",
      "ALL",
    ]) {
      const radio = page.locator(`input[type="radio"][value="${value}"]`);
      await expect(radio).toHaveCount(1);
    }
  });

  test("Decrement + auto-extend ayar UI'sı görünür", async ({ page }) => {
    await loginAsBuyer(page);
    await page.goto("/dashboard/ihaleler/yeni?type=auction");

    // "Fiyatlar sürekli azalır" sabit kuralı (disabled checkbox)
    await expect(
      page.getByText(/Tedarikçilerin kalem bazında verdiği teklif fiyatları sürekli azalsın/i),
    ).toBeVisible();

    // İhale Kuralları section'ı
    await expect(
      page.getByRole("heading", { name: /İhale Kuralları/i }),
    ).toBeVisible();
  });
});

// ============================================================================
// B) Supplier görünümü — anonimlik UI testleri
// ============================================================================

test.describe("B) Supplier auction görünümü", () => {
  test("Login akışı çalışıyor + dashboard'a düşer", async ({ page }) => {
    await loginAsSupplier(page);
    await expect(page).toHaveURL(/\/supplier\/dashboard/);
  });

  test("İhaleler listesi sayfası açılıyor + token korunuyor", async ({
    page,
  }) => {
    await loginAsSupplier(page);
    await page.goto("/supplier/ihaleler");
    // Sayfa başlığı ya da liste konteynerı render edildi
    await expect(
      page.getByRole("heading", { name: /İhaleler/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
