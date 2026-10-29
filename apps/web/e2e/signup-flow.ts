import { expect, type Page } from "@playwright/test";
import { isValidTaxIdForCountry, isValidTckn } from "@rothern/shared";
import { gotoRetry } from "./staging-helpers";
import { verificationCodeFor } from "./db-helpers";

/**
 * KAYIT + ONBOARDING — ORTAK ADIMLAR (2026-09-13).
 *
 * Hem `staging-signup.spec` hem `prod-journey.spec` bu yolu yürüyor. İkisine
 * de kopyalansaydı form bir değiştiğinde biri sessizce bayatlar ve YANLIŞ
 * güven verirdi (yeşil test, kırık akış). Yardımcı yalnız FORMU DOLDURUR;
 * ne beklendiğine dair iddialar spec'lerde kalır.
 */

/**
 * Doğrulayıcıyı ORACLE olarak kullanıp geçerli numara üretir — kural
 * kopyalanmaz. Kopyalansaydı algoritma değişince test uydurma numara
 * üretmeye devam eder ve doğrulayıcıyı hiç sınamazdı.
 */
export function gecerliVergiNo(): string {
  for (let deneme = 0; deneme < 500; deneme++) {
    const taban = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    for (let son = 0; son <= 9; son++) {
      const aday = `${taban}${son}`;
      if (isValidTaxIdForCountry(aday, "TR", false)) return aday;
    }
  }
  throw new Error("geçerli VKN üretilemedi");
}

export function gecerliTckn(): string {
  for (let deneme = 0; deneme < 2000; deneme++) {
    const taban = String(1 + Math.floor(Math.random() * 9)) + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    for (let a = 0; a <= 9; a++)
      for (let b = 0; b <= 9; b++) {
        const aday = `${taban}${a}${b}`;
        if (isValidTckn(aday)) return aday;
      }
  }
  throw new Error("geçerli TCKN üretilemedi");
}

/**
 * Kayıt formu → doğrulama kodu. Kod veritabanından çözülür (posta kutusuna bağımlı test kırılgan olur).
 * Form telefonu SORMAZ (sahip kararı 2026-10-08): alanlar ad, soyad, e-posta, şifre, şifre tekrarı.
 */
export async function kayitFormu(
  page: Page,
  opts: { email: string; sifre: string; ad: string; soyad: string },
): Promise<void> {
  await gotoRetry(page, "/company/kayit");
  await page.getByLabel("Ad", { exact: true }).fill(opts.ad);
  await page.getByLabel("Soyad").fill(opts.soyad);
  await page.getByLabel("Kurumsal e-posta").fill(opts.email);
  await page.getByLabel("Şifre", { exact: true }).fill(opts.sifre);
  await page.getByLabel("Şifre (tekrar)").fill(opts.sifre);
  // Headless UI kutusu native <input> değil (role=checkbox span) → check()
  // çalışmaz; tıklanır ve durum aria-checked'den doğrulanır.
  for (const etiket of [
    "Kullanıcı sözleşmesini okudum ve kabul ediyorum",
    "Platform aracılık ve kullanım sözleşmesini kabul ediyorum",
    "KVKK Aydınlatma Metni bilgilendirmesini okudum",
  ]) {
    const kutu = page.getByRole("checkbox", { name: etiket });
    await kutu.click();
    await expect(kutu).toHaveAttribute("aria-checked", "true");
  }
  const olustur = page.getByRole("button", { name: "Hesap Oluştur" });
  await expect(olustur, "onaylar işaretlenince düğme aktifleşir").toBeEnabled();
  await olustur.click();
}

/** Doğrulama kodunu veritabanından okuyup girer. Kodu döndürür (spec iddia edebilsin). */
export async function dogrulamaKodu(page: Page, email: string): Promise<string> {
  await expect(page.getByText("Doğrulama kodu").first()).toBeVisible({ timeout: 60_000 });
  let kod = "";
  for (let i = 0; i < 10 && !kod; i++) {
    kod = await verificationCodeFor(email).catch(() => "");
    if (!kod) await page.waitForTimeout(1500);
  }
  expect(kod, "doğrulama kodu üretildi").toMatch(/^\d{6}$/);
  await page.getByLabel("Doğrulama kodu").fill(kod);
  await page.getByRole("button", { name: /Doğrula ve Giriş Yap/ }).click();
  return kod;
}

/**
 * Sihirbazın GEÇERLİ adımı: adım göstergesindeki `aria-current="step"` öğesi.
 * Adım adları göstergede HER ZAMAN yazılıdır (üçü birden) — düz metin araması
 * adımın gerçekten değiştiğini kanıtlamaz.
 */
export function aktifAdim(page: Page) {
  return page.locator('li[aria-current="step"]');
}

/**
 * Firma kategori penceresini açar, ARAR, sonuçtaki SEKTÖR satırını işaretler
 * ve onaylar. "Faaliyet alanı" adımında çağrılır.
 *
 * FİRMA BEYANI YALNIZ SEKTÖR (sahip kararı 2026-10-29): pencere yalnız sektör
 * (L1) işaretletir; arama sonucu bağlamıyla (aile › sınıf › emtia) çizilir ama
 * onay kutusu yalnız sektör satırındadır. Ürün / hizmet adıyla aranır, işaret
 * sonucun SEKTÖRÜNE konur.
 *
 * NEDEN "PENCEREDEKİ İLK ONAY KUTUSU" DEĞİL (inceleme CAT-R2, 2026-10-08):
 * kapalı ağacın sektör satırları da onay kutusu taşır ve sektör listesi
 * pencere açılmadan önbellektedir. Terimi yazıp `dialog.getByRole("checkbox")
 * .first()`e tıklamak — arama 300 ms gecikmeyle başladığı için — sonuç değil
 * kapalı AĞACIN ilk sektörünü işaretler; ara-sonra-seç adımı hiç sınanmaz.
 *
 * Bu yüzden SONUÇ BEKLENİR: kutu `[data-slot="search-results"]` listesinin
 * içinden alınır (bağlam satırları — aile › sınıf › emtia — birer düğmedir,
 * onay kutusu değil; kutu yalnız sektör satırında). Kapalı ağaçta bu liste yoktur → konum yalnız sonuçlar
 * çizilince eşleşir, bekleme kendiliğinden olur. (DOM sözleşmesi yerelde
 * `category-selector-modal.test.tsx` "yalnız sektör kipi" › "e2e sözleşmesi"
 * testiyle kilitli — bu dosya yerelde koşulamaz.) Ardından tek sayaç
 * "Sektör 1/5" doğrulanır.
 */
export async function kategoriAraVeSec(page: Page, terim: string): Promise<void> {
  // Boşken "Sektör seçin", doluyken "Sektör ekle", tavanda "Sektörleri düzenle".
  await page.getByRole("button", { name: /Sektör (seçin|ekle)|Sektörleri düzenle/ }).first().click();
  const pencere = page.getByRole("dialog");
  // Yalnız sektör kipinde kutu ürün / hizmet adını da aradığını söyler.
  const kategoriAra = pencere.getByPlaceholder(/Sektör, ürün ya da hizmet ara/);
  await expect(kategoriAra).toBeVisible({ timeout: 15_000 });
  await kategoriAra.fill(terim);
  const sektorKutusu = pencere.locator('[data-slot="search-results"]').getByRole("checkbox").first();
  // Gerçekten arama yanıtı beklenir → süre geniş.
  await expect(sektorKutusu, `"${terim}" araması sonuç getirdi (sonucun sektörü)`).toBeVisible({ timeout: 30_000 });
  await sektorKutusu.click();
  await expect(sektorKutusu).toHaveAttribute("aria-checked", "true");
  await expect(pencere.getByText(/^Sektör 1\/5$/), "tek sektör işaretli (yalnız sektör kipi)").toBeVisible();
  const onayla = pencere.getByRole("button", { name: /^Onayla/ });
  await expect(onayla).toBeEnabled({ timeout: 10_000 });
  await onayla.click();
}

/**
 * Üç adımlı onboarding; sonunda panele düşer. Adımlar (2026-10-08):
 * Şirket bilgileri (ülke en başta) → Faaliyet alanı (kategori + faaliyet tipi)
 * → Yetkili ve onay (kimlik no, özet, beyan).
 */
export async function onboarding(page: Page, firmaUnvani: string): Promise<void> {
  // 1 — Şirket bilgileri
  // Onboarding başlığı "Şirket bilgileri" (2026-09-27); adım etiketi ve açıklama da
  // aynı sözcükleri taşır → düz metin 4 öğe bulur, başlık rolüyle aranır.
  await expect(page.getByRole("heading", { name: "Şirket bilgileri" })).toBeVisible({ timeout: 60_000 });
  await expect(aktifAdim(page)).toContainText("Şirket bilgileri");
  // Ülke ilk alandır ve arayüz diliyle açılır (Türkçe → Türkiye; kayıt telefonu
  // sormaz, 2026-10-08); hukuki yapı listesi, vergi alanları ve adres ona göre
  // çizilir. Türkiye'de hukuki yapı genel listeden seçilir (Limited / Anonim /
  // Şahıs / Diğer).
  await page.getByLabel(/Firma Unvanı/).fill(firmaUnvani);
  await page.getByLabel(/^Hukuki Yapı/).selectOption("LIMITED");
  await page.getByLabel(/Vergi No|Vergi \/ Sicil No/).first().fill(gecerliVergiNo());
  await page.getByLabel(/Vergi Dairesi/).fill("Tuzla");
  const il = page.getByLabel(/^İl \*/).first();
  if ((await il.count()) > 0) await il.selectOption({ label: "İstanbul" }).catch(() => il.selectOption({ index: 1 }));
  const ilce = page.getByLabel(/^İlçe/).first();
  if ((await ilce.count()) > 0) await ilce.selectOption({ index: 1 });
  await page.getByLabel(/Açık Adres/).first().fill("Organize Sanayi Bölgesi 7. Cadde No 3");
  await page.getByRole("button", { name: "Devam" }).click();

  // 2 — Faaliyet alanı: yalnız kategori seçici + faaliyet tipi (kişisel alan yok)
  await expect(aktifAdim(page)).toContainText("Faaliyet alanı", { timeout: 30_000 });
  // KATEGORİ SEÇİCİ YALNIZ SEKTÖR SORAR (2026-10-29): boş durumda "Sektör
  // seçin" düğmesi CategorySelectorModal'ı yalnız sektör kipinde açar; ürün /
  // hizmet adıyla aranır, sonucun sektörü işaretlenir (staging-signup +
  // prod-journey + staging-scope-foreign aynı yardımcıyı kullanır).
  await kategoriAraVeSec(page, "Makine");
  await page.getByRole("button", { name: "Devam" }).click();

  // 3 — Yetkili ve onay: yetkili kimlik no (TR'de zorunlu), özet, beyan
  await expect(aktifAdim(page)).toContainText("Yetkili ve onay", { timeout: 30_000 });
  const tckn = page.getByLabel(/T\.C\. Kimlik No|Yetkili Kimlik No/);
  if ((await tckn.count()) > 0) await tckn.first().fill(gecerliTckn());
  const beyan = page.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/ });
  await beyan.click();
  await expect(beyan).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Tamamla" }).click();

  await page.waitForURL(/\/company\/(satinalma|satis|sirketim)/, { timeout: 60_000 });
}
