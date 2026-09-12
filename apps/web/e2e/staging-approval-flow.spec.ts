import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow, openAs } from "./staging-helpers";

/**
 * ONAY AKIŞI + ONAYLAYICININ DAR BAĞLAMI (Faz O).
 *
 * Kurucu bir kazandırma onayı akışı tanımlar (approvals:manage + GOLD),
 * satın almacı talebi kazandırır → sipariş DEĞİL, onay isteği doğar.
 * Onaylayıcı yalnız KARAR BAĞLAMINI görür: kazanan firma + tutar; tedarikçi
 * iletişim/adres bilgisi ve talebin kendisi ONA KAPALI. Onaydan sonra sipariş.
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500";
const LEAK_KEYS = ["email", "phone", "iban", "addressLine", "contactEmail", "contactPhone"];

test("kazandırma onaya düşer; onaylayıcı dar bağlamı görür ve onaylayınca sipariş oluşur", async ({ browser }) => {
  test.setTimeout(600_000);
  const stamp = Date.now().toString(36).toUpperCase();

  const owner = await apiSession(QA.aliciKurucu);
  const buyer = await apiSession(QA.aliciSatinalmaci);
  const approver = await apiSession(QA.aliciOnaylayici);
  const supplier = await apiSession(QA.tedarikciSatisci);

  const approverMe = await apiGet(approver, "/company-auth/me");
  const approverId: string = approverMe.body.user.id;

  // ── Akış tanımı (yalnız approvals:manage) ───────────────────────────
  const denied = await apiPost(buyer, "/company/approvals/flows", {
    name: `QA Yetkisiz Akış ${stamp}`,
    type: "LISTING_AWARD",
    steps: [{ approverUserId: approverId }],
  });
  expect(denied.status, "satın almacı akış tanımlayamaz").toBe(403);

  let flowId = "";
  try {
  const flow = await apiPost(owner, "/company/approvals/flows", {
    name: `QA Kazandırma Onayı ${stamp}`,
    type: "LISTING_AWARD",
    listingType: "ALIM",
    steps: [{ approverUserId: approverId }],
  });
  expect(flow.status, JSON.stringify(flow.body)).toBeLessThan(300);
  flowId = flow.body.id;
  // Taslak doğuyorsa etkinleştir.
  if ((flow.body.status ?? "DRAFT") !== "ACTIVE") {
    const s = owner;
    const act = await s.ctx.patch(`company/approvals/flows/${flowId}/status`, {
      data: { status: "ACTIVE" },
      headers: { "X-CSRF-Token": s.csrf },
    });
    expect(act.status(), `akış etkinleştirme ${await act.text()}`).toBeLessThan(300);
  }

  // ── Talep + teklif ──────────────────────────────────────────────────
  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT",
    title: `QA Onay Depo ${stamp}`,
    addressLine: "Organize Sanayi 5. Cadde No 13",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  const listing = await apiPost(buyer, "/company/listings", {
    type: "ALIM",
    format: "RFQ",
    title: `QA Onaylı Kazandırma ${stamp}`,
    description: "Kazandırması onay akışına düşen QA talebi — staging.",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(5),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [{ name: "Onaylı Kalem", quantity: 50, unit: "adet" }],
  });
  expect(listing.status, JSON.stringify(listing.body)).toBeLessThan(300);
  const listingId: string = listing.body.id;
  if (listing.body.status === "DRAFT") await apiPost(buyer, `/company/listings/${listingId}/publish`);
  const detail = await apiGet(buyer, `/company/listings/${listingId}`);
  const itemId: string = (detail.body.items as Array<{ id: string }>)[0]!.id;

  const bid = await apiPost(supplier, `/company/listings/${listingId}/bids`, {
    items: [{ itemId, unitPrice: 200 }],
    deliveryTime: "W1_2",
    validityDays: 30,
    currency: "TRY",
  });
  expect(bid.status, JSON.stringify(bid.body)).toBeLessThan(300);
  const bidId: string = bid.body.id ?? bid.body.bid?.id;

  // ── Kazandırma → sipariş DEĞİL, onay isteği ─────────────────────────
  const award = await apiPost(buyer, `/company/listings/${listingId}/award`, { bidId });
  expect(award.status, JSON.stringify(award.body)).toBeLessThan(300);
  const afterAward = await apiGet(buyer, `/company/listings/${listingId}`);
  expect(afterAward.body.status, "kazandırma onaya gitti").toBe("IN_AWARD_APPROVAL");

  // ── Onaylayıcı: yalnız karar bağlamı ───────────────────────────────
  const pending = await apiGet(approver, "/company/approvals/pending");
  expect(pending.status).toBe(200);
  const rows = (pending.body as Array<{ id: string; listingId?: string }>) ?? [];
  const req = rows.find((r) => r.listingId === listingId) ?? rows[0];
  expect(req, "onaylayıcının sırasındaki istek").toBeTruthy();

  const ctx = await apiGet(approver, `/company/approvals/${req!.id}`);
  expect(ctx.status).toBe(200);
  const raw = JSON.stringify(ctx.body);
  expect(raw, "kazanan firma adı karar için gerekli").toContain("QA Tedarikçi");
  for (const k of LEAK_KEYS) {
    expect(raw, `onay projeksiyonunda "${k}" alanı sızıyor`).not.toContain(`"${k}"`);
  }
  // Talebin kendisi onaylayıcıya KAPALI (dar bağlam).
  expect((await apiGet(approver, `/company/listings/${listingId}`)).status, "onaylayıcı talep detayı").toBe(403);

  // ── Onaylayıcı tarayıcıdan onaylar ─────────────────────────────────
  const page = await (await browser.newContext()).newPage();
  await openAs(page, QA.aliciOnaylayici, "/company/onaylar");
  await expect(page.getByText(`QA Onaylı Kazandırma ${stamp}`).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Onayla$/ }).first().click();
  const dialogConfirm = page.getByRole("button", { name: /Onayla|Evet/ }).last();
  if (await dialogConfirm.isVisible().catch(() => false)) await dialogConfirm.click();
  await expect(page.locator("body")).toContainText(/onaylandı|Onaylandı/, { timeout: 30_000 });
  await page.context().close();

  // ── Onay sonrası sipariş ───────────────────────────────────────────
  const closed = await apiGet(buyer, `/company/listings/${listingId}`);
  expect(["AWARDED", "IN_AWARD"], `onay sonrası durum ${closed.body.status}`).toContain(closed.body.status);
  const orders = await apiGet(buyer, "/company/orders");
  const order = (orders.body as Array<{ listingId: string | null }>).find((o) => o.listingId === listingId);
  expect(order, "onay sonrası sipariş").toBeTruthy();
  } finally {
    // TEMİZLİK ŞART: aktif LISTING_AWARD akışı kalırsa sipariş zinciri ve
    // teklif turları da onaya düşer, sonraki koşumlar kırılır.
    if (flowId) {
      await owner.ctx
        .patch(`company/approvals/flows/${flowId}/status`, {
          data: { status: "PASSIVE" },
          headers: { "X-CSRF-Token": owner.csrf },
        })
        .catch(() => undefined);
    }
  }
});
