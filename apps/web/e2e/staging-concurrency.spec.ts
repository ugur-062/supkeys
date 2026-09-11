import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow } from "./staging-helpers";

/**
 * EŞZAMANLILIK (2026-09-12) — çift tıklama ve yarış durumları.
 *
 * Arayüz düğmeyi pasifleştiriyor ama sunucu tek doğruluk kaynağıdır: aynı anda
 * gelen iki istek TEK sonuç üretmeli. Burada istekler bilerek AYNI ANDA
 * gönderilir (Promise.all).
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500";
const okCount = (rows: Array<{ status: number }>) => rows.filter((r) => r.status < 300).length;

test("aynı anda iki kazandırma → tek sipariş", async () => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const buyer = await apiSession(QA.aliciSatinalmaci);
  const seller = await apiSession(QA.tedarikciSatisci);

  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT", title: `QA Yarış ${stamp}`, addressLine: "Sanayi Cad. No 1",
    city: "İstanbul", district: "Tuzla", country: "TR",
  });
  const listing = await apiPost(buyer, "/company/listings", {
    type: "ALIM", format: "RFQ", title: `QA Yarış Talebi ${stamp}`,
    description: "Eşzamanlı kazandırma denemesi — QA.",
    visibility: "PUBLIC", categoryIds: [CATEGORY], deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(5), primaryCurrency: "TRY", allowedCurrencies: ["TRY"],
    items: [{ name: "Yarış Kalemi", quantity: 10, unit: "adet" }],
  });
  const id: string = listing.body.id;
  if (listing.body.status === "DRAFT") await apiPost(buyer, `/company/listings/${id}/publish`);
  const items = (await apiGet(buyer, `/company/listings/${id}`)).body.items as Array<{ id: string }>;
  const bid = await apiPost(seller, `/company/listings/${id}/bids`, {
    items: [{ itemId: items[0]!.id, unitPrice: 100 }], currency: "TRY", deliveryTime: "W1_2", validityDays: 30,
  });
  const bidId: string = bid.body.id;

  const results = await Promise.all([
    apiPost(buyer, `/company/listings/${id}/award`, { bidId }),
    apiPost(buyer, `/company/listings/${id}/award`, { bidId }),
  ]);
  expect(okCount(results), `iki kazandırmadan biri geçmeli: ${JSON.stringify(results.map((r) => r.status))}`).toBe(1);

  const orders = (await apiGet(buyer, "/company/orders")).body as Array<{ listingId: string | null }>;
  expect(orders.filter((o) => o.listingId === id), "tek sipariş").toHaveLength(1);
});

test("aynı anda iki sipariş kabulü → tek kabul", async () => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const buyer = await apiSession(QA.aliciSatinalmaci);
  const seller = await apiSession(QA.tedarikciKurucu);

  const orders = (await apiGet(seller, "/company/orders")).body as Array<{ id: string; status: string }>;
  const pending = orders.find((o) => o.status === "PENDING");
  test.skip(!pending, "kabul bekleyen sipariş yok");

  const bank = await apiPost(seller, "/company/bank-accounts", {
    title: `QA Yarış TL ${stamp}`, accountHolder: "QA Tedarikçi Ltd. Şti.",
    iban: "TR330006100519786457841326", bankName: "QA Bank", isDefault: false,
  });
  const bankAccountId = bank.body.id;
  const results = await Promise.all([
    apiPost(seller, `/company/orders/${pending!.id}/accept`, { bankAccountId }),
    apiPost(seller, `/company/orders/${pending!.id}/accept`, { bankAccountId }),
  ]);
  expect(okCount(results), `iki kabulden biri geçmeli: ${JSON.stringify(results.map((r) => r.status))}`).toBe(1);
});

test("ücretsiz paket ürün tavanı: aynı anda gönderilen istekler tavanı AŞAMAZ", async () => {
  test.setTimeout(420_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const free = await apiSession(QA.ucretsizKurucu);
  const LIMIT = 10;

  // Mevcut kuyruğu boşalt: yayında/onayda olanları taslağa çek.
  const mine = (await apiGet(free, "/company/items?limit=100")).body as { items?: Array<{ id: string; isPublic: boolean; reviewStatus: string }> } | Array<{ id: string; isPublic: boolean; reviewStatus: string }>;
  const rows = Array.isArray(mine) ? mine : (mine.items ?? []);
  for (const r of rows.filter((x) => x.isPublic || x.reviewStatus === "PENDING")) {
    await apiPost(free, `/company/items/${r.id}/unpublish`);
  }

  // Tavana kadar doldur (tavanın 1 eksiği), sonra AYNI ANDA iki gönderim yap.
  const made: string[] = [];
  for (let i = 0; i < LIMIT + 1; i++) {
    const p = await apiPost(free, "/company/items/product", {
      name: `QA Tavan ${stamp}-${i}`,
      categoryId: CATEGORY,
      description: "Ücretsiz paket ürün tavanı yarışını sınayan QA kaydı; en az yüz karakter olsun diye açıklama uzatıldı.",
      keywords: ["qa", "tavan"],
      images: ["https://cdn.staging.rothern.com/qa/placeholder.png"],
      unit: "adet",
    });
    expect(p.status, JSON.stringify(p.body)).toBeLessThan(300);
    made.push(p.body.id);
  }
  for (let i = 0; i < LIMIT - 1; i++) {
    const r = await apiPost(free, `/company/items/${made[i]!}/publish`);
    expect(r.status, `${i}. yayın: ${JSON.stringify(r.body)}`).toBeLessThan(300);
  }

  // Sırada 1 boş yer var; İKİ istek aynı anda gelirse yalnız BİRİ geçmeli.
  const race = await Promise.all([
    apiPost(free, `/company/items/${made[LIMIT - 1]!}/publish`),
    apiPost(free, `/company/items/${made[LIMIT]!}/publish`),
  ]);
  expect(okCount(race), `tavan yarışı: ${JSON.stringify(race.map((r) => r.status))}`).toBe(1);

  const after = (await apiGet(free, "/company/items?limit=100")).body as { items?: Array<{ isPublic: boolean; reviewStatus: string }> } | Array<{ isPublic: boolean; reviewStatus: string }>;
  const afterRows = Array.isArray(after) ? after : (after.items ?? []);
  const occupied = afterRows.filter((x) => x.isPublic || x.reviewStatus === "PENDING").length;
  expect(occupied, "yayında + onayda toplam tavanı aşmamalı").toBeLessThanOrEqual(LIMIT);
});
