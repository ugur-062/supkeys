import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow, openAs } from "./staging-helpers";

/**
 * ÇOK TEDARİKÇİLİ TEKLİF — "başka hesaplardan teklif verilmeli" turu.
 *
 * Alıcı PUBLIC talep açar; İKİ AYRI tedarikçi firması tarayıcıdan teklif verir.
 * Ardından kuralların hepsi tek tek doğrulanır:
 *   · kapalı zarf: tedarikçi rakibin teklifini ne API'de ne ekranda görür
 *   · ücretsiz (STANDART) firma PUBLIC talebi hiç göremez (403 TIER_REQUIRED)
 *   · görüntüleyici teklif veremez (düğme yok + API 403)
 *   · onaylayıcı talebi göremez (dar bağlam)
 *   · alıcı iki teklifi de görür
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500";
const FORBIDDEN_FOR_BIDDER = ["bids", "bidStats", "invitations"];

test("iki ayrı tedarikçi teklif verir; kapalı zarf, paket ve rol kapıları", async ({ browser }) => {
  test.setTimeout(600_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const actor = async () => (await browser.newContext()).newPage();

  // ── Alıcı: talebi SATIN ALMACI rolüyle açar (kurucu değil) ─────────────
  const buyer = await apiSession(QA.aliciSatinalmaci);
  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT",
    title: `QA Teklif Depo ${stamp}`,
    addressLine: "Organize Sanayi 2. Cadde No 7",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  expect(addr.status, JSON.stringify(addr.body)).toBeLessThan(300);
  const listing = await apiPost(buyer, "/company/listings", {
    type: "ALIM",
    format: "RFQ",
    title: `QA Çok Teklifli Alım ${stamp}`,
    description: "İki tedarikçinin teklif verdiği QA talebi — staging.",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(7),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [
      { name: "Çelik Profil 40x40", quantity: 200, unit: "m" },
      { name: "Köşebent", quantity: 60, unit: "adet" },
    ],
  });
  expect(listing.status, JSON.stringify(listing.body)).toBeLessThan(300);
  const id: string = listing.body.id;
  if (listing.body.status === "DRAFT") {
    const pub = await apiPost(buyer, `/company/listings/${id}/publish`);
    expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300);
  }

  // ── Tedarikçi 1 (satışçı rolü) tarayıcıdan teklif verir ────────────────
  const bid = async (email: string, base: number) => {
    const page = await actor();
    await openAs(page, email, `/company/ilan/${id}`);
    const cta = page.getByRole("link", { name: /^Teklif Ver$/ }).first();
    await expect(cta, `${email}: Teklif Ver düğmesi`).toBeVisible({ timeout: 30_000 });
    await cta.click();
    await page.waitForURL(/\/teklif-ver/);
    const prices = page.getByLabel("Birim Fiyat");
    await expect(prices.first()).toBeVisible({ timeout: 30_000 });
    const n = await prices.count();
    for (let i = 0; i < n; i++) await prices.nth(i).fill(String(base + i * 10));
    const validity = page.getByLabel(/Geçerlilik Süresi/);
    if ((await validity.count()) > 0 && !(await validity.first().inputValue())) await validity.first().fill("30");
    // Teslim süresi zorunlu: kalemler "Genel süre geçerli" diyor, genel süre boşsa
    // "Teklif Gönder" pasif kalıyor (form kuralı, hata değil).
    const delivery = page.getByLabel("Genel teslim süresi");
    if ((await delivery.count()) > 0) await delivery.first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Teklifi? Gönder$/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Teklifi Gönder" }).click();
    await expect(page.locator("body")).toContainText(/Teklifiniz alındı/i, { timeout: 30_000 });
    return page;
  };

  const p1 = await bid(QA.tedarikciSatisci, 150);
  await p1.context().close();
  const p2 = await bid(QA.tedarikci2Satisci, 130);

  // ── KAPALI ZARF: tedarikçi 2 rakibin teklifini görmemeli ───────────────
  const body = await p2.locator("body").innerText();
  expect(body, "rakip firma adı ekranda").not.toContain("QA Tedarikçi Ltd. Şti.");
  expect(body, "rakip birim fiyatı ekranda").not.toMatch(/\b150\b/);
  await p2.context().close();

  const s2 = await apiSession(QA.tedarikci2Satisci);
  const asBidder = await apiGet(s2, `/company/listings/${id}`);
  expect(asBidder.status).toBe(200);
  const keys = new Set<string>();
  (function walk(v: unknown) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        keys.add(k);
        walk(val);
      }
    }
  })(asBidder.body);
  for (const k of FORBIDDEN_FOR_BIDDER) expect([...keys], `teklifçi yanıtında "${k}" alanı`).not.toContain(k);
  // Kendi teklifini görebilmeli (myBid / kendi versiyonu).
  expect(JSON.stringify(asBidder.body)).toMatch(/130|myBid|ownBid/);

  // ── ÜCRETSİZ (STANDART): PUBLIC talep kilitli ─────────────────────────
  const free = await apiSession(QA.ucretsizKurucu);
  const asFree = await apiGet(free, `/company/listings/${id}`);
  expect(asFree.status, "STANDART PUBLIC talep detayı").toBe(403);
  expect(JSON.stringify(asFree.body)).toContain("TIER_REQUIRED");
  const freeList = await apiGet(free, "/company/listings/seller-tenders");
  expect(JSON.stringify(freeList.body ?? ""), "kilitli talep listeye sızmamalı").not.toContain(id);

  // ── GÖRÜNTÜLEYİCİ: teklif veremez ────────────────────────────────────
  const viewer = await apiSession(QA.tedarikciGoruntuleyici);
  const viewerBid = await apiPost(viewer, `/company/listings/${id}/bids`, { items: [] });
  expect(viewerBid.status, "görüntüleyici teklif POST").toBe(403);
  const vp = await actor();
  await openAs(vp, QA.tedarikciGoruntuleyici, `/company/ilan/${id}`);
  await expect(vp.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await expect(vp.getByRole("link", { name: /^Teklif Ver$/ }), "görüntüleyicide Teklif Ver").toHaveCount(0);
  await vp.context().close();

  // ── ONAYLAYICI: talebi göremez (Faz O dar bağlam) ────────────────────
  const approver = await apiSession(QA.aliciOnaylayici);
  const asApprover = await apiGet(approver, `/company/listings/${id}`);
  expect(asApprover.status, "onaylayıcı talep detayı").toBe(403);

  // ── ALICI: iki teklifi de görür, kapalı zarf onda AÇIK ───────────────
  const owner = await apiGet(buyer, `/company/listings/${id}`);
  expect(owner.status).toBe(200);
  const bids = (owner.body.bids ?? []) as Array<{ bidderName?: string; amount?: string; bidderVerified?: boolean }>;
  expect(bids.length, "alıcıda teklif sayısı").toBe(2);
  const names = bids.map((b) => b.bidderName ?? "").sort();
  expect(names, "alıcı iki tedarikçiyi de görür").toEqual(["QA Tedarikçi 2 A.Ş.", "QA Tedarikçi Ltd. Şti."]);
  expect(bids.every((b) => b.bidderVerified), "her iki teklifçi doğrulanmış").toBe(true);
  // Ucuz olan tedarikçi2 (130 taban) — alıcı karşılaştırabilmeli.
  const amounts = bids.map((b) => Number(b.amount));
  expect(Math.min(...amounts)).toBeLessThan(Math.max(...amounts));
  const op = await actor();
  await openAs(op, QA.aliciSatinalmaci, `/company/ilan/${id}`);
  await expect(op.locator("body")).toContainText(/2 teklif|Teklifler \(2\)|2 Teklif/i, { timeout: 30_000 });
  await op.context().close();
});
