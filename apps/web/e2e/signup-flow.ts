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

/** Kayıt formu → doğrulama kodu. Kod veritabanından çözülür (posta kutusuna bağımlı test kırılgan olur). */
export async function kayitFormu(
  page: Page,
  opts: { email: string; sifre: string; ad: string; soyad: string },
): Promise<void> {
  await gotoRetry(page, "/company/kayit");
  await page.getByLabel("Ad", { exact: true }).fill(opts.ad);
  await page.getByLabel("Soyad").fill(opts.soyad);
  await page.getByLabel("Kurumsal e-posta").fill(opts.email);
  await page.getByLabel("Telefon").fill("0555 111 22 33");
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
 * Firma kategori penceresini açar, ARAR, sonuçlardan bir SINIF satırını
 * işaretler ve onaylar. "Faaliyet alanı" adımında çağrılır.
 *
 * NEDEN "PENCEREDEKİ İLK ONAY KUTUSU" DEĞİL (inceleme CAT-R2, 2026-10-08):
 * firma beyanında sektör satırı da onay kutusu taşır (kutu = sektörün TAMAMI)
 * ve sektör listesi pencere açılmadan önbellektedir. Eski adım terimi yazıp
 * `dialog.getByRole("checkbox").first()`e tıklıyordu: arama 300 ms gecikmeyle
 * başladığı için bulunan kutu sonuç değil, kapalı AĞACIN ilk sektörüydü. Hangi
 * terim yazılırsa yazılsın firma aynı sektörün tamamını beyan ediyor
 * (`subIds` boş), ara-sonra-seç adımı hiç sınanmıyordu; akış yine tamamlandığı
 * için hiçbir şey kırmızıya dönmüyordu.
 *
 * Bu yüzden iki şey açıkça yapılır:
 *  1. SONUÇ BEKLENİR ve bir sonuç satırı işaretlenir. Sonuç ağacı iç içe
 *     listedir (sektör › aile › sınıf › emtia); üçüncü düzeydeki ilk kutu bir
 *     SINIF satırıdır. Kapalı ağaçta iç içe liste yoktur → bu konum yalnız
 *     sonuçlar çizilince eşleşir, bekleme kendiliğinden olur. (DOM sözleşmesi
 *     yerelde `category-selector-modal.test.tsx` "e2e sözleşmesi" testiyle
 *     kilitli — bu dosya yerelde koşulamaz.)
 *  2. İşaretin sektör ALTINDAN bir seçim olduğu doğrulanır: sektör işareti
 *     "Ürün / hizmet" sayacına girmez. Sayaç 1 değilse adım kırmızıya döner.
 */
export async function kategoriAraVeSec(page: Page, terim: string): Promise<void> {
  await page.getByRole("button", { name: /Ürün \/ hizmet (seçin|ekle)/ }).first().click();
  const pencere = page.getByRole("dialog");
  const kategoriAra = pencere.getByPlaceholder(/Kategori ara/);
  await expect(kategoriAra).toBeVisible({ timeout: 15_000 });
  await kategoriAra.fill(terim);
  const sinifKutusu = pencere.locator("ul ul ul").getByRole("checkbox").first();
  // Artık gerçekten arama yanıtı beklenir (eski adım beklemiyordu) → süre geniş.
  await expect(sinifKutusu, `"${terim}" araması sınıf düzeyinde sonuç getirdi`).toBeVisible({ timeout: 30_000 });
  await sinifKutusu.click();
  await expect(sinifKutusu).toHaveAttribute("aria-checked", "true");
  await expect(
    pencere.getByText(/^Ürün \/ hizmet 1\/\d+$/),
    "sektörün tamamı değil, sektör altından tek seçim",
  ).toBeVisible();
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
  // Ülke ilk alandır ve kayıt telefonunun ülkesiyle (Türkiye) açılır; hukuki
  // yapı listesi, vergi alanları ve adres ona göre çizilir. Türkiye'de hukuki
  // yapı genel listeden seçilir (Limited / Anonim / Şahıs / Diğer).
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
  // KATEGORİ SEÇİCİ TEK SORU SORAR (2026-09-14): eski "Sektör seçmek için
  // tıklayın" (L1 modalı) kalktı; boş durumda "Ürün / hizmet seçin" düğmesi
  // CategorySelectorModal'ı açar. Bu yardımcı 2026-09-16 RLS turunda eski
  // metinle kırıldı (staging-signup + prod-journey aynı yardımcıyı kullanır).
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
