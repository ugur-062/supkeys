import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow, openAs } from "./staging-helpers";

/**
 * PAZARLIK (açık eksiltme) — "talebi pazarlığa al" turu.
 *
 * Kapalı zarf RFQ ile başlar, iki tedarikçi teklif verir, alıcı TARAYICIDAN
 * "Pazarlığa Geç" der; sonra eksiltme kuralları tek tek sınanır:
 *   · pazarlık DOĞRUDAN açılamaz (yalnız RFQ'dan geçiş)
 *   · yeni tur açmak buy:listing:manage ister; sahip olmayan firma açamaz
 *   · monotonluk: yeni teklif öncekinin ALTINDA olmalı
 *   · görünürlük ayarı: rakip KİMLİĞİ hiçbir modda açılmaz
 *   · pazarlık turunda gönderilmiş teklif taslağa çekilemez
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500";
const items = (ids: string[], price: number) =>
  ids.map((itemId, i) => ({ itemId, unitPrice: price + i * 5 }));

test("RFQ → iki teklif → Pazarlığa Geç (tarayıcı) → eksiltme kuralları", async ({ browser }) => {
  test.setTimeout(600_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const t0 = Date.now();
  const step = (label: string) => console.log(`   ⏱ ${((Date.now() - t0) / 1000).toFixed(1)}s — ${label}`);
  const page = await (await browser.newContext()).newPage();

  // ── Alıcı: RFQ talebi ────────────────────────────────────────────────
  const buyer = await apiSession(QA.aliciSatinalmaci);
  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT",
    title: `QA Pazarlık Depo ${stamp}`,
    addressLine: "Organize Sanayi 3. Cadde No 9",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  expect(addr.status, JSON.stringify(addr.body)).toBeLessThan(300);

  // Pazarlık DOĞRUDAN açılamaz — tek yol RFQ'dan geçiş.
  const direct = await apiPost(buyer, "/company/listings", {
    type: "ALIM",
    format: "ENGLISH_AUCTION",
    title: `QA Doğrudan Pazarlık ${stamp}`,
    description: "Doğrudan eksiltme denemesi — reddedilmeli.",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(5),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [{ name: "Deneme", quantity: 1, unit: "adet" }],
  });
  expect(direct.status, "doğrudan ENGLISH_AUCTION").toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(direct.body)).toContain("Pazarlık doğrudan açılamaz");

  const created = await apiPost(buyer, "/company/listings", {
    type: "ALIM",
    format: "RFQ",
    title: `QA Pazarlık Talebi ${stamp}`,
    description: "Kapalı zarfla başlayıp pazarlığa geçen QA talebi — staging.",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(5),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [
      { name: "Alüminyum Levha 2mm", quantity: 100, unit: "m2" },
      { name: "Perçin M6", quantity: 500, unit: "adet" },
    ],
  });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const id: string = created.body.id;
  if (created.body.status === "DRAFT") await apiPost(buyer, `/company/listings/${id}/publish`);

  step("talep hazır");
  const detail = await apiGet(buyer, `/company/listings/${id}`);
  const itemIds = (detail.body.items as Array<{ id: string }>).map((i) => i.id);
  expect(itemIds.length).toBe(2);

  // ── İki tedarikçi kapalı zarfta teklif verir ─────────────────────────
  const s1 = await apiSession(QA.tedarikciSatisci);
  const s2 = await apiSession(QA.tedarikci2Satisci);
  const bid1 = await apiPost(s1, `/company/listings/${id}/bids`, {
    items: items(itemIds, 100),
    deliveryTime: "W1_2",
    validityDays: 30,
    currency: "TRY",
  });
  expect(bid1.status, JSON.stringify(bid1.body)).toBeLessThan(300);
  const bid2 = await apiPost(s2, `/company/listings/${id}/bids`, {
    items: items(itemIds, 95),
    deliveryTime: "W1_2",
    validityDays: 30,
    currency: "TRY",
  });
  expect(bid2.status, JSON.stringify(bid2.body)).toBeLessThan(300);

  step("teklifler verildi");
  // ── Yeni tur ROL KAPILARI ────────────────────────────────────────────
  const round = { type: "ENGLISH_AUCTION", carryBids: "AUTO", closesAt: daysFromNow(3), bidVisibility: "BEST_PRICE" };
  const viewer = await apiSession(QA.aliciGoruntuleyici);
  expect((await apiPost(viewer, `/company/listings/${id}/new-round`, round)).status, "görüntüleyici yeni tur").toBe(403);
  const seller = await apiSession(QA.aliciSatisci);
  expect((await apiPost(seller, `/company/listings/${id}/new-round`, round)).status, "satışçı yeni tur").toBe(403);
  const other = await apiPost(s1, `/company/listings/${id}/new-round`, round);
  expect(other.status, "ilan sahibi olmayan firma yeni tur").toBeGreaterThanOrEqual(403);

  step("rol kapıları bitti");
  // ── Alıcı TARAYICIDAN pazarlığa geçirir ─────────────────────────────
  await openAs(page, QA.aliciSatinalmaci, `/company/ilan/${id}`);
  step("tarayıcı girişi bitti");
  const cta = page.getByRole("button", { name: "Pazarlığa Geç" });
  await expect(cta, "Pazarlığa Geç düğmesi").toBeVisible({ timeout: 30_000 });
  await cta.click();
  // Headless UI kapanan pencereleri DOM'da bırakıyor → pencereyi BAŞLIĞIYLA seç.
  // Headless UI pencere KÖKÜ kutusuz (display:contents) → Playwright "hidden"
  // sayar; görünürlük başlıktan doğrulanır, kök yalnız KAPSAM olarak kullanılır.
  const dialog = page.getByRole("dialog").filter({ hasText: "Pazarlık Aşamasına Geç" });
  await expect(page.getByText("Pazarlık Aşamasına Geç")).toBeVisible({ timeout: 15_000 });
  // "Yeni Kapanış" zorunlu (tarih + saat ayrı alan).
  const d = new Date(Date.now() + 3 * 86_400_000);
  await dialog.locator('input[type="date"]').fill(d.toISOString().slice(0, 10));
  const time = dialog.locator('input[type="time"]');
  await time.fill("17:00");
  if ((await time.inputValue()) !== "17:00") {
    // 12 saatlik yerelde fill saat alanını boş bırakabiliyor → tuşla yaz.
    await time.click();
    await time.pressSequentially("0500PM");
  }
  expect(await time.inputValue(), "kapanış saati").toBe("17:00");
  await dialog.getByRole("button", { name: "Pazarlığı Başlat" }).click();
  // Zayıf regex sayfadaki "Pazarlık" sözcüğüne takılıyordu → TAM bildirim metni.
  await expect(page.getByText("Pazarlık turu açıldı")).toBeVisible({ timeout: 30_000 });

  step("pazarlık açıldı");
  const afterRound = await apiGet(buyer, `/company/listings/${id}`);
  expect(afterRound.body.format, "format eksiltmeye döndü").toBe("ENGLISH_AUCTION");
  expect(afterRound.body.status).toBe("OPEN");
  expect(Number(afterRound.body.currentRound ?? 1), "tur sayacı").toBeGreaterThan(1);

  // ── MONOTONLUK: yeni teklif öncekinin ALTINDA olmalı ─────────────────
  const higher = await apiPost(s1, `/company/listings/${id}/bids`, {
    items: items(itemIds, 120),
    deliveryTime: "W1_2",
    validityDays: 30,
    currency: "TRY",
  });
  expect(higher.status, "yükselen teklif").toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(higher.body)).toContain("önceki teklifinizin");

  const lower = await apiPost(s1, `/company/listings/${id}/bids`, {
    items: items(itemIds, 80),
    deliveryTime: "W1_2",
    validityDays: 30,
    currency: "TRY",
  });
  expect(lower.status, JSON.stringify(lower.body)).toBeLessThan(300);

  // Pazarlıkta gönderilmiş teklif TASLAĞA çekilemez.
  const toDraft = await apiPost(s1, `/company/listings/${id}/bids`, {
    items: items(itemIds, 70),
    asDraft: true,
    currency: "TRY",
  });
  expect(toDraft.status, "eksiltmede taslağa çekme").toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(toDraft.body)).toContain("taslağa çekilemez");

  step("monotonluk bitti");
  // ── GÖRÜNÜRLÜK: en iyi fiyat açılır, KİMLİK açılmaz ─────────────────
  const asBidder = await apiGet(s2, `/company/listings/${id}`);
  expect(asBidder.status).toBe(200);
  const raw = JSON.stringify(asBidder.body);
  expect(raw, "rakip firma adı").not.toContain("QA Tedarikçi Ltd. Şti.");
  expect(raw, "teklif listesi").not.toContain('"bids"');

  // Rakibi geçmek için tedarikçi2 daha da düşürür.
  const win = await apiPost(s2, `/company/listings/${id}/bids`, {
    items: items(itemIds, 60),
    deliveryTime: "W1_2",
    validityDays: 30,
    currency: "TRY",
  });
  expect(win.status, JSON.stringify(win.body)).toBeLessThan(300);

  // ── Alıcı iki teklifi de görür, en düşük tedarikçi2'de ──────────────
  const owner = await apiGet(buyer, `/company/listings/${id}`);
  const bids = (owner.body.bids ?? []) as Array<{ bidderName: string; amount: string }>;
  expect(bids.length).toBe(2);
  const best = bids.reduce((a, b) => (Number(a.amount) <= Number(b.amount) ? a : b));
  expect(best.bidderName).toBe("QA Tedarikçi 2 A.Ş.");
  await page.reload();
  await expect(page.locator("body")).toContainText(/Pazarlık/i, { timeout: 30_000 });
  await page.context().close();
});
