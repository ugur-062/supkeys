import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession, daysFromNow } from "./staging-helpers";

/**
 * FİRMALAR ARASI YALITIM (IDOR) + KENDİ SATIRINI DÜZENLEYEMEME.
 *
 * Yetki matrisi "hangi rol hangi ucu açar"ı ölçer; buradaki soru farklı:
 * DOĞRU role sahip bir kullanıcı, BAŞKA FİRMANIN kaydını id'sini bilerek
 * açabiliyor mu? Kayıtlar gerçek: her firma kendi kaydını oluşturur, karşı
 * firma id ile dener. Beklenen: 403/404 (veri sızmaz).
 */
test.describe.configure({ mode: "serial" });

const CATEGORY = "10101500";
const isDenied = (status: number) => status === 403 || status === 404;

test("başka firmanın talebi, siparişi, ürünü, adresi ve kullanıcısı id ile açılamaz", async () => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36).toUpperCase();

  const buyer = await apiSession(QA.aliciSatinalmaci);
  const seller = await apiSession(QA.tedarikciKurucu);
  const outsider = await apiSession(QA.tedarikci2Kurucu); // üçüncü firma: hiçbir ilişkisi yok

  // ── Alıcı firmanın kayıtları ────────────────────────────────────────
  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT",
    title: `QA Yalıtım Depo ${stamp}`,
    addressLine: "Organize Sanayi 4. Cadde No 11",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  expect(addr.status).toBeLessThan(300);
  const addressId: string = addr.body.id;

  // TASLAK talep: yalnız SAHİBİNE açık. (PRIVATE seçilmedi çünkü davetli
  // firma ZORUNLU ve davet bağlantı ister — yalıtım sınamasına gereksiz
  // kurulum ekler; taslak aynı soruyu daha keskin sorar.)
  const priv = await apiPost(buyer, "/company/listings", {
    asDraft: true,
    type: "ALIM",
    format: "RFQ",
    title: `QA Taslak Talep ${stamp}`,
    description: "Yayınlanmamış taslak — yalnız sahibi görebilmeli (yalıtım sınaması).",
    visibility: "PUBLIC",
    categoryIds: [CATEGORY],
    deliveryAddressId: addressId,
    closesAt: daysFromNow(5),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [{ name: "Gizli Kalem", quantity: 10, unit: "adet" }],
  });
  expect(priv.status, JSON.stringify(priv.body)).toBeLessThan(300);
  const privateId: string = priv.body.id;

  // ── Tedarikçi firmanın kaydı: ürün ──────────────────────────────────
  const product = await apiPost(seller, "/company/items/product", {
    name: `QA Yalıtım Ürünü ${stamp}`,
    categoryId: CATEGORY,
    description:
      "Yalıtım sınaması için oluşturulan QA ürünü; başka firmanın id ile erişemediğini doğrular. Staging kaydı.",
    unit: "adet",
  });
  expect(product.status, JSON.stringify(product.body)).toBeLessThan(300);
  const productId: string = product.body.id;

  // ── Çapraz erişim denemeleri ────────────────────────────────────────
  const cases: Array<{ ad: string; res: { status: number; body: unknown } }> = [
    { ad: "tedarikçi → alıcının TASLAK talebi", res: await apiGet(seller, `/company/listings/${privateId}`) },
    { ad: "üçüncü firma → alıcının TASLAK talebi", res: await apiGet(outsider, `/company/listings/${privateId}`) },
    { ad: "üçüncü firma → tedarikçinin ürün vitrini", res: await apiGet(outsider, `/company/items/${productId}/showcase`) },
    { ad: "alıcı → tedarikçinin ürün vitrini", res: await apiGet(buyer, `/company/items/${productId}/showcase`) },
  ];
  for (const c of cases) {
    expect(isDenied(c.res.status), `${c.ad} → ${c.res.status} ${JSON.stringify(c.res.body).slice(0, 160)}`).toBe(true);
  }

  // Adres: başka firma id ile güncelleyemez (PATCH gövdesiz bile kapıyı geçemez).
  const foreignAddr = await apiPost(outsider, `/company/addresses/${addressId}/set-default`, {});
  expect([403, 404, 405]).toContain(foreignAddr.status);

  // Sipariş: taraf olmayan firma göremez.
  const orders = await apiGet(buyer, "/company/orders");
  const anyOrder = (orders.body as Array<{ id: string }>)[0];
  if (anyOrder) {
    const foreign = await apiGet(outsider, `/company/orders/${anyOrder.id}`);
    expect(isDenied(foreign.status), `üçüncü firma → sipariş ${foreign.status}`).toBe(true);
  }

  // Ürün listesi sızıntısı: alıcının kendi kataloğunda tedarikçinin ürünü YOK.
  const myItems = await apiGet(buyer, "/company/items");
  expect(JSON.stringify(myItems.body)).not.toContain(productId);
});

test("kimse kendi yetki satırını düzenleyemez; kullanıcı yönetimi firma dışına çıkmaz", async () => {
  test.setTimeout(180_000);
  const manager = await apiSession(QA.aliciYonetici);
  const me = await apiGet(manager, "/company-auth/me");
  const selfId: string = me.body.user.id;

  // Kendi satırı: yetki yazma reddedilir (Kurucu değil).
  const selfWrite = await apiPost(manager, `/company/users/${selfId}/permissions`, { permissions: ["users:manage"] });
  // PUT ucu; POST desteklenmiyorsa 404/405 döner — asıl sınama aşağıdaki PUT.
  expect([400, 403, 404, 405]).toContain(selfWrite.status);

  const s = manager;
  const put = await s.ctx.put(`company/users/${selfId}/permissions`, {
    data: { permissions: ["users:manage", "buy:view"] },
    headers: { "X-CSRF-Token": s.csrf },
  });
  const text = await put.text();
  expect(put.status(), `kendi satırı PUT → ${text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
  expect(text).toContain("Kendi yetkilerinizi düzenleyemezsiniz");

  // Başka firmanın kullanıcısı: id ile yönetilemez.
  const other = await apiSession(QA.tedarikciSatisci);
  const otherMe = await apiGet(other, "/company-auth/me");
  const otherId: string = otherMe.body.user.id;
  const cross = await s.ctx.put(`company/users/${otherId}/permissions`, {
    data: { permissions: ["buy:view"] },
    headers: { "X-CSRF-Token": s.csrf },
  });
  expect([403, 404]).toContain(cross.status());
});
