import { expect, request, test } from "@playwright/test";
import {
  ADMIN,
  API,
  QA,
  PNG_1x1,
  adminApiSession,
  adminContext,
  adminOpen,
  apiGet,
  apiPost,
  apiSession,
} from "./staging-helpers";

/**
 * PARÇA 6 — ADMİN PANELİ (staging).
 *
 * 1) Firma doğrulama: ücretsiz QA firması 6 belgeyi yükler + kimlik alanlarıyla
 *    başvurur (API) → Başvurular kuyruğunda görünür (admin tarayıcı) →
 *    Belgeler sekmesi "Hepsini Onayla" + "Kararı Kaydet" → "Onayla" →
 *    Doğrulandı; ardından red yolu (API, gerekçeli) → Reddedildi.
 *    Son durum: firma REDDEDİLDİ (doğrulanmamış kalır; QA seed'i bozulmaz).
 * 2) Destek (SUPPORT) rolü: personel ucundan açılır, firma detayına 403,
 *    ürün kuyruğuna 200; tarayıcıda firma sayfası "yetkiniz yok".
 * 3) Kategoriler (sonuçsuz aramalar) sayfası açılır.
 * Admin 2FA staging'de KAPALI (elle: canlı hesapta açılacak).
 */
const DOC_KINDS = ["taxPlate", "tradeRegistry", "signatureCircular", "activityCert", "idFront", "idBack"] as const;
const SUPPORT_EMAIL = "uguray156+qa-admin-destek@gmail.com";

test.describe("firma doğrulama", () => {
  test.describe.configure({ mode: "serial" });

  test("belgeler → başvuru → admin kuyruğu → onay → doğrulandı → red", async ({ browser }) => {
    test.setTimeout(300_000);
    const stamp = Date.now().toString(36).toUpperCase();
    const free = await apiSession(QA.ucretsizKurucu);
    const me = await apiGet(free, "/company-auth/me");
    const companyId: string = me.body?.company?.id ?? me.body?.companyId;
    expect(companyId, "firma id").toBeTruthy();

    // Başvuru zaten bekliyor/doğrulanmışsa (yarım koşum) admin kararıyla sıfırla.
    const admin = await adminApiSession();
    const before = await apiGet(admin, `/admin/companies/${companyId}`);
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    const status0: string = before.body?.companyVerificationStatus ?? before.body?.company?.companyVerificationStatus;
    if (status0 === "PENDING" || status0 === "VERIFIED") {
      const rr = await apiPost(admin, `/admin/companies/${companyId}/reject`, { reason: `QA sıfırlama ${stamp}` });
      expect(rr.status, JSON.stringify(rr.body)).toBeLessThan(300);
    }

    // 6 belge: presigned PUT + commit.
    const raw = await request.newContext();
    for (const kind of DOC_KINDS) {
      const up = await apiPost(free, "/company/docs/upload-url", { kind, fileName: `${kind}.png`, mimeType: "image/png", fileSize: PNG_1x1.length });
      expect(up.status, `${kind} upload-url: ${JSON.stringify(up.body)}`).toBeLessThan(300);
      const put = await raw.put(up.body.url, { data: PNG_1x1, headers: { "Content-Type": "image/png" } });
      expect(put.status(), `${kind} R2 PUT`).toBeLessThan(300);
      const commit = await apiPost(free, "/company/docs/commit", { kind, key: up.body.key });
      expect(commit.status, `${kind} commit: ${JSON.stringify(commit.body)}`).toBeLessThan(300);
    }
    await raw.dispose();
    const submit = await apiPost(free, "/company/docs/submit", {
      mersisNo: "0123456789012345",
      tradeRegistryNo: `QA-${stamp}`,
      iban: "TR330006100519786457841326",
      ibanHolder: "QA Ücretsiz Firma",
    });
    expect(submit.status, JSON.stringify(submit.body)).toBeLessThan(300);
    const docs = await apiGet(free, "/company/docs");
    expect(docs.body?.status, JSON.stringify(docs.body)).toBe("PENDING");

    // Admin tarayıcı: Başvurular kuyruğu → firma → Belgeler sekmesi.
    const ctx = await adminContext(browser);
    const page = await ctx.newPage();
    await adminOpen(page, "/admin/basvurular");
    const row = page.getByRole("link", { name: "QA Ücretsiz Firma" }).first();
    await expect(row, "başvuru kuyruğunda firma").toBeVisible({ timeout: 30_000 });
    await row.click();
    await page.waitForURL(new RegExp(`/admin/firmalar/${companyId}`), { timeout: 30_000 });
    await page.getByRole("button", { name: "Hepsini Onayla" }).click();
    await page.getByRole("button", { name: "Kararı Kaydet" }).click();
    // Tüm belgeler onaylıysa karar = doğrulama: "Firma doğrulandı" + kuyruğa dönüş.
    await expect(page.getByText("Firma doğrulandı").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForURL(/\/admin\/basvurular/, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "QA Ücretsiz Firma" })).toHaveCount(0);
    await ctx.close();

    const after = await apiGet(admin, `/admin/companies/${companyId}`);
    const status1: string = after.body?.companyVerificationStatus ?? after.body?.company?.companyVerificationStatus;
    expect(status1).toBe("VERIFIED");
    // Firma tarafı: /me VERIFIED, Firma Bilgileri kilidi (KYC) devrede.
    const me2 = await apiGet(free, "/company-auth/me");
    expect(JSON.stringify(me2.body)).toContain("VERIFIED");

    // Red yolu (gerekçe zorunlu) → REJECTED; seed durumu "doğrulanmamış" kalır.
    const badReject = await apiPost(admin, `/admin/companies/${companyId}/reject`, {});
    expect(badReject.status, "gerekçesiz red").toBeGreaterThanOrEqual(400);
    const reject = await apiPost(admin, `/admin/companies/${companyId}/reject`, { reason: `QA otomasyon: doğrulama geri alındı (${stamp})` });
    expect(reject.status, JSON.stringify(reject.body)).toBeLessThan(300);
    const final = await apiGet(admin, `/admin/companies/${companyId}`);
    expect(final.body?.companyVerificationStatus ?? final.body?.company?.companyVerificationStatus).toBe("REJECTED");
  });
});

test("Destek rolü: personel ucundan açılır; firma detayı 403, ürün kuyruğu 200; tarayıcıda 'yetkiniz yok'", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = await adminApiSession();
  const staff = await apiGet(admin, "/admin/staff");
  expect(staff.status).toBe(200);
  const list = (staff.body?.items ?? staff.body ?? []) as Array<{ id: string; email: string; role: string; isActive?: boolean }>;
  let support = list.find((s) => s.email === SUPPORT_EMAIL);
  let password = "";
  if (!support) {
    const created = await apiPost(admin, "/admin/staff", { email: SUPPORT_EMAIL, firstName: "QA", lastName: "Destek", role: "SUPPORT" });
    expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
    support = { id: created.body.id, email: SUPPORT_EMAIL, role: "SUPPORT" };
    password = created.body.tempPassword;
  } else {
    if (support.role !== "SUPPORT") await apiPost(admin, `/admin/staff/${support.id}/role`, { role: "SUPPORT" });
    if (support.isActive === false) await apiPost(admin, `/admin/staff/${support.id}/active`, { active: true });
    const reset = await apiPost(admin, `/admin/staff/${support.id}/reset-password`);
    expect(reset.status, JSON.stringify(reset.body)).toBeLessThan(300);
    password = reset.body.tempPassword;
  }
  expect(password, "destek geçici parolası").toBeTruthy();

  // Destek API oturumu.
  const ctx = await request.newContext({ baseURL: API.replace(/\/?$/, "/"), extraHTTPHeaders: { Origin: ADMIN, "Content-Type": "application/json" } });
  const login = await ctx.post("admin/auth/login", { data: { email: SUPPORT_EMAIL, password } });
  expect(login.status(), await login.text()).toBe(200);
  const free = await apiSession(QA.ucretsizKurucu);
  const me = await apiGet(free, "/company-auth/me");
  const companyId: string = me.body?.company?.id ?? me.body?.companyId;
  const detail = await ctx.get(`admin/companies/${companyId}`);
  expect(detail.status(), "SUPPORT firma detayı").toBe(403);
  const products = await ctx.get("admin/products?status=PENDING");
  expect(products.status(), "SUPPORT ürün kuyruğu").toBe(200);
  const staffAsSupport = await ctx.get("admin/staff");
  expect(staffAsSupport.status(), "SUPPORT personel listesi").toBe(403);
  await ctx.dispose();

  // Tarayıcı: destek olarak firma sayfası → yetki uyarısı.
  const bctx = await adminContext(browser);
  const page = await bctx.newPage();
  await adminOpen(page, `/admin/firmalar/${companyId}`, { email: SUPPORT_EMAIL, password });
  await expect(page.getByText(/yetkiniz yok/i).first()).toBeVisible({ timeout: 30_000 });
  await bctx.close();
});

test("Kategoriler (sonuçsuz aramalar) ve Ürün kuyruğu sayfaları açılır", async ({ browser }) => {
  const ctx = await adminContext(browser);
  const page = await ctx.newPage();
  await adminOpen(page, "/admin/kategoriler");
  await expect(page.getByRole("heading", { name: "Kategoriler" }).first()).toBeVisible({ timeout: 30_000 });
  await page.goto("/admin/urunler");
  await expect(page.getByText(/Kuyruk boş|Onay bekliyor/).first()).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});
