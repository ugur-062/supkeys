import { expect, test } from "@playwright/test";
import { PASSWORD, QA, apiGet, apiPost, apiSession, daysFromNow, gotoRetry } from "./staging-helpers";
import { cleanupSignup, closeDb, db } from "./db-helpers";
import { dogrulamaKodu, kayitFormu } from "./signup-flow";

/**
 * GÖRÜNÜRLÜK ÜLKESİ — YABANCI TEDARİKÇİ GÖZÜYLE (2026-09-21, kullanıcı:
 * "tarayıcıdan doğrula, staging'te yurtdışı hesap oluştur ve dene").
 *
 * BAE'de kayıtlı yeni bir firma (kayıt → kod → onboarding, ülke AE; AB kayıt kapısında
 * KAPALI olduğu için Almanya seçilemez). Silver'a çekilir (ücretsiz paket PUBLIC talepleri hiç görmez — ayrı kural).
 * TR'deki alıcı üç talep açar: tüm ülkeler · yalnız BAE · yalnız Türkiye.
 * BAE tedarikçisi tarayıcıda ilk ikisini görür ve açar; üçüncüsü listede
 * yoktur ve adresten açılınca "bulunamadı" der. Sonunda hepsi silinir.
 */
const stamp = Date.now().toString(36).toUpperCase();
const EMAIL = `uguray156+qa-ae-${stamp.toLowerCase()}@gmail.com`;
const CATEGORY = "31161500";
const ids: string[] = [];

test.afterAll(async () => {
  if (ids.length) await db().listing.deleteMany({ where: { id: { in: ids } } });
  await cleanupSignup(EMAIL);
  await cleanupSignup("uguray156+qa-de-probe@gmail.com");
  await closeDb();
});

test("BAE'deki tedarikçi: tüm-ülkeler ve yalnız-AE talebini görür, yalnız-TR talebini görmez", async ({ page }) => {
  test.setTimeout(420_000);

  // ── 1. BAE firma kaydı (tarayıcı) ─────────────────────────────────
  page.on("response", async (r) => {
    if (/company-auth\/(signup|verify)/.test(r.url())) console.log("signup yanıtı:", r.status(), (await r.text().catch(() => "")).slice(0, 200));
  });
  await kayitFormu(page, { email: EMAIL, sifre: PASSWORD, ad: "Omar", soyad: `Gulf ${stamp}` });
  await dogrulamaKodu(page, EMAIL);
  await expect(page.getByText("Şirket Bilgileri")).toBeVisible({ timeout: 60_000 });
  // Kayıt kapısı 8 ülke (AB kapalı): Birleşik Arap Emirlikleri'ni taşıyan ilk native select.
  const ulke = page.locator("select").filter({ has: page.locator('option[value="AE"]') }).first();
  await ulke.selectOption("AE");
  await page.waitForTimeout(300);
  await page.getByLabel(/Firma Unvanı/).fill(`QA Gulf Supplier ${stamp} LLC`);
  await page.getByLabel(/Firma Türü/).selectOption({ index: 1 });
  await page.getByLabel(/Vergi \/ Sicil No/).first().fill("TRN-100234567890003");
  const sehir = page.getByLabel(/^Şehir \*/).first();
  const tag = await sehir.evaluate((el) => el.tagName);
  if (tag === "SELECT") await sehir.selectOption({ index: 1 });
  else await sehir.fill("Dubai");
  await page.getByLabel(/Açık Adres/).first().fill("Jebel Ali Free Zone, Warehouse 12, Dubai");
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByText("Kişisel Bilgiler")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Ürün \/ hizmet (seçin|ekle)/ }).first().click();
  const kategoriAra = page.getByPlaceholder(/Kategori ara/);
  await expect(kategoriAra).toBeVisible({ timeout: 15_000 });
  await kategoriAra.fill("Vida");
  const ilkKutu = page.getByRole("dialog").getByRole("checkbox").first();
  await expect(ilkKutu).toBeVisible({ timeout: 15_000 });
  await ilkKutu.click();
  await page.getByRole("button", { name: /^Onayla/ }).click();
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByText("Özet & Beyan")).toBeVisible({ timeout: 30_000 });
  const beyan = page.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/ });
  await beyan.click();
  await page.getByRole("button", { name: "Tamamla" }).click();
  await page.waitForURL(/\/company\/(satinalma|satis|sirketim)/, { timeout: 60_000 });

  const user = await db().companyUser.findUniqueOrThrow({ where: { email: EMAIL }, select: { companyId: true } });
  const de = await db().company.findUniqueOrThrow({ where: { id: user.companyId! }, select: { country: true } });
  expect(de.country, "kayıt ülkesi BAE").toBe("AE");
  // Ücretsiz paket herkese açık talepleri görmez (ayrı kural) → Silver.
  await db().company.update({ where: { id: user.companyId! }, data: { tier: "SILVER" } });

  // ── 2. TR alıcı üç talep açar (API) ──────────────────────────────────
  const buyer = await apiSession(QA.aliciKurucu);
  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT", title: `QA AE Depo ${stamp}`, addressLine: "OSB 3. Cadde No 5", city: "İstanbul", district: "Tuzla", country: "TR",
  });
  const mk = async (title: string, targetCountries: string[]) => {
    const r = await apiPost(buyer, "/company/listings", {
      type: "ALIM", format: "RFQ", title, description: "Görünürlük ülkesi tarayıcı doğrulaması — staging, gerçek alım değildir.",
      visibility: "PUBLIC", categoryIds: [CATEGORY], deliveryAddressId: addr.body.id, targetCountries,
      closesAt: daysFromNow(3), primaryCurrency: "TRY", allowedCurrencies: ["TRY"],
      items: [{ name: "M6 Cıvata", quantity: 100, unit: "adet" }],
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    ids.push(r.body.id);
    if (r.body.status === "DRAFT") await apiPost(buyer, `/company/listings/${r.body.id}/publish`);
    return r.body.id as string;
  };
  const allId = await mk(`${stamp} Tüm ülkeler cıvata`, []);
  const deId = await mk(`${stamp} Yalnız BAE cıvata`, ["AE"]);
  const trId = await mk(`${stamp} Yalnız Türkiye cıvata`, ["TR"]);
  expect((await apiGet(buyer, `/company/listings/${deId}`)).body.targetCountries).toEqual(["AE"]);

  // ── 3. BAE tedarikçisi tarayıcıda (oturum kayıttan kaldı; paket için yenile) ──
  await gotoRetry(page, `/company/satis?q=${encodeURIComponent(stamp)}`);
  await page.waitForTimeout(2500);
  const list = page.locator("main");
  await expect(list.getByText(`${stamp} Tüm ülkeler cıvata`).first(), "tüm ülkeler talebi listede").toBeVisible({ timeout: 30_000 });
  await expect(list.getByText(`${stamp} Yalnız BAE cıvata`).first(), "yalnız-AE talebi listede").toBeVisible();
  await expect(list.getByText(`${stamp} Yalnız Türkiye cıvata`), "yalnız-TR talebi listede YOK").toHaveCount(0);
  await page.screenshot({ path: "test-results/scope-foreign-acik-talepler.png" });

  await gotoRetry(page, `/company/ilan/${deId}`);
  await expect(page.getByRole("heading", { name: `${stamp} Yalnız BAE cıvata` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Teklif Ver/ }).first()).toBeVisible();
  await expect(page.getByText("Birleşik Arap Emirlikleri").first(), "görünürlük çipi").toBeVisible();
  await page.screenshot({ path: "test-results/scope-foreign-de-talep.png" });

  await gotoRetry(page, `/company/ilan/${allId}`);
  await expect(page.getByRole("heading", { name: `${stamp} Tüm ülkeler cıvata` })).toBeVisible({ timeout: 30_000 });

  await gotoRetry(page, `/company/ilan/${trId}`);
  await expect(page.getByText(/bulunamadı|erişim|yetki/i).first(), "yalnız-TR talebi BAE firmasına kapalı").toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/scope-foreign-tr-kapali.png" });
});
