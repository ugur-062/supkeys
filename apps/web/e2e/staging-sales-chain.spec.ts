import { expect, request, test } from "@playwright/test";
import {
  QA,
  PNG_1x1,
  adminApiSession,
  adminContext,
  adminOpen,
  apiGet,
  apiPatch,
  apiPost,
  apiSession,
  openAs,
} from "./staging-helpers";

/**
 * PARÇA 4 — SATIŞ ZİNCİRİ (staging, QA hesapları).
 *
 * Ürün (API: görsel R2'ye presigned PUT + resolve, tek çağrıda kayıt) →
 * onaya gönder → Ürünlerim'de "Onay bekliyor" (tarayıcı) → admin kuyruğu
 * (admin tarayıcı) → "Onayla ve yayınla" → herkese açık ürün sayfası →
 * üye alıcı "Bilgi iste" (tarayıcı) → satıcı yanıtlar (tarayıcı) →
 * yayındaki ürünü düzenle → yeniden PENDING ama vitrinde kalır → admin
 * yeniden onaylar (API, temizlik).
 */

const CATEGORY = "10101500";
const LONG_DESC =
  "QA otomasyon ürünü: dikişsiz çelik boru, 2 inç, ST37 kalite, 6 metre boy. Endüstriyel tesisat ve yapı işlerinde kullanılır; " +
  "paletli teslim edilir, sertifikalı üretimdir. Staging ortamı test kaydı.";

test.describe("satış zinciri", () => {
test.describe.configure({ mode: "serial" });
test("ürün → onaya gönder → admin onayı → vitrin → bilgi talebi → yanıt → düzenleme yeniden incelemeye düşer", async ({ browser, page }) => {
  test.setTimeout(420_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const productName = `QA Çelik Boru ${stamp}`;
  const actor = async () => (await browser.newContext()).newPage();

  // ── Satıcı kurulumu (API): herkese açık profil (slug üretilir) ─────────
  const seller = await apiSession(QA.tedarikciKurucu);
  const prof = await apiPatch(seller, "/company/profile", { publicEnabled: true });
  expect(prof.status, JSON.stringify(prof.body)).toBeLessThan(300);
  const profile = await apiGet(seller, "/company/profile");
  const companySlug: string = profile.body?.slug;
  expect(companySlug, "firma slug'ı (herkese açık profil)").toBeTruthy();

  // Görsel: presigned PUT → R2 → resolve (gerçek MIME + boyut doğrulanır).
  const up = await apiPost(seller, "/company/items/images/upload-url", { fileName: "qa-urun.png", mimeType: "image/png" });
  expect(up.status, JSON.stringify(up.body)).toBeLessThan(300);
  const raw = await request.newContext();
  const put = await raw.put(up.body.url, { data: PNG_1x1, headers: { "Content-Type": "image/png" } });
  expect(put.status(), "R2 PUT").toBeLessThan(300);
  await raw.dispose();
  const resolved = await apiPost(seller, "/company/items/images/resolve", { key: up.body.key });
  expect(resolved.status, JSON.stringify(resolved.body)).toBeLessThan(300);
  const imageUrl: string = resolved.body.url;
  expect(imageUrl).toMatch(/^https?:\/\//);

  // Ürün: tek çağrıda kayıt + vitrin alanları; taslak doğar, engel kalmamalı.
  const created = await apiPost(seller, "/company/items/product", {
    name: productName,
    categoryId: CATEGORY,
    description: LONG_DESC,
    images: [imageUrl],
    keywords: ["çelik boru", "dikişsiz boru"],
    priceMode: "FIXED",
    priceAmount: 250,
    priceCurrency: "TRY",
    moq: 10,
    unit: "m",
  });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const productId: string = created.body.id;
  expect(created.body.publishBlockers ?? [], "yayın engelleri").toEqual([]);

  // Onaya gönder (publish = onaya gönder).
  const pub = await apiPost(seller, `/company/items/${productId}/publish`);
  expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300);
  const show1 = await apiGet(seller, `/company/items/${productId}/showcase`);
  expect(show1.body?.reviewStatus).toBe("PENDING");
  expect(show1.body?.isPublic).toBe(false);
  const productSlug: string = show1.body?.slug;
  expect(productSlug, "ürün slug'ı").toBeTruthy();

  // Satıcı tarayıcıda: Ürünlerim → "Onay bekliyor".
  let actorPage = await actor();
  await openAs(actorPage, QA.tedarikciKurucu, "/company/satis/urunlerim");
  await expect(actorPage.getByText(productName).first()).toBeVisible({ timeout: 30_000 });
  await expect(actorPage.getByText("Onay bekliyor").first()).toBeVisible();
  // İnceleme kilidi: içerik değişikliği 409.
  const locked = await apiPatch(seller, `/company/items/${productId}/showcase`, { description: LONG_DESC + " (değişti)" });
  expect(locked.status, "PENDING ürün düzenlenemez").toBe(409);
  await actorPage.context().close();

  // ── Admin: kuyrukta görünür (API) → tarayıcıda onayla ─────────────────
  const admin = await adminApiSession();
  const queue = await apiGet(admin, `/admin/products?status=PENDING&q=${encodeURIComponent(productName)}`);
  expect(queue.status, JSON.stringify(queue.body)).toBe(200);
  const rows = (queue.body?.items ?? queue.body?.data ?? queue.body ?? []) as Array<{ id: string }>;
  expect(rows.some((r) => r.id === productId), "admin PENDING kuyruğunda ürün").toBe(true);

  const adminCtx = await adminContext(browser);
  const adminPage = await adminCtx.newPage();
  await adminOpen(adminPage, "/admin/urunler");
  await expect(adminPage.getByText(productName).first()).toBeVisible({ timeout: 30_000 });
  await adminPage.getByRole("link", { name: productName }).first().click();
  await adminPage.waitForURL(new RegExp(`/admin/urunler/${productId}`), { timeout: 30_000 });
  await adminPage.getByRole("button", { name: "Onayla ve yayınla" }).click();
  await expect(adminPage.getByText("Ürün onaylandı ve yayına alındı")).toBeVisible({ timeout: 30_000 });
  await adminCtx.close();

  const show2 = await apiGet(seller, `/company/items/${productId}/showcase`);
  expect(show2.body?.reviewStatus).toBe("APPROVED");
  expect(show2.body?.isPublic).toBe(true);

  // ── Herkese açık ürün sayfası (ziyaretçi, giriş yok) ──────────────────
  const publicPath = `/firma/${companySlug}/urun/${productSlug}`;
  const res = await page.goto(publicPath, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `public ${publicPath}`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(productName, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Bilgi iste/ }).first()).toBeVisible();

  // ── Üye alıcı: panel ürün sayfası → Bilgi iste → gönder ───────────────
  actorPage = await actor();
  await openAs(actorPage, QA.aliciKurucu, `/company/satinalma/urunler/${companySlug}/${productSlug}`);
  await expect(actorPage.getByRole("heading", { level: 1 })).toContainText(productName, { timeout: 30_000 });
  // Fiyat kartındaki ana CTA "Bilgi / Teklif İste"; "Bilgi iste" yapışkan çubukta (kaydırınca).
  await actorPage.getByRole("button", { name: /Bilgi \/ Teklif İste|Bilgi iste/ }).first().click();
  await actorPage.locator("#pinq-quantity").fill("500 m");
  await actorPage.locator("#pinq-message").fill(`QA bilgi talebi ${stamp}: 500 metre için teslim süresi ve toplam fiyat nedir?`);
  await actorPage.getByRole("button", { name: "Talebi gönder" }).click();
  await expect(actorPage.getByText("Talebiniz gönderildi")).toBeVisible({ timeout: 30_000 });
  await actorPage.context().close();

  // Alıcı tarafında "gönderdiklerim" listesinde (API).
  const buyer = await apiSession(QA.aliciKurucu);
  const sent = await apiGet(buyer, "/company/inquiries/sent");
  expect(sent.status).toBe(200);
  const sentRows = (sent.body?.items ?? sent.body ?? []) as Array<{ id: string; product?: { name?: string } }>;
  const inquiry = sentRows.find((r) => r.product?.name === productName);
  expect(inquiry, "gönderilen bilgi talebi").toBeTruthy();

  // ── Satıcı: gelen bilgi talebi → yanıtla (tarayıcı) ───────────────────
  actorPage = await actor();
  await openAs(actorPage, QA.tedarikciKurucu, "/company/satis/bilgi-talepleri");
  await expect(actorPage.getByText(productName).first()).toBeVisible({ timeout: 30_000 });
  const replyBox = actorPage.getByPlaceholder("Yanıtınızı yazın…");
  if (!(await replyBox.isVisible().catch(() => false))) {
    await actorPage.getByText(productName).first().click();
  }
  await expect(replyBox).toBeVisible({ timeout: 15_000 });
  await replyBox.fill(`QA yanıt ${stamp}: 500 m için teslim 10 iş günü, birim 245 TL.`);
  await actorPage.getByRole("button", { name: "Yanıtla" }).click();
  await expect(actorPage.getByText("Yanıtınız gönderildi")).toBeVisible({ timeout: 30_000 });
  await expect(actorPage.getByText("Yanıtlandı").first()).toBeVisible({ timeout: 15_000 });
  await actorPage.context().close();

  const received = await apiGet(seller, "/company/inquiries/received");
  const recRows = (received.body?.items ?? received.body ?? []) as Array<{ id: string; anonymous: boolean; replies?: unknown[] }>;
  const mine = recRows.find((r) => r.id === inquiry!.id);
  expect(mine, "satıcıda gelen talep").toBeTruthy();
  expect(mine!.anonymous, "Silver satıcı alıcının kimliğini görür").toBe(false);
  expect((mine!.replies ?? []).length, "yanıt kaydı").toBeGreaterThan(0);

  // ── Yayındaki ürünü düzenle → yeniden PENDING, vitrinde KALIR ─────────
  const edit = await apiPatch(seller, `/company/items/${productId}/showcase`, { description: LONG_DESC + " Güncellenmiş açıklama." });
  expect(edit.status, JSON.stringify(edit.body)).toBeLessThan(300);
  const show3 = await apiGet(seller, `/company/items/${productId}/showcase`);
  expect(show3.body?.reviewStatus).toBe("PENDING");
  expect(show3.body?.isPublic, "yayındaki ürün düzenlenince vitrinde kalır").toBe(true);
  const res2 = await page.goto(publicPath, { waitUntil: "domcontentloaded" });
  expect(res2?.status(), "vitrinde kalır").toBe(200);

  // Temizlik: admin yeniden onaylar (API) — önceki yarım koşumlardan kalan QA ürünleri dahil.
  const reapprove = await apiPost(admin, `/admin/products/${productId}/approve`);
  expect(reapprove.status, JSON.stringify(reapprove.body)).toBeLessThan(300);
  const leftovers = await apiGet(admin, `/admin/products?status=PENDING&q=${encodeURIComponent("QA Çelik Boru")}`);
  for (const r of (leftovers.body?.items ?? []) as Array<{ id: string }>) await apiPost(admin, `/admin/products/${r.id}/approve`);
});
});

test("Satış anasayfası: 'Firma' pili firma listesini açar (satınalma dizinine göndermez)", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await openAs(page, QA.tedarikciSatisci, "/company/satis");
  const firma = page.getByRole("button", { name: /^Firma$/ }).first();
  await expect(firma).toBeVisible({ timeout: 30_000 });
  await firma.click();
  await expect(firma).toHaveAttribute("aria-pressed", "true");
  // Liste aynı sayfada; satınalma dizinine yönlendirme YOK.
  await expect(page).toHaveURL(/\/company\/satis(\?|$)/);
  const region = page.getByRole("region", { name: "Firmalar" });
  await expect(region.getByRole("heading", { name: "Firmalar" })).toBeVisible({ timeout: 30_000 });
  await expect(region.getByRole("link", { name: /Portföyü görüntüle/ }).first()).toBeVisible();
  await page.context().close();
});
