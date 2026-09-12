import { expect, request, test } from "@playwright/test";
import { API, PASSWORD, QA, WEB, apiSession } from "./staging-helpers";

/**
 * SİTELER ARASI İSTEK (CSRF) SAVUNMASI (2026-09-12).
 *
 * Üretimde çerez `SameSite=none` (kod varsayılanı) ve o modda double-submit
 * guard KOMPLE devre dışı — bunu projenin kendi `csrf-guard.spec` testi
 * "kapatılması gereken açık" diye BELGELİYOR. Geriye kalan savunma iki katman:
 *   1. API yalnız JSON gövde okur (urlencoded/text parser BİLEREK kaldırıldı),
 *      yani saldırganın form POST'u gövdesiz kalır;
 *   2. JSON içerik tipi ön-uçuş (preflight) zorunlu kılar, CORS beyaz listesi
 *      yabancı köken reddeder.
 * Bu test o iki katmanı CANLI staging'de kanıtlar. Katman düşerse kırmızı olur.
 */
test("yabancı köken: ön-uçuş reddedilir", async () => {
  const ctx = await request.newContext();
  const res = await ctx.fetch(`${API}/company-auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://kotu-site.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const allow = res.headers()["access-control-allow-origin"];
  expect(allow ?? "", `yabancı kökene izin verilmemeli (allow=${allow})`).not.toContain("kotu-site.example");
  await ctx.dispose();
});

test("basit içerik tipleri gövde taşımaz: form ve düz metin POST iş yapamaz", async () => {
  const s = await apiSession(QA.aliciSatinalmaci);
  const cookies = (await s.ctx.storageState()).cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const raw = await request.newContext();

  // Ön-uçuş GEREKTİRMEYEN içerik tipleri — CSRF saldırısının tek yolu bunlar.
  for (const contentType of ["application/x-www-form-urlencoded", "text/plain"]) {
    const res = await raw.fetch(`${API}/company/addresses`, {
      method: "POST",
      headers: { "Content-Type": contentType, Cookie: cookies, Origin: "https://kotu-site.example" },
      data: JSON.stringify({ type: "TESLIMAT", title: "CSRF denemesi", addressLine: "x", city: "İstanbul", country: "TR" }),
    });
    expect(
      res.status(),
      `${contentType} ile kayıt oluşturulabiliyor (CSRF açığı): ${res.status()}`,
    ).toBeGreaterThanOrEqual(400);
  }
  await raw.dispose();
});

test("oturum var ama CSRF başlığı yok: mutasyon reddedilir (SameSite=lax ortamı)", async () => {
  const s = await apiSession(QA.aliciSatinalmaci);
  const res = await s.ctx.post("company/addresses", {
    data: { type: "TESLIMAT", title: "CSRF başlıksız", addressLine: "x", city: "İstanbul", country: "TR" },
    // X-CSRF-Token BİLEREK yok.
  });
  // Staging COOKIE_SAMESITE=lax → double-submit guard aktif, 403 beklenir.
  // Üretimde `none` olduğu için guard baypas; o yüzden bu test ORTAMA bağlıdır
  // ve asıl koruma yukarıdaki iki katmandır.
  expect([400, 403]).toContain(res.status());
});

test("giriş ucu yabancı kökenden çağrılsa bile çerez üçüncü tarafa yazılmaz", async () => {
  const raw = await request.newContext();
  const res = await raw.post(`${API}/company-auth/login`, {
    headers: { "Content-Type": "application/json", Origin: "https://kotu-site.example" },
    data: { email: QA.aliciSatinalmaci, password: PASSWORD },
  });
  const allow = res.headers()["access-control-allow-origin"] ?? "";
  expect(allow, "yanıt yabancı kökene açılmamalı").not.toContain("kotu-site.example");
  expect(allow === "" || allow === WEB).toBe(true);
  await raw.dispose();
});
