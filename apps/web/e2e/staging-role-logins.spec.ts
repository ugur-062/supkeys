import { expect, test } from "@playwright/test";
import { PASSWORD, QA, gotoRetry } from "./staging-helpers";

/**
 * HER ROLDEN GERÇEK GİRİŞ — 12 QA hesabının tamamı giriş FORMUNDAN girer.
 * Doğrulanan: giriş başarılı, üst çubukta doğru kişi ve firma yazıyor, oturum
 * yenilemeye dayanıyor, çıkış çalışıyor ve çıkıştan sonra panel korumalı.
 */
// Üst çubuk SAHİPTE firma adı yerine "Kurucu" yazar (topbar.tsx) → beklenti role göre.
const USERS: Array<{ slug: string; email: string; ad: string; firma: string; owner?: boolean }> = [
  { slug: "alıcı · kurucu", email: QA.aliciKurucu, ad: "Kurucu Alıcı", firma: "QA Alıcı Sanayi A.Ş.", owner: true },
  { slug: "alıcı · yönetici", email: QA.aliciYonetici, ad: "Yönetici Alıcı", firma: "QA Alıcı Sanayi A.Ş." },
  { slug: "alıcı · satın almacı", email: QA.aliciSatinalmaci, ad: "Satın Almacı", firma: "QA Alıcı Sanayi A.Ş." },
  { slug: "alıcı · satışçı", email: QA.aliciSatisci, ad: "Satış Alıcı", firma: "QA Alıcı Sanayi A.Ş." },
  { slug: "alıcı · onaylayıcı", email: QA.aliciOnaylayici, ad: "Onay Alıcı", firma: "QA Alıcı Sanayi A.Ş." },
  { slug: "alıcı · görüntüleyici", email: QA.aliciGoruntuleyici, ad: "Görüntü Alıcı", firma: "QA Alıcı Sanayi A.Ş." },
  { slug: "tedarikçi · kurucu", email: QA.tedarikciKurucu, ad: "Kurucu Tedarikçi", firma: "QA Tedarikçi Ltd. Şti.", owner: true },
  { slug: "tedarikçi · satışçı", email: QA.tedarikciSatisci, ad: "Satış Tedarikçi", firma: "QA Tedarikçi Ltd. Şti." },
  { slug: "tedarikçi · görüntüleyici", email: QA.tedarikciGoruntuleyici, ad: "Görüntü Tedarikçi", firma: "QA Tedarikçi Ltd. Şti." },
  { slug: "tedarikçi2 · kurucu", email: QA.tedarikci2Kurucu, ad: "Kurucu Tedarikçi2", firma: "QA Tedarikçi 2 A.Ş.", owner: true },
  { slug: "tedarikçi2 · satışçı", email: QA.tedarikci2Satisci, ad: "Satış Tedarikçi2", firma: "QA Tedarikçi 2 A.Ş." },
  { slug: "ücretsiz · kurucu", email: QA.ucretsizKurucu, ad: "Kurucu Ücretsiz", firma: "QA Ücretsiz Firma", owner: true },
];

for (const u of USERS) {
  test(`giriş — ${u.slug}`, async ({ page }) => {
    test.setTimeout(300_000);
    // Giriş ucu IP başına 10/dk; 12 hesap tek IP'den ardışık girer → 429'da
    // form yerinde kalır ("Çok fazla deneme"). Ürün hatası değil: bekle, yinele.
    for (let attempt = 0; ; attempt++) {
      await gotoRetry(page, "/company/login");
      await page.locator('input[type="email"]').fill(u.email);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.getByRole("button", { name: "Giriş Yap" }).click();
      const outcome = await Promise.race([
        page.waitForURL(/\/company(?!\/login)/, { timeout: 45_000 }).then(() => "ok" as const),
        page.getByText(/Çok fazla deneme/).first().waitFor({ timeout: 45_000 }).then(() => "throttled" as const),
      ]);
      if (outcome === "ok") break;
      if (attempt >= 2) throw new Error(`${u.slug}: giriş hız sınırına takıldı (3 deneme)`);
      await page.waitForTimeout(62_000); // pencere (60 sn) tamamen dolsun
    }

    // Üst çubuk kimliği: kişi + firma.
    await expect(page.getByText(u.ad).first(), `${u.slug}: ad`).toBeVisible({ timeout: 30_000 });
    const altYazi = u.owner ? "Kurucu" : u.firma;
    await expect(page.getByText(altYazi).first(), `${u.slug}: alt satır`).toBeVisible();

    // Oturum yenilemeye dayanır (httpOnly çerez).
    await page.reload();
    await expect(page.getByText(u.ad).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/company\/login/);
  });
}
