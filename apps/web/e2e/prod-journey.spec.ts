import { expect, test } from "@playwright/test";
import { PASSWORD, gotoRetry, uiLogin } from "./staging-helpers";
import { cleanupCompanyByOwnerEmail, closeDb, db } from "./db-helpers";
import { dogrulamaKodu, kayitFormu, onboarding } from "./signup-flow";

/**
 * ⚠️ CANLI YOLCULUK — "müşteri numarası bir"in ilk yarım saati.
 *
 * YALNIZ `scripts/e2e-prod.sh` ile ve ELLE koşulur; CI'a bağlanmaz.
 *
 * NEDEN AYRI SPEC: staging paketi yeşil olsa bile canlı FARKLI yapılandırma —
 * ayrı veritabanı, ayrı çerez alanı (`.rothern.com` vs `.staging.rothern.com`),
 * ayrı gönderen adresi, ayrı Supabase projesi. Bu spec yapılandırmayı sınar,
 * iş mantığını değil; iş mantığı zaten staging paketinde.
 *
 * KAPSAM BİLİNÇLİ OLARAK DAR: yalnız GERİ ALINABİLİR adımlar var. Kazandırma
 * ve sipariş kasıtlı DIŞARIDA — kazandırma geri alınamaz (CLAUDE.md madde 7),
 * canlıda denenirse silinemeyen kayıt kalır.
 *
 * TEMİZLİK: `afterAll` firmayı, TÜM kullanıcılarını ve Supabase hesaplarını
 * siler ve silindiğini DOĞRULAR. Silinemezse koşum kırmızı olur — canlıda
 * artık veri sessizce kalamaz.
 */
const damga = Date.now().toString(36).toUpperCase();
const KURUCU = `uguray156+canli-${damga.toLowerCase()}@gmail.com`;
const DAVETLI = `uguray156+canli-${damga.toLowerCase()}-2@gmail.com`;
/* Şifre TEK KAYNAK: `uiLogin` de aynı değeri kullanır. Ayrı varsayılan
   tutulsaydı betiksiz koşumda kayıt bir şifreyle açılır, giriş başkasıyla
   denenirdi — sessiz ve teşhisi zor bir kırık. */
const SIFRE = PASSWORD;
const FIRMA = `Canlı Tur ${damga} Ltd. Şti.`;

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await cleanupCompanyByOwnerEmail(KURUCU).catch((e) => {
    console.error("⚠️ TEMİZLİK BAŞARISIZ — canlıda artık veri kalmış olabilir:", e);
    throw e;
  });
  await closeDb();
});

test("canlı: kayıt → çıkış → giriş → ürün → kullanıcı daveti", async ({ page }) => {
  test.setTimeout(420_000);

  // ── 1. Kayıt ve onboarding ──────────────────────────────────────────
  await kayitFormu(page, { email: KURUCU, sifre: SIFRE, ad: "Canlı", soyad: `Tur ${damga}` });
  await dogrulamaKodu(page, KURUCU);
  await onboarding(page, FIRMA);
  await expect(page.getByText(`Canlı Tur ${damga}`).first()).toBeVisible({ timeout: 30_000 });

  // Gönderen adresi CANLI yapılandırmadan gelir — doğrulama e-postası
  // gerçekten gitmiş mi, kayıt altında mı?
  const posta = await db().emailLog.findFirst({
    where: { toEmail: KURUCU },
    orderBy: { queuedAt: "desc" },
    select: { status: true, subject: true },
  });
  expect(posta, "doğrulama e-postası kayda geçti").toBeTruthy();
  expect(posta!.status, "e-posta gönderildi (canlı sağlayıcı)").toBe("SENT");

  // ── 2. Çıkış → giriş (ÇEREZ ALANI + CSRF canlıda farklı) ────────────
  // Oturum kurulumu staging'den ayrı bir alan adında çalışıyor; formdan
  // yeniden girmek bunu doğrudan sınar.
  //
  // TUZAK (2026-09-13, ilk koşumda yakalandı): yalnız ÇEREZ silmek yetmiyor.
  // Zustand persist kimlik anlık görüntüsünü (`user`/`company`) localStorage'da
  // tutuyor — çerez gidince başlık HÂLÂ oturum açıkmış gibi görünüyor, uygulama
  // arka planda girişe yönleniyor ve elle doldurulan form bu yönlendirmeyle
  // YARIŞIYOR. İlk koşumda giriş POST'u iptal oldu (ağ izinde durum -1), test
  // de "CSRF çerezi yok" diye CANLIYI suçladı. İkisi birlikte temizlenmeli.
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* özel pencere */
    }
  });
  await page.context().clearCookies();

  // Elle form doldurmak yerine sertleştirilmiş yardımcı: oturumu `/me` ile
  // DOĞRULAR ve hız sınırında yineler — tam da yukarıdaki yarışa karşı yazılmıştı.
  await uiLogin(page, KURUCU);

  // Çerez gerçekten ANA alan adına yazıldı mı — `.rothern.com` olmazsa
  // `www` `rk_csrf`i okuyamaz ve tüm mutasyonlar 403 olur.
  const cerezler = await page.context().cookies();
  const csrf = cerezler.find((c) => c.name === "rk_csrf");
  expect(csrf, "rk_csrf çerezi yazıldı").toBeTruthy();
  expect(csrf!.domain, "çerez ANA alan adında (alt alanlar paylaşır)").toMatch(/^\.?rothern\.com$/);

  // ── 3. Ürün ekleme (CSRF korumalı yazma, canlı) ─────────────────────
  // Ürün formunun AYRI ROTASI YOK: `/company/satis/urunlerim` sayfasında
  // "Yeni ürün" düğmesi görünümü değiştiriyor (ürün ekleme tek sayfadır,
  // ilan açma gibi sihirbaz değil — 2026-09-03 kullanıcı kararı).
  await gotoRetry(page, "/company/satis/urunlerim");
  const yeniUrun = page.getByRole("button", { name: "Yeni ürün" });
  await expect(yeniUrun).toBeVisible({ timeout: 30_000 });
  await yeniUrun.click();

  const urunAdi = `Canlı Tur Ürünü ${damga}`;
  /**
   * `getByLabel` BURADA ÇALIŞMAZ — "düzeltmeye" kalkma.
   *
   * `components/ui/label.tsx` düz bir `<label>` basıyor, `htmlFor` YOK; yanındaki
   * ham `<input>`un da `id`si yok. Yani etiket girdiye programatik olarak BAĞLI
   * DEĞİL. Bu bir ERİŞİLEBİLİRLİK KUSURU (ekran okuyucu alan adını söylemez,
   * etikete tıklamak alanı odaklamaz) ve ürün ekleme + talep sihirbazı dahil
   * sekiz dosyada 72 etiketi etkiliyor. Ayrı iş olarak raporlandı.
   *
   * `staging-a11y.spec` bunu göremedi: form bir tıklamanın ARKASINDA, tarama
   * yalnız doğrudan açılan sayfaları geziyor.
   *
   * Kusur giderilince burası `getByLabel(/Ürün adı/)`ya dönmeli.
   */
  const adAlani = page.getByPlaceholder("Dağıtım panosu 400A IP54");
  await expect(adAlani).toBeVisible({ timeout: 30_000 });
  await adAlani.fill(urunAdi);

  // Birincil düğme taslakta "Onaya gönder" — yayın kapısı (kategori, ≥100
  // karakter açıklama, görsel, anahtar kelime) burada sınanmıyor, o staging'in
  // işi. Buradaki soru "canlıda CSRF korumalı yazma çalışıyor mu".
  /**
   * YANITI BEKLE, metne bakma. İlk denemede `toContainText(/Taslak/i)`
   * kullanmıştım ve ANINDA geçti — "Kaydedince taslak olur…" durum kartında
   * ZATEN yazıyor. Doğrulama boşa geçince test POST bitmeden ilerledi,
   * Playwright sayfayı kapattı ve istek İPTAL oldu (ağ izinde durum -1).
   * Sonra "ürün veritabanında yok" diye CANLIYI suçladı.
   */
  const kayitYaniti = page.waitForResponse(
    (r) => r.url().includes("/company/items/product") && r.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Taslak olarak kaydet" }).click();
  const yanit = await kayitYaniti;
  expect(yanit.status(), `ürün kaydı (CSRF korumalı yazma): ${await yanit.text().catch(() => "")}`).toBeLessThan(300);

  const urun = await db().companyItem.findFirst({
    where: { name: urunAdi },
    select: { id: true, reviewStatus: true, isPublic: true },
  });
  expect(urun, "ürün canlı veritabanına yazıldı").toBeTruthy();
  expect(urun!.isPublic, "yeni ürün vitrine ÇIKMAZ (admin onayı şart)").toBe(false);
  expect(urun!.reviewStatus, "taslak olarak doğar").toBe("DRAFT");

  // ── 4. Kullanıcı daveti ─────────────────────────────────────────────
  await gotoRetry(page, "/company/ayarlar/kullanicilar");
  const davetAc = page.getByRole("button", { name: "Üye Davet Et" });
  await expect(davetAc).toBeVisible({ timeout: 30_000 });
  await davetAc.click();

  const diyalog = page.getByRole("dialog");
  const eposta = diyalog.locator('input[type="email"]').first();
  await expect(eposta).toBeVisible({ timeout: 15_000 });
  await eposta.fill(DAVETLI);
  // Yetki tablosu yüklenmeden "Davet Gönder" pasif kalıyor.
  const gonder = diyalog.getByRole("button", { name: "Davet Gönder" });
  await expect(gonder).toBeEnabled({ timeout: 30_000 });
  // Ürün adımındaki aynı yarışa düşmemek için YANIT beklenir, metin değil.
  const davetYaniti = page.waitForResponse(
    (r) => r.url().includes("/company/users") && r.request().method() === "POST",
    { timeout: 45_000 },
  );
  await gonder.click();
  const dy = await davetYaniti;
  expect(dy.status(), `davet gönderimi: ${await dy.text().catch(() => "")}`).toBeLessThan(300);

  // Davet e-postası CANLI gönderen adresinden çıktı mı?
  const davetPostasi = await db().emailLog.findFirst({
    where: { toEmail: DAVETLI },
    orderBy: { queuedAt: "desc" },
    select: { status: true },
  });
  expect(davetPostasi, "davet e-postası kayda geçti").toBeTruthy();
  expect(davetPostasi!.status, "davet e-postası gönderildi").toBe("SENT");
});
