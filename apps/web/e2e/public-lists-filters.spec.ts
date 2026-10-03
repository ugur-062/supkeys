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
  // Kart = firma bağlantısı taşıyan <article>. Eski sayım her "/firma/…"
  // bağlantısını sayıyordu; kartın içindeki ürün önizlemeleri
  // (/firma/<slug>/urun/<ürün>) 6 firmayı 24 "kart" gösteriyordu.
  const cards = page.locator("main article").filter({ has: page.locator('a[href^="/firma/"]') });
  const cardCount = await cards.count();
  const slugs = await cards.locator('a[href^="/firma/"]').evaluateAll(
    (as) => new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")?.match(/^\/firma\/[^/#?]+/)?.[0])).size,
  );
  expect(cardCount, "en fazla 6 firma kartı").toBeLessThanOrEqual(6);
  expect(slugs, "her kart tek bir firmaya ait (ürün önizlemeleri ayrı kart sayılmaz)").toBe(cardCount);
  await expect(page.locator('a[href*="/company/kayit"]').first()).toBeVisible();
});

/**
 * Yurtiçi/uluslararası KAPSAM süzgeci 2026-09-21'de kalktı (görünürlük ülkesi
 * geldi); eski test her koşuda "yurtiçi talep yok" diye atlanıyordu. Kalan
 * süre süzgeci radyo gibi davranır: tek seçim, aynı seçeneğe ikinci tık
 * seçimi kaldırır, seçim URL'ye (`sure=`) yazılır.
 */
test("alım talepleri: kapsam süzgeci yok; kalan süre radyo gibi davranır ve URL'ye yazılır", async ({ page }) => {
  await page.goto("/alim-talepleri");
  const aside = page.locator('aside[aria-label="Süzgeçler"]');
  await expect(aside).toBeVisible();
  await expect(aside.locator('input[id*="-scope-"]'), "kalkmış kapsam süzgeci").toHaveCount(0);
  const within = (k: string) => aside.locator(`input[type=checkbox][id$="-within-${k}"]`);
  await expect(within("30")).toHaveCount(1);
  // Sayısı 0 olan seçenek devre dışı (3 ⊂ 7 ⊂ 30): 30 gün bile boşsa açık talep yok.
  if (await within("30").isDisabled()) test.skip(true, "30 gün içinde kapanan açık talep yok");
  await within("30").click();
  await expect(page).toHaveURL(/sure=30/);
  if (await within("7").isEnabled()) {
    await within("7").click();
    await expect(page).toHaveURL(/sure=7(&|$)/);
    await expect(page).not.toHaveURL(/sure=30/);
    await expect(within("30")).not.toBeChecked();
  }
  // İşaretli seçeneğe yeniden tık → seçim kalkar.
  const checked = (await within("7").isChecked()) ? within("7") : within("30");
  await checked.click();
  await expect(page).not.toHaveURL(/sure=/);
  await expect(page.locator('p[aria-live="polite"]').first()).toContainText(/talebi|talep/i);
});
