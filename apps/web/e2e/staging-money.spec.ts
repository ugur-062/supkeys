import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow } from "./staging-helpers";

/**
 * PARA YOLU (2026-09-12) — çok para birimli teklif, KALEM BAZLI kazandırma ve
 * ödeme aritmetiği. Birim testleri vardı; gerçek ortamda kur damgası, sipariş
 * bölünmesi ve kalan-tutar tavanı BİRLİKTE hiç sınanmamıştı.
 *
 * Zincir: 2 kalemlik talep → tedarikçi1 USD, tedarikçi2 TRY teklif →
 * alıcı kalem bazlı kazandırır (her kalem farklı tedarikçiye) → İKİ sipariş →
 * ödeme: fazla ödeme REDDEDİLİR, kısmi kabul edilir, kalan tamamlanır.
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500";

test("çok para birimli teklif → kalem bazlı kazandırma → iki sipariş → ödeme aritmetiği", async () => {
  test.setTimeout(600_000);
  const stamp = Date.now().toString(36).toUpperCase();

  const buyer = await apiSession(QA.aliciSatinalmaci);
  const s1 = await apiSession(QA.tedarikciSatisci);
  const s2 = await apiSession(QA.tedarikci2Satisci);

  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT",
    title: `QA Para Depo ${stamp}`,
    addressLine: "Organize Sanayi 6. Cadde No 21",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  expect(addr.status).toBeLessThan(300);

  const listing = await apiPost(buyer, "/company/listings", {
    type: "ALIM",
    format: "RFQ",
    title: `QA Para Yolu ${stamp}`,
    description: "Çok para birimli teklif ve kalem bazlı kazandırma QA talebi.",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(5),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY", "USD"],
    // PEŞİN ödeme: ödeme penceresi satıcı KABULÜNDE açılır. Teslim sonrası
    // ödeme yolu zaten sipariş zinciri testinde koşuyor; burada peşin dalı ve
    // kalan-tutar aritmetiği sınanıyor.
    paymentCategory: "ADVANCE",
    advancePercent: 100,
    items: [
      { name: "Rulman 6204", quantity: 100, unit: "adet" },
      { name: "Kayış A-50", quantity: 40, unit: "adet" },
    ],
  });
  expect(listing.status, JSON.stringify(listing.body)).toBeLessThan(300);
  const id: string = listing.body.id;
  if (listing.body.status === "DRAFT") await apiPost(buyer, `/company/listings/${id}/publish`);
  const detail = await apiGet(buyer, `/company/listings/${id}`);
  const items = (detail.body.items as Array<{ id: string; name: string }>);
  expect(items).toHaveLength(2);

  // ── Farklı para birimlerinde teklif ─────────────────────────────────
  const bidUsd = await apiPost(s1, `/company/listings/${id}/bids`, {
    items: items.map((it, i) => ({ itemId: it.id, unitPrice: 10 + i })),
    currency: "USD",
    deliveryTime: "W1_2",
    validityDays: 30,
  });
  expect(bidUsd.status, JSON.stringify(bidUsd.body)).toBeLessThan(300);
  const bidTry = await apiPost(s2, `/company/listings/${id}/bids`, {
    items: items.map((it, i) => ({ itemId: it.id, unitPrice: 500 + i * 10 })),
    currency: "TRY",
    deliveryTime: "W1_2",
    validityDays: 30,
  });
  expect(bidTry.status, JSON.stringify(bidTry.body)).toBeLessThan(300);

  // Alıcı iki teklifi de kendi biriminde ve TL karşılığıyla görür (kur damgası).
  const owner = await apiGet(buyer, `/company/listings/${id}`);
  const bids = owner.body.bids as Array<{ id: string; currency: string; amount: string; amountTry: string | null; exchangeRateSnapshot: string | null; bidderName: string }>;
  expect(bids).toHaveLength(2);
  const usd = bids.find((b) => b.currency === "USD")!;
  const tryBid = bids.find((b) => b.currency === "TRY")!;
  expect(usd, "USD teklif").toBeTruthy();
  expect(Number(usd.amountTry), "yabancı teklif TL'ye çevrilmiş").toBeGreaterThan(Number(usd.amount));
  expect(Number(usd.exchangeRateSnapshot), "kur damgası").toBeGreaterThan(1);
  // TL teklifte çevrim yok (baz para birimi).
  expect(tryBid.exchangeRateSnapshot ?? null, "TL teklifte kur damgası gereksiz").toBeNull();

  // ── Kalem bazlı kazandırma: kalem 1 → USD teklif, kalem 2 → TL teklif ──
  const award = await apiPost(buyer, `/company/listings/${id}/award-by-item`, {
    itemAwards: [
      { itemId: items[0]!.id, bidId: usd.id },
      { itemId: items[1]!.id, bidId: tryBid.id },
    ],
  });
  expect(award.status, JSON.stringify(award.body)).toBeLessThan(300);

  // İKİ sipariş: her tedarikçi için bir tane, kendi para biriminde.
  const orders = (await apiGet(buyer, "/company/orders")).body as Array<{ id: string; listingId: string | null; currency: string; amount: string }>;
  const mine = orders.filter((o) => o.listingId === id);
  expect(mine, "kalem bazlı kazandırma tedarikçi başına sipariş üretir").toHaveLength(2);
  const currencies = mine.map((o) => o.currency).sort();
  expect(currencies, "siparişler teklifin para biriminde").toEqual(["TRY", "USD"]);

  // ── Ödeme aritmetiği (TL sipariş üzerinde) ──────────────────────────
  const tryOrder = mine.find((o) => o.currency === "TRY")!;
  // Ödeme kaydı ancak satıcı siparişi KABUL edince açılır (banka hesabı zorunlu).
  const sellerTry = await apiSession(QA.tedarikci2Kurucu);
  const bank = await apiPost(sellerTry, "/company/bank-accounts", {
    title: `QA Para TL ${stamp}`,
    accountHolder: "QA Tedarikçi 2 A.Ş.",
    iban: "TR330006100519786457841326",
    bankName: "QA Bank",
    isDefault: true,
  });
  expect(bank.status, JSON.stringify(bank.body)).toBeLessThan(300);
  const accept = await apiPost(sellerTry, `/company/orders/${tryOrder.id}/accept`, { bankAccountId: bank.body.id });
  expect(accept.status, JSON.stringify(accept.body)).toBeLessThan(300);

  const orderDetail = await apiGet(buyer, `/company/orders/${tryOrder.id}`);
  const total = Number(orderDetail.body.amount);
  expect(Number(orderDetail.body.paymentTotals.remaining), "başlangıçta kalan = tutar").toBeCloseTo(total, 2);
  expect(total, "sipariş tutarı").toBeGreaterThan(0);

  const over = await apiPost(buyer, `/company/orders/${tryOrder.id}/payments`, { amount: total + 1, method: "EFT" });
  expect(over.status, "kalan tutarı aşan ödeme").toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(over.body)).toContain("aşan ödeme kaydedilemez");

  const zero = await apiPost(buyer, `/company/orders/${tryOrder.id}/payments`, { amount: 0, method: "EFT" });
  expect(zero.status, "sıfır tutar").toBeGreaterThanOrEqual(400);

  const half = Math.floor(total / 2);
  const first = await apiPost(buyer, `/company/orders/${tryOrder.id}/payments`, { amount: half, method: "EFT" });
  expect(first.status, JSON.stringify(first.body)).toBeLessThan(300);

  // Kısmi ödemeden SONRA kalanı aşan ikinci ödeme yine reddedilir.
  const overAgain = await apiPost(buyer, `/company/orders/${tryOrder.id}/payments`, { amount: total - half + 1, method: "EFT" });
  expect(overAgain.status, "kısmi ödemeden sonra kalan tavanı").toBeGreaterThanOrEqual(400);

  const rest = await apiPost(buyer, `/company/orders/${tryOrder.id}/payments`, { amount: total - half, method: "EFT" });
  expect(rest.status, JSON.stringify(rest.body)).toBeLessThan(300);

  // Satıcı onaylayınca ödeme tamamlanır; toplam TAM tutarı geçmez.
  const seller = tryOrder;
  const sellerSession = sellerTry;
  const detailAfter = await apiGet(buyer, `/company/orders/${seller.id}`);
  const payments = (detailAfter.body.payments ?? []) as Array<{ id: string; status: string; amount: string }>;
  expect(payments.length, "iki ödeme kaydı").toBeGreaterThanOrEqual(2);
  for (const p of payments.filter((x) => x.status !== "CONFIRMED")) {
    const ok = await apiPost(sellerSession, `/company/orders/${seller.id}/payments/${p.id}/confirm`);
    expect(ok.status, JSON.stringify(ok.body)).toBeLessThan(300);
  }
  const final = await apiGet(buyer, `/company/orders/${seller.id}`);
  expect(Number(final.body.paymentTotals.confirmed), "onaylanan toplam = sipariş tutarı").toBeCloseTo(total, 2);
  expect(Number(final.body.paymentTotals.remaining), "kalan sıfırlanır").toBeCloseTo(0, 2);
  expect(final.body.paymentSettled, "ödeme kapandı").toBe(true);
});
