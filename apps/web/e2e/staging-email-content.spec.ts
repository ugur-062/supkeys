import { expect, test } from "@playwright/test";
import { WEB, apiGet, apiPost, apiSession, QA, daysFromNow } from "./staging-helpers";
import { closeDb, db } from "./db-helpers";

/**
 * E-POSTA İÇERİĞİ (2026-09-12) — şimdiye kadar yalnız "kaç tane gitti, kaçı
 * başarısız" sayılıyordu. İçerik hiç okunmadı. En pahalı hata sınıfı burada:
 * CANLI e-postanın staging adresine (ya da tersine) bağlantı vermesi. Müşteri
 * tıklar, yanlış ortama düşer; kimse fark etmez.
 *
 * Kapsam: son gönderimlerde bağlantı konağı, boş/eksik alan, yerine konmamış
 * şablon yer tutucusu ve başarısız gönderim.
 */
test.afterAll(async () => closeDb());

const PLACEHOLDER = /\{\{|\$\{|\bundefined\b|\bnull\b|\[object Object\]/;

test("son e-postalar: bağlantılar DOĞRU ortama gider, içerik eksiksiz", async () => {
  test.setTimeout(300_000);

  // Taze bir e-posta üret: sipariş/teklif akışı tetiklenmeden log bayat olabilir.
  const buyer = await apiSession(QA.aliciSatinalmaci);
  const stamp = Date.now().toString(36).toUpperCase();
  const addr = await apiPost(buyer, "/company/addresses", {
    type: "TESLIMAT", title: `QA Posta ${stamp}`, addressLine: "Sanayi Cad. 4",
    city: "İstanbul", district: "Tuzla", country: "TR",
  });
  const listing = await apiPost(buyer, "/company/listings", {
    type: "ALIM", format: "RFQ", title: `QA Posta Talebi ${stamp}`,
    description: "E-posta içeriği doğrulaması için açılan QA talebi.",
    visibility: "PUBLIC", categoryIds: ["10101500"], deliveryAddressId: addr.body.id,
    closesAt: daysFromNow(4), primaryCurrency: "TRY", allowedCurrencies: ["TRY"],
    items: [{ name: "Posta Kalemi", quantity: 5, unit: "adet" }],
  });
  const id: string = listing.body.id;
  if (listing.body.status === "DRAFT") await apiPost(buyer, `/company/listings/${id}/publish`);
  const items = (await apiGet(buyer, `/company/listings/${id}`)).body.items as Array<{ id: string }>;
  const seller = await apiSession(QA.tedarikciSatisci);
  await apiPost(seller, `/company/listings/${id}/bids`, {
    items: [{ itemId: items[0]!.id, unitPrice: 90 }], currency: "TRY", deliveryTime: "W1_2", validityDays: 30,
  });
  await new Promise((r) => setTimeout(r, 3_000)); // gönderim eşzamanlı ama log yazımı için küçük pay

  const since = new Date(Date.now() - 6 * 3600_000);
  const rows = await db().emailLog.findMany({
    where: { queuedAt: { gte: since } },
    select: { template: true, subject: true, status: true, payload: true, toEmail: true, errorMessage: true },
    orderBy: { queuedAt: "desc" },
    take: 60,
  });
  expect(rows.length, "son 6 saatte e-posta üretilmiş olmalı").toBeGreaterThan(0);

  const host = new URL(WEB).host; // staging.rothern.com
  const sorunlar: string[] = [];

  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const etiket = `${r.template} → ${r.toEmail.replace(/@.*/, "@…")} "${r.subject ?? ""}"`;

    if (r.status === "FAILED") sorunlar.push(`BAŞARISIZ ${etiket}: ${r.errorMessage ?? ""}`);
    if (!r.subject || r.subject.trim().length < 3) sorunlar.push(`konu boş: ${etiket}`);

    /**
     * Hassas e-postalar (doğrulama kodu, şifre sıfırlama jetonu) günlüğe
     * GÖVDESİZ yazılır — `{ __redacted: … }`. Bu bir eksiklik değil, KURAL:
     * burada içerik aranmaz, aksine sızıntı olmadığı doğrulanır.
     */
    if ("__redacted" in p) {
      const anahtarlar = Object.keys(p);
      if (anahtarlar.length !== 1) sorunlar.push(`gizlenmiş kayıtta fazladan alan: ${etiket} → ${anahtarlar.join(",")}`);
      continue;
    }
    if (/kod|jeton|token|şifre|parola/i.test(r.subject ?? "")) {
      sorunlar.push(`hassas e-posta gizlenmemiş: ${etiket}`);
    }

    const metin = JSON.stringify(p);
    if (PLACEHOLDER.test(metin)) sorunlar.push(`yerine konmamış yer tutucu / boş değer: ${etiket}`);

    const cta = typeof p.ctaUrl === "string" ? p.ctaUrl : null;
    if (cta) {
      let u: URL | null = null;
      try {
        u = new URL(cta);
      } catch {
        sorunlar.push(`geçersiz bağlantı: ${etiket} → ${cta}`);
      }
      if (u) {
        if (u.protocol !== "https:") sorunlar.push(`bağlantı https değil: ${etiket} → ${cta}`);
        if (u.host !== host) sorunlar.push(`bağlantı YANLIŞ ortama gidiyor (beklenen ${host}): ${etiket} → ${u.host}`);
        if (!p.ctaLabel) sorunlar.push(`bağlantı var ama etiketi yok: ${etiket}`);
      }
    }
    const paragraflar = Array.isArray(p.paragraphs) ? (p.paragraphs as unknown[]) : [];
    if (paragraflar.length === 0) sorunlar.push(`gövde boş: ${etiket}`);
    if (paragraflar.some((x) => typeof x !== "string" || x.trim() === "")) sorunlar.push(`boş paragraf: ${etiket}`);
  }

  expect(sorunlar, `${rows.length} e-posta tarandı\n${sorunlar.join("\n")}`).toEqual([]);
});
