import { expect, test } from "@playwright/test";

/**
 * ÜST ÇUBUK — TEK KATMAN, SADE MENÜ (2026-09-09, kullanıcı kararı).
 *
 * Eski iki katmanlı çubuk (siyah şerit + Kategoriler mega menüsü + üst çubuk
 * araması) KALDIRILDI; onları doğrulayan senaryolar da bu dosyadan düştü.
 * Mega menü ve typeahead bileşenlerinin kendi birim testleri duruyor —
 * burada artık header'ın taşımadığını doğruluyoruz.
 *
 * Hedef sayfalar GERİ GELDİ (2026-09-09, kullanıcı: "eskiden daha fazla
 * başlık vardı, şimdi 2 tane"): Ürünler · Firmalar · Alım Talepleri düz
 * bağlantı olarak menüde. Bir tur "Alım Talepleri header'da ÇİZİLMEZ" diye
 * kilitlenmişti — o kural kullanıcı kararıyla değişti, kaldırılanlar listesi
 * yalnız mega menü + arama + siyah şerit.
 *
 * Kabul ölçütleri: beş menü satırı logonun yanında; kaldırılanlar HİÇ
 * çizilmiyor; header 390 px'te YATAY TAŞMIYOR ve çekmece aynı satırları
 * taşıyor.
 */
test.describe("herkese açık üst çubuk", () => {
  /**
   * MASAÜSTÜ YERLEŞİMİ — viewport AÇIKÇA sabitlenir (2026-09-12).
   *
   * Bu iki senaryo logonun yanındaki menü satırını doğruluyor, ama o satır
   * `marketing-header.tsx`'te `hidden … lg:flex` — yani 1024 px ALTINDA hiç
   * çizilmiyor (hamburger `lg:hidden` devralıyor). Projeden gelen viewport'a
   * güvenildiği için `mobil-safari` (devices["iPhone 14"] = 390 px) bu
   * dosyayı kapsadığında ilk senaryo KESİN kırmızıydı: Safari hatası değil,
   * masaüstü iddiasının mobil viewport'ta koşması. Chromium (Desktop Chrome)
   * ve webkit-kritik (Desktop Safari) zaten 1280 px olduğu için gizlenmişti.
   *
   * Kapsam DARALMADI: 390 px çekmece senaryosu aşağıda kendi viewport'unu
   * kendisi kuruyor, yani mobil yüzey iPhone/WebKit bağlamında koşmaya
   * devam ediyor.
   */
  test.describe("masaüstü yerleşimi", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("logonun yanında beş menü satırı, sağda giriş/kayıt", async ({ page }) => {
      await page.goto("/urunler");
      const header = page.locator("header").first();
      await expect(header.getByRole("link", { name: "Ürünler", exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: "Firmalar", exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: "Alım Talepleri" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Nasıl Çalışır" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Fiyatlar" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Giriş Yap" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Ücretsiz Kaydol" })).toBeVisible();
    });

    test("kaldırılanlar çizilmez: siyah şerit, Kategoriler mega menüsü, arama", async ({ page }) => {
      await page.goto("/urunler");
      const header = page.locator("header").first();
      await expect(header.getByRole("button", { name: /Kategoriler/ })).toHaveCount(0);
      await expect(header.locator("form[role=search]")).toHaveCount(0);
      await expect(header.getByText("Tedarikçi misin?")).toHaveCount(0);
    });
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
    await expect(sheet.getByRole("link", { name: "Ürünler", exact: true })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Alım Talepleri" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Nasıl Çalışır" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Fiyatlar" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Ücretsiz Kaydol" })).toBeVisible();
  });
});
