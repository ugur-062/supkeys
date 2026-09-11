import { expect, test } from "@playwright/test";
import { QA, uiLogin } from "./staging-helpers";

/**
 * PARÇA 5 — KISITLI ROLLER VE PAKETLER (staging, QA hesapları).
 * Her rol için "görmemeli" kuralı: sayfa açılır, kapı metni ya da eksik düğme
 * doğrulanır. Rol tanımları CLAUDE.md § İzin modeli.
 */

test("Onaylayıcı: portal panosuna erişemez, Onaylar'a yönlendirilir", async ({ page }) => {
  await uiLogin(page, QA.aliciOnaylayici);
  await page.goto("/company/satinalma");
  await expect(page.locator("body")).toContainText(/erişim yetkiniz yok/i, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Onaylar'a Git/ })).toBeVisible();
  await page.goto("/company/onaylar");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("Görüntüleyici: Taleplerim salt-okunur — yeni talep düğmesi yok", async ({ page }) => {
  await uiLogin(page, QA.aliciGoruntuleyici);
  await page.goto("/company/satinalma/taleplerim");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('a[href="/company/satinalma/taleplerim/yeni"]')).toHaveCount(0);
});

test("Satın Almacı: Ayarlar'da firma kartları ve Firma Bilgileri kapısı", async ({ page }) => {
  await uiLogin(page, QA.aliciSatinalmaci);
  await page.goto("/company/ayarlar");
  await expect(page.getByText("Kişisel Ayarlar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Kullanıcı Yönetimi/ })).toHaveCount(0);
  await page.goto("/company/ayarlar/firma");
  await expect(page.locator("body")).toContainText(/yetki gerektirir/);
});

test("Yönetici: kendi satırında yetki tablosu kilitli", async ({ page }) => {
  await uiLogin(page, QA.aliciYonetici);
  await page.goto("/company/ayarlar/kullanicilar");
  await expect(page.getByText(/Kullanıcılar \(\d+\)/)).toBeVisible({ timeout: 30_000 });
  const ownRow = page.getByRole("row").filter({ hasText: QA.aliciYonetici });
  await ownRow.getByRole("button", { name: "Aksiyonlar" }).click();
  await page.getByText("Düzenle").click();
  await expect(page.getByText(/Kendi yetkilerinizi düzenleyemezsiniz/)).toBeVisible();
});

test("Ücretsiz paket: herkese açık talepler kilitli (Silver), davet gönderemez", async ({ page }) => {
  await uiLogin(page, QA.ucretsizKurucu);
  await page.goto("/company/satis");
  await expect(page.locator("body")).toContainText(/Silver/, { timeout: 30_000 });
  await page.goto("/company/satis/musterilerim");
  await expect(page.getByRole("heading", { name: "Bağlantılar" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Davet et/ })).toHaveCount(0);
});

test("Firma Bilgileri (doğrulanmış kurucu): kimlik salt-okunur, ad ve unvan kilitli", async ({ page }) => {
  await uiLogin(page, QA.aliciKurucu);
  await page.goto("/company/ayarlar/firma");
  await expect(page.getByText("Kimlik")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Firma adı")).toBeDisabled();
  await expect(page.getByLabel("Yasal unvan")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Kaydet" })).toBeDisabled();
});
