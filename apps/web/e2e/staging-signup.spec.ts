import { expect, test } from "@playwright/test";
import { PASSWORD } from "./staging-helpers";
import { cleanupSignup, closeDb, db } from "./db-helpers";
import { dogrulamaKodu, kayitFormu, onboarding } from "./signup-flow";

/**
 * KAYIT → DOĞRULAMA KODU → ONBOARDING (2026-09-12).
 *
 * Her müşterinin yaşadığı İLK beş dakika buydu ve uçtan uca HİÇ koşmamıştı:
 * QA hesapları tohumla oluşturuluyor, bu yol atlanıyordu. Test gerçek formu
 * doldurur, kodu (hash'ten çözerek) girer, 3 adımlı onboarding'i tamamlar ve
 * panele düşer. Sonunda firmayı, kullanıcıyı ve Supabase hesabını siler.
 *
 * Adımlar `signup-flow.ts`te ORTAK (2026-09-13): aynı yolu canlı yolculuk
 * testi de yürüyor, kopyalansaydı biri sessizce bayatlardı.
 */
const stamp = Date.now().toString(36).toUpperCase();
const EMAIL = `uguray156+qa-kayit-${stamp.toLowerCase()}@gmail.com`;

test.afterAll(async () => {
  await cleanupSignup(EMAIL);
  await closeDb();
});

test("yeni firma: kayıt formu → e-posta kodu → onboarding → panel", async ({ page }) => {
  test.setTimeout(300_000);

  await kayitFormu(page, { email: EMAIL, sifre: PASSWORD, ad: "QA", soyad: `Kayıt ${stamp}` });
  await dogrulamaKodu(page, EMAIL);
  await onboarding(page, `QA Kayıt Firması ${stamp} Ltd. Şti.`);

  await expect(page.getByText(`QA Kayıt ${stamp}`).first()).toBeVisible({ timeout: 30_000 });

  // ── Veritabanı durumu: ücretsiz ve doğrulanmamış doğmalı ────────────
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
