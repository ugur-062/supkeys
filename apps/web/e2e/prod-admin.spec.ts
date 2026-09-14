import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, API, adminContext, adminUiLogin, gotoRetry } from "./staging-helpers";

/**
 * ⚠️ CANLI ADMIN REALM — yalnız `scripts/e2e-prod.sh` ile ve ELLE koşulur.
 *
 * NEDEN AYRI: admin İKİNCİ bir auth realm'i. Ayrı alan adı
 * (`admin.rothern.com`), ayrı çerezler (`rk_admin` / `rk_admin_csrf`), ayrı
 * token tipi. Firma tarafının canlıda çalışması admin tarafının da çalıştığını
 * KANITLAMAZ — iki ayrı yapılandırma.
 *
 * NEDEN ÖNEMLİ: admin KRİTİK YOLDA. Müşterinin eklediği ürün admin onaylamadan
 * vitrine ÇIKMAZ. Admin girişi canlıda bozuksa ilk müşterinin ürünü hiç
 * yayınlanmaz ve bu ancak müşteri şikâyet edince fark edilir.
 *
 * 2026-09-14'te veritabanından görüldü: canlı admin paneline ~6 haftadır
 * kimse girmemişti ve hiçbir otomatik kontrol oraya bakmıyordu.
 *
 * SALT OKUMA: hiçbir yazma yapmaz, temizlenecek veri bırakmaz. Ürün onayının
 * İŞ MANTIĞI staging paketinde (`staging-sales-chain`) sınanıyor; buradaki
 * soru yalnız "canlı yapılandırma ayakta mı".
 */
test.describe.configure({ mode: "serial" });

test("canlı admin: giriş, çerez alanı, onay kuyruğu", async ({ browser }) => {
  test.setTimeout(180_000);
  expect(ADMIN_PASSWORD, "E2E_ADMIN_PASSWORD (.env.prod.local INITIAL_ADMIN_PASSWORD)").not.toBe("");

  const ctx = await adminContext(browser);
  const page = await ctx.newPage();

  // ── 1. Giriş ────────────────────────────────────────────────────────
  await adminUiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // ── 2. Çerezler ANA alan adında mı ─────────────────────────────────
  // `.rothern.com` olmazsa admin arayüzü `rk_admin_csrf`i okuyamaz ve her
  // yazma işlemi 403 olur — firma tarafında yaşanan hatanın admin ikizi.
  const cerezler = await ctx.cookies();
  const oturum = cerezler.find((c) => c.name === "rk_admin");
  const csrf = cerezler.find((c) => c.name === "rk_admin_csrf");
  expect(oturum, "rk_admin çerezi").toBeTruthy();
  expect(csrf, "rk_admin_csrf çerezi").toBeTruthy();
  expect(csrf!.domain, "admin çerezi ANA alan adında").toMatch(/^\.?rothern\.com$/);
  // Firma realm'inin çerezi admin realm'ine SIZMAMALI (çapraz token = 401).
  expect(cerezler.find((c) => c.name === "rk_company"), "firma çerezi admin bağlamında YOK").toBeFalsy();

  // ── 3. Kimlik ucu ──────────────────────────────────────────────────
  const me = await page.request.get(`${API.replace(/\/?$/, "/")}admin/auth/me`);
  expect(me.status(), "admin /me").toBe(200);

  // ── 3b. OTURUM ÖMRÜ: çerez ile JETON aynı fikirde mi? ──────────────
  /**
   * "Oturumu açık bırak" ÇEREZİ uzatıyor ama JETONU uzatmıyor olabilir.
   * Çerez 30 gün yaşarken jeton 1 saatte ölürse kullanıcı ertesi gün
   * döndüğünde çerez duruyor, içi geçersiz — ve girişe atılıyor. Kullanıcı
   * "her seferinde yeniden giriyorum" diyor; ölçüm bunu yanıtlamalı.
   *
   * Burada İDDİA YOK, RAPOR var: canlı değeri görmeden eşik koymak yanlış
   * olur. Çıktı koşum günlüğüne düşer.
   */
  const jeton = cerezler.find((c) => c.name === "rk_admin")!;
  const govde = jeton.value.split(".")[1] ?? "";
  const cozulmus = JSON.parse(
    Buffer.from(govde.padEnd(govde.length + ((4 - (govde.length % 4)) % 4), "="), "base64url").toString(),
  ) as { iat?: number; exp?: number; persistent?: boolean };
  const jetonSaat = cozulmus.exp && cozulmus.iat ? (cozulmus.exp - cozulmus.iat) / 3600 : 0;
  const cerezSaat = jeton.expires > 0 ? (jeton.expires - Date.now() / 1000) / 3600 : 0;
  console.log(
    `   ⓘ oturum ömrü — jeton ${jetonSaat.toFixed(1)} sa · çerez ${cerezSaat.toFixed(1)} sa · persistent=${cozulmus.persistent}`,
  );
  console.log(
    jetonSaat > 0 && cerezSaat > jetonSaat * 1.5
      ? `   ⚠️ ÇEREZ JETONDAN ${(cerezSaat / jetonSaat).toFixed(0)}× UZUN — kullanıcı jeton ölünce girişe atılır`
      : "   ✓ çerez ve jeton ömrü uyumlu",
  );

  // ── 4. Ürün onay kuyruğu açılıyor mu ───────────────────────────────
  // Müşterinin ürünü bu ekrandan vitrine çıkıyor; ekran açılmıyorsa zincir kopuk.
  await gotoRetry(page, "/admin/urunler");
  await expect(page.locator("body")).toContainText(/Ürün|Onay/i, { timeout: 45_000 });

  // ── 5. Firma listesi ───────────────────────────────────────────────
  // Firma doğrulama (KYC) buradan yapılıyor — ikinci kritik admin ekranı.
  await gotoRetry(page, "/admin/firmalar");
  await expect(page.locator("body")).toContainText(/Firma/i, { timeout: 45_000 });

  await ctx.close();
});
