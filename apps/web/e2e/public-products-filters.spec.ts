import { expect, test } from "@playwright/test";

/**
 * /urunler süzgeç senaryosu (PROMPT 3): süzgeç seç → URL değişir → sonuç
 * sayısı değişir → geri tuşu önceki süzgeç durumuna döner. Sayfa yenilenmez
 * (router.replace + startTransition). Çalışan web sunucusu ister
 * (`PLAYWRIGHT_BASE_URL`, pazar yeri anahtarı açık).
 */
async function resultCountText(page: import("@playwright/test").Page) {
  const live = page.locator('p[aria-live="polite"]').first();
  await expect(live).not.toHaveText(/Güncelleniyor/);
  return (await live.textContent())?.trim() ?? "";
}

test.describe("ürün dizini süzgeçleri", () => {
  test("şehir seçimi URL'ye yazılır, sayaç değişir, geri tuşu geri alır", async ({ page }) => {
    await page.goto("/urunler");
    await expect(page.locator('aside[aria-label="Süzgeçler"]')).toBeVisible();
    const before = await resultCountText(page);
    expect(before).toMatch(/ürün/);

    // Başlık seçimden sonra "Şehir (1)" olur — tam eşleşme değil, önek.
    const cityGroup = page.locator('aside[aria-label="Süzgeçler"] fieldset', { has: page.locator("legend", { hasText: /^Şehir/ }) }).first();
    // Grup kapalıysa aç.
    const summary = cityGroup.locator("summary").first();
    if ((await summary.count()) > 0 && !(await cityGroup.locator("input[type=checkbox]").first().isVisible())) {
      await summary.click();
    }
    const firstCity = cityGroup.locator("input[type=checkbox]:not([disabled])").first();
    await expect(firstCity).toBeVisible();
    const cityLabel = (await cityGroup.locator("label").first().textContent())?.trim() ?? "";
    // Seçimden sonra liste yeniden dizilir (bağlamsal sayaçlar) — öğeyi id ile takip et.
    const firstId = await firstCity.getAttribute("id");
    // Kontrollü checkbox: durum URL geçişinden sonra gelir — `click` + auto-wait `toBeChecked`.
    await firstCity.click();

    await expect(page).toHaveURL(/[?&]sehir=/);
    const picked = page.locator(`[id="${firstId}"]`);
    await expect(picked).toBeChecked();
    // Aktif süzgeç çipi görünür (ActiveFilterBar).
    await expect(page.getByRole("button", { name: /süzgecini kaldır/ }).first()).toBeVisible();
    const after = await resultCountText(page);
    expect(after).not.toBe("");
    // Tek şehir seçince sayı toplamdan küçük ya da eşit olmalı.
    const num = (t: string) => Number((t.match(/[\d.]+/)?.[0] ?? "0").replace(/\./g, ""));
    expect(num(after)).toBeLessThanOrEqual(num(before));
    expect(cityLabel.length).toBeGreaterThan(0);

    // İkinci şehir aynı anda seçilebilir (çoklu seçim).
    const secondCity = cityGroup.locator("input[type=checkbox]:not([disabled])").nth(1);
    if ((await secondCity.count()) > 0) {
      await secondCity.click();
      await expect(page).toHaveURL(/sehir=[^&]*(,|%2C)/);
    }

    // Geri tuşu bir önceki süzgeç durumuna döner.
    await page.goBack();
    await expect(page).toHaveURL((u) => !/(,|%2C)/.test(new URL(u).searchParams.get("sehir") ?? "") );
  });

  test("sayfalama gerçek bağlantı üretir ve 7 yuvayı aşmaz", async ({ page }) => {
    await page.goto("/urunler");
    const nav = page.locator('nav[aria-label="Sayfalama"]');
    if ((await nav.count()) === 0) test.skip(true, "tek sayfa — sayfalama çizilmez");
    const links = nav.locator("a");
    expect(await links.count()).toBeLessThanOrEqual(9); // 7 yuva + önceki/sonraki
    await expect(links.first()).toHaveAttribute("href", /sayfa=|\/urunler/);
  });
});
