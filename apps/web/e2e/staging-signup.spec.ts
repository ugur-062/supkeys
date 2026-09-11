import { expect, test } from "@playwright/test";
import { isValidTaxIdForCountry, isValidTckn } from "@rothern/shared";
import { PASSWORD, gotoRetry } from "./staging-helpers";
import { cleanupSignup, closeDb, db, verificationCodeFor } from "./db-helpers";

/**
 * KAYIT → DOĞRULAMA KODU → ONBOARDING (2026-09-12).
 *
 * Her müşterinin yaşadığı İLK beş dakika buydu ve uçtan uca HİÇ koşmamıştı:
 * QA hesapları tohumla oluşturuluyor, bu yol atlanıyordu. Test gerçek formu
 * doldurur, kodu (hash'ten çözerek) girer, 3 adımlı onboarding'i tamamlar ve
 * panele düşer. Sonunda firmayı, kullanıcıyı ve Supabase hesabını siler.
 */
const stamp = Date.now().toString(36).toUpperCase();
const EMAIL = `uguray156+qa-kayit-${stamp.toLowerCase()}@gmail.com`;

/** Doğrulayıcıyı ORACLE olarak kullanıp geçerli numara üretir (kural kopyalanmaz). */
function validTaxNumber(): string {
  for (let attempt = 0; attempt < 500; attempt++) {
    const base = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    for (let last = 0; last <= 9; last++) {
      const candidate = `${base}${last}`;
      if (isValidTaxIdForCountry(candidate, "TR", false)) return candidate;
    }
  }
  throw new Error("geçerli VKN üretilemedi");
}

function validTckn(): string {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const base = String(1 + Math.floor(Math.random() * 9)) + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    for (let a = 0; a <= 9; a++)
      for (let b = 0; b <= 9; b++) {
        const candidate = `${base}${a}${b}`;
        if (isValidTckn(candidate)) return candidate;
      }
  }
  throw new Error("geçerli TCKN üretilemedi");
}

test.afterAll(async () => {
  await cleanupSignup(EMAIL);
  await closeDb();
});

test("yeni firma: kayıt formu → e-posta kodu → onboarding → panel", async ({ page }) => {
  test.setTimeout(300_000);

  // ── 1. Kayıt formu ──────────────────────────────────────────────────
  await gotoRetry(page, "/company/kayit");
  await page.getByLabel("Ad", { exact: true }).fill("QA");
  await page.getByLabel("Soyad").fill(`Kayıt ${stamp}`);
  await page.getByLabel("Kurumsal e-posta").fill(EMAIL);
  await page.getByLabel("Telefon").fill("0555 111 22 33");
  await page.getByLabel("Şifre", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Şifre (tekrar)").fill(PASSWORD);
  // Üç zorunlu onay olmadan "Hesap Oluştur" pasif kalır (dördüncüsü isteğe bağlı).
  for (const label of [
    "Kullanıcı sözleşmesini kabul ediyorum",
    "Platform aracılık ve kullanım sözleşmesini kabul ediyorum",
    "KVKK Aydınlatma Metni bilgilendirmesini okudum",
  ]) {
    // Headless UI kutusu native <input> değil (role=checkbox span) → check()
    // çalışmaz, tıklanır ve durumu aria-checked'den doğrulanır.
    const box = page.getByRole("checkbox", { name: label });
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
  }
  const olustur = page.getByRole("button", { name: "Hesap Oluştur" });
  await expect(olustur, "onaylar işaretlenince düğme aktifleşir").toBeEnabled();
  await olustur.click();

  // ── 2. Doğrulama kodu ───────────────────────────────────────────────
  await expect(page.getByText("Doğrulama kodu").first()).toBeVisible({ timeout: 60_000 });
  let code = "";
  for (let i = 0; i < 10 && !code; i++) {
    code = await verificationCodeFor(EMAIL).catch(() => "");
    if (!code) await page.waitForTimeout(1500);
  }
  expect(code, "doğrulama kodu üretildi").toMatch(/^\d{6}$/);
  await page.getByLabel("Doğrulama kodu").fill(code);
  await page.getByRole("button", { name: /Doğrula ve Giriş Yap/ }).click();

  // ── 3. Onboarding — Şirket Bilgileri ────────────────────────────────
  await expect(page.getByText("Şirket Bilgileri")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/Firma Unvanı/).fill(`QA Kayıt Firması ${stamp} Ltd. Şti.`);
  const tur = page.getByLabel(/Firma Türü/);
  await tur.selectOption({ index: 1 });
  await page.getByLabel(/Vergi No|Vergi \/ Sicil No/).first().fill(validTaxNumber());
  await page.getByLabel(/Vergi Dairesi/).fill("Tuzla");
  const il = page.getByLabel(/^İl \*/).first();
  if ((await il.count()) > 0) await il.selectOption({ label: "İstanbul" }).catch(() => il.selectOption({ index: 1 }));
  const ilce = page.getByLabel(/^İlçe/).first();
  if ((await ilce.count()) > 0) await ilce.selectOption({ index: 1 });
  await page.getByLabel(/Açık Adres/).first().fill("Organize Sanayi Bölgesi 7. Cadde No 3");
  await page.getByRole("button", { name: "Devam" }).click();

  // ── 4. Onboarding — Kişisel Bilgiler + sektör ───────────────────────
  await expect(page.getByText("Kişisel Bilgiler")).toBeVisible({ timeout: 30_000 });
  const tckn = page.getByLabel(/T\.C\. Kimlik No|Yetkili Kimlik No/);
  if ((await tckn.count()) > 0) await tckn.first().fill(validTckn());
  await page.getByText("Sektör seçmek için tıklayın").click();
  await expect(page.getByPlaceholder("Kategori ara...")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("Kategori ara...").fill("Makine");
  const firstSegment = page.getByRole("dialog").locator("button").filter({ hasText: /Makine|makine/ }).first();
  await firstSegment.click();
  await page.getByRole("button", { name: /^Onayla/ }).click();
  await page.getByRole("button", { name: "Devam" }).click();

  // ── 5. Onboarding — Özet & Beyan ────────────────────────────────────
  await expect(page.getByText("Özet & Beyan")).toBeVisible({ timeout: 30_000 });
  const beyan = page.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/ });
  await beyan.click();
  await expect(beyan).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Tamamla" }).click();

  // ── 6. Panele düşer ─────────────────────────────────────────────────
  await page.waitForURL(/\/company\/(satinalma|satis|sirketim)/, { timeout: 60_000 });
  await expect(page.getByText(`QA Kayıt ${stamp}`).first()).toBeVisible({ timeout: 30_000 });

  // ── 7. Veritabanı durumu: ücretsiz ve doğrulanmamış doğmalı ─────────
  const user = await db().companyUser.findUnique({ where: { email: EMAIL } });
  expect(user, "kayıt kullanıcısı").toBeTruthy();
  expect(user!.emailVerifiedAt, "e-posta doğrulandı").toBeTruthy();
  const company = await db().company.findUnique({ where: { id: user!.companyId } });
  expect(company, "firma oluştu").toBeTruthy();
  expect(company!.ownerUserId, "ilk kullanıcı kurucudur").toBe(user!.id);
  expect(company!.tier, "yeni firma ücretsiz pakette").toBe("STANDART");
  expect(company!.companyVerificationStatus, "yeni firma doğrulanmamış").toBe("UNVERIFIED");
  expect(company!.onboardingCompletedAt, "onboarding tamamlandı").toBeTruthy();
});
