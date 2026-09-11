import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow, gotoRetry, openAs } from "./staging-helpers";

/**
 * PARÇA 3 — SATIN ALMA ZİNCİRİ (staging, QA hesapları).
 *
 * Kurulum API'den (adres, talep, yayın, banka hesabı); kullanıcıya görünen
 * adımlar tarayıcıdan: tedarikçi talebi görür ve "Teklif Ver" İLK EKRANDA
 * (dünkü hata), teklif formu, alıcı kazandırır, sipariş adımları.
 * Sıralı ve durum taşıyan tek test: adımlar birbirine bağlı.
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500"; // discovery L3 (staging kataloğu)

test("talep → teklif → kazandırma → sipariş → tamamlandı", async ({ browser }) => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36).toUpperCase();
  // Her aktör AYRI tarayıcı bağlamı (çerez + localStorage temiz): aynı bağlamda
  // kullanıcı değiştirmek, kalıcı oturum anlık görüntüsüyle yarışıp giriş
  // ekranına düşürüyordu.
  const actor = async () => (await browser.newContext()).newPage();

  // ── Alıcı kurulumu (API) ──────────────────────────────────────────────
  const buyer = await apiSession(QA.aliciKurucu);
  const addrRes = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT",
    title: `QA Depo ${stamp}`,
    addressLine: "Organize Sanayi 1. Cadde No 5",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  expect(addrRes.status, JSON.stringify(addrRes.body)).toBeLessThan(300);
  const addressId: string = addrRes.body.id;

  const listingRes = await apiPost(buyer, "/company/listings", {
    type: "ALIM",
    format: "RFQ",
    title: `QA Çelik Boru Alımı ${stamp}`,
    description: "QA otomasyon talebi — staging.",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addressId,
    closesAt: daysFromNow(7),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [
      { name: "Çelik Boru 2 inç", quantity: 100, unit: "m" },
      { name: "Dirsek 90°", quantity: 40, unit: "adet" },
    ],
  });
  expect(listingRes.status, JSON.stringify(listingRes.body)).toBeLessThan(300);
  const listingId: string = listingRes.body.id;
  // asDraft verilmeyince oluşturma doğrudan yayınlar; taslaksa yayınla.
  if (listingRes.body.status === "DRAFT") {
    const pub = await apiPost(buyer, `/company/listings/${listingId}/publish`);
    expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300);
  }

  // ── Tedarikçi (satışçı) tarayıcıda: talep görünür, Teklif Ver ilk ekranda ──
  let page = await actor();
  await openAs(page, QA.tedarikciSatisci, `/company/ilan/${listingId}`);
  const bidCta = page.getByRole("link", { name: /^Teklif Ver$/ }).first();
  await expect(bidCta, "Teklif Ver düğmesi kaydırmadan görünmeli").toBeVisible({ timeout: 30_000 });
  await bidCta.click();
  await page.waitForURL(/\/teklif-ver/);

  // Teklif formu: her kaleme birim fiyat, geçerlilik, gönder.
  const prices = page.getByLabel("Birim Fiyat");
  await expect(prices.first()).toBeVisible({ timeout: 30_000 });
  const n = await prices.count();
  for (let i = 0; i < n; i++) await prices.nth(i).fill(String(120 + i * 10));
  const validity = page.getByLabel(/Geçerlilik Süresi/);
  if ((await validity.count()) > 0 && !(await validity.first().inputValue())) await validity.first().fill("30");
  const delivery = page.getByLabel("Genel teslim süresi");
  if ((await delivery.count()) > 0) {
    const tag = await delivery.first().evaluate((el) => el.tagName);
    if (tag === "SELECT") await delivery.first().selectOption({ index: 1 });
  }
  await page.getByRole("button", { name: /^Teklifi? Gönder$/ }).first().click();
  // Onay penceresi: toplam teklif + "Teklifi Gönder".
  await page.getByRole("dialog").getByRole("button", { name: "Teklifi Gönder" }).click();
  await page.waitForURL(new RegExp(`/company/ilan/${listingId}(?!/teklif-ver)`), { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(/Teklifiniz alındı/i, { timeout: 30_000 });

  // ── Alıcı tarayıcıda kazandırır ──────────────────────────────────────
  await page.context().close();
  page = await actor();
  await openAs(page, QA.aliciKurucu, `/company/ilan/${listingId}`);
  const award = page.getByRole("button", { name: /^Kazandır$/ }).first();
  await expect(award).toBeVisible({ timeout: 30_000 });
  await award.click();
  await page.getByRole("button", { name: "Evet, kazandır" }).click();
  await expect(page.locator("body")).toContainText(/Kazandırıldı|onaya gönderildi/, { timeout: 30_000 });

  // Sipariş oluştu mu (API ile bul).
  const orders = await apiGet(buyer, "/company/orders");
  expect(orders.status).toBe(200);
  const order = (orders.body as Array<{ id: string; listingId: string | null; number: string | null; status: string }>).find(
    (o) => o.listingId === listingId,
  );
  expect(order, "kazandırma sonrası sipariş").toBeTruthy();
  const orderId = order!.id;

  // ── Tedarikçi: banka hesabı (API) + siparişi onayla (API) → tarayıcıda 'Onaylandı' ──
  const seller = await apiSession(QA.tedarikciKurucu);
  const bank = await apiPost(seller, "/company/bank-accounts", {
    title: `QA TL ${stamp}`,
    accountHolder: "QA Tedarikçi Ltd. Şti.",
    iban: "TR330006100519786457841326",
    bankName: "QA Bank",
    isDefault: true,
  });
  expect(bank.status, JSON.stringify(bank.body)).toBeLessThan(300);
  const accept = await apiPost(seller, `/company/orders/${orderId}/accept`, { bankAccountId: bank.body.id });
  expect(accept.status, JSON.stringify(accept.body)).toBeLessThan(300);

  await page.context().close();
  page = await actor();
  await openAs(page, QA.tedarikciKurucu, `/company/siparis/${orderId}`);
  await expect(page.locator("body")).toContainText(/Onaylandı/, { timeout: 30_000 });
  // Satıcı gönderir ("Siparişi Tamamla" = gönder adımı, madde 17).
  await page.getByRole("button", { name: "Siparişi Tamamla" }).first().click();
  // Pencere: fatura numarası zorunlu + gönderim notu; düğme pencere içinde.
  await page.getByLabel(/Fatura Numarası/).fill(`QA-FTR-${stamp}`);
  await page.getByRole("button", { name: "Siparişi Tamamla" }).last().click();
  await expect(page.locator("body")).toContainText(/Gönderildi|Teslime Hazır/, { timeout: 30_000 });

  // ── Alıcı: teslim aldım (tarayıcı), ödeme (API), tamamla (tarayıcı) ──
  await page.context().close();
  page = await actor();
  await openAs(page, QA.aliciKurucu, `/company/siparis/${orderId}`);
  await page.getByRole("button", { name: "Teslim Aldım" }).click();
  // Pencere: "teslim alındı olarak işaretlenecek ve sipariş otomatik
  // tamamlanacak" (receive → COMPLETED, CLAUDE.md sipariş kuralı).
  // Onay penceresi Headless Dialog (role dialog) ya da alertdialog olabilir;
  // ayrıca sayfadaki asıl düğmeyle karışmasın diye pencere içinden seçilir.
  // Pencere portal ile gövdenin SONUNA eklenir → aynı adlı düğmelerin sonuncusu
  // penceredekidir (rol sorgusu bu pencereyi görmüyor).
  await expect(page.getByText(/teslim alındı olarak işaretlenecek/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Teslim Aldım" }).last().click();
  await expect(page.locator("body")).toContainText(/Tamamlandı/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Teslim Aldım" })).toHaveCount(0);

  // Ödeme: alıcı bildirir (API), satıcı onaylar (API) → sayfada "Onaylanan" tutar.
  const pay = await apiPost(buyer, `/company/orders/${orderId}/payments`, { amount: 17200, method: "EFT", note: "QA ödeme" });
  expect(pay.status, JSON.stringify(pay.body)).toBeLessThan(300);
  const detail = await apiGet(buyer, `/company/orders/${orderId}`);
  const payments = (detail.body?.payments ?? []) as Array<{ id: string; status: string }>;
  const pending = payments.find((p) => p.status !== "CONFIRMED") ?? payments[0];
  expect(pending, "ödeme kaydı").toBeTruthy();
  const confirmPay = await apiPost(seller, `/company/orders/${orderId}/payments/${pending!.id}/confirm`);
  expect(confirmPay.status, JSON.stringify(confirmPay.body)).toBeLessThan(300);
  await page.reload();
  await expect(page.locator("body")).toContainText(/Ödeme tamamlandı|Onaylanan\s*17\.200/, { timeout: 30_000 });

  // Liste kartı: sipariş görünür, talep numarası çipi var.
  await page.goto("/company/satinalma/siparisler");
  await expect(page.getByText(`QA Çelik Boru Alımı ${stamp}`).first()).toBeVisible({ timeout: 30_000 });
});
