import { expect, test } from "@playwright/test";
import { PASSWORD } from "./staging-helpers";
import { cleanupSignup, closeDb, db } from "./db-helpers";
import { aktifAdim, dogrulamaKodu, kayitFormu, onboarding } from "./signup-flow";

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
 *
 * Adım sırası 2026-10-08'de değişti: Şirket bilgileri (ülke en başta, hukuki
 * yapı ülkeye göre) → Faaliyet alanı (kategori seçici) → Yetkili ve onay
 * (kimlik no + özet + beyan). Bu test adımları o sırayla yürür ve her geçişte
 * adım göstergesinin geçerli adımını doğrular.
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

  // ── 1. adım: ülke ilk alan, altındaki alanlar ona göre ───────────────
  await expect(page.getByRole("heading", { name: "Şirket bilgileri" })).toBeVisible({ timeout: 60_000 });
  await expect(aktifAdim(page)).toContainText("Şirket bilgileri");
  const ulke = page.getByRole("combobox", { name: /^Ülke/ });
  // Kayıt telefonu sormaz (2026-10-08): ülke arayüz dilinden gelir (Türkçe → Türkiye).
  await expect(ulke, "arayüz diliyle (Türkçe → Türkiye) açılır").toHaveValue("Türkiye");
  await expect(page.getByText("Aşağıdaki alanlar seçtiğiniz ülkeye göre düzenlenir.")).toBeVisible();
  // Ülke kutusu firma unvanından ÖNCE gelir.
  const [ulkeY, unvanY] = await Promise.all([
    ulke.boundingBox().then((b) => b?.y ?? 0),
    page.getByLabel(/Firma Unvanı/).boundingBox().then((b) => b?.y ?? 0),
  ]);
  expect(ulkeY, "ülke ilk alandır").toBeLessThan(unvanY);
  // Türkiye'de hukuki yapı bugünkü genel listedir; kişisel alan bu adımda yok.
  await expect(page.getByLabel(/^Hukuki Yapı/).locator("option")).toHaveText([
    "Limited Şirket",
    "Anonim Şirket",
    "Şahıs Firması",
    "Diğer",
  ]);
  await expect(page.getByLabel(/T\.C\. Kimlik No/)).toHaveCount(0);

  // ── 2. ve 3. adım: ortak yardımcı yeni sırayla yürür ─────────────────
  await onboarding(page, `QA Kayıt Firması ${stamp} Ltd. Şti.`);

  await expect(page.getByText(`QA Kayıt ${stamp}`).first()).toBeVisible({ timeout: 30_000 });

  // ── Veritabanı durumu: ücretsiz ve doğrulanmamış doğmalı ────────────
  const user = await db().companyUser.findUnique({ where: { email: EMAIL } });
  expect(user, "kayıt kullanıcısı").toBeTruthy();
  expect(user!.phone, "kayıt telefonu sormaz → telefon boş").toBeNull();
  expect(user!.emailVerifiedAt, "e-posta doğrulandı").toBeTruthy();
  const company = await db().company.findUnique({ where: { id: user!.companyId } });
  expect(company, "firma oluştu").toBeTruthy();
  expect(company!.ownerUserId, "ilk kullanıcı kurucudur").toBe(user!.id);
  expect(company!.tier, "yeni firma ücretsiz pakette").toBe("STANDART");
  expect(company!.companyVerificationStatus, "yeni firma doğrulanmamış").toBe("UNVERIFIED");
  expect(company!.onboardingCompletedAt, "onboarding tamamlandı").toBeTruthy();
  // Türkiye genel listeden seçer: tür yazılır, yerel yapı adı boş kalır.
  expect(company!.country, "kayıt ülkesi").toBe("TR");
  expect(company!.companyType, "hukuki yapı türü").toBe("LIMITED");
  expect(company!.legalFormLocal, "Türkiye'de yerel yapı adı tutulmaz").toBeNull();
});
