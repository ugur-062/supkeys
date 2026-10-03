import { expect, request, test } from "@playwright/test";
import { API, QA, apiSession } from "./staging-helpers";

/**
 * PERFORMANS KANARYASI (2026-09-12) — yük testi DEĞİL, REGRESYON kapısı.
 *
 * Tekrarlanabilir bir ölçüm yoktu: bir sorgu N+1'e dönse ya da bir sayfa
 * dinamiğe düşse kimse fark etmezdi. Burada ana yüzeyler birkaç kez ölçülür,
 * p90 cömert bir bütçeyle karşılaştırılır. Amaç "hızlı mı" değil, "dün gibi
 * mi" sorusuna cevap. Staging ücretsiz/starter kademede; eşikler ona göre.
 *
 * ÖRNEK SAYISI (2026-10-03): 5 ölçümde "p95" = en kötü ölçümdü; her koşuda
 * başka bir uçta çıkan TEK ~3,2 sn'lik sıçrama (bağlantı/örnek gecikmesi)
 * bütçeyi kırıyordu. Artık 9 ölçüm alınır ve kapı p90'dır: sıralı dizide
 * ikinci en kötü değer, yani tek aykırı ölçüm atılır. İki ve daha fazla yavaş
 * ölçüm yine kırar (sistematik yavaşlık). Bütçeler DEĞİŞMEDİ.
 */
const TUR = 9;
// Bütçeler CÖMERT: amaç gecikme taahhüdü değil, kaba regresyon. Render soğuk
// başlarken sağlık ucu 1,5 sn'yi aştı ve testi kırdı — eşik ürün gerçeğine
// değil, ölçüm gürültüsüne takılıyordu.

async function ölç(fn: () => Promise<number>): Promise<{ p50: number; p90: number; en_kötü: number }> {
  const ms: number[] = [];
  for (let i = 0; i < TUR; i++) {
    const t = Date.now();
    const status = await fn();
    expect(status, "istek başarısız").toBeLessThan(400);
    ms.push(Date.now() - t);
  }
  ms.sort((a, b) => a - b);
  // p90 = en kötü tek ölçüm atıldıktan sonraki en büyük değer (9 örnekte 8.).
  return { p50: ms[Math.floor(TUR / 2)]!, p90: ms[TUR - 2]!, en_kötü: ms[TUR - 1]! };
}

test("herkese açık sayfalar ve API listeleri bütçe içinde", async () => {
  test.setTimeout(300_000);
  const raw = await request.newContext({
    extraHTTPHeaders: process.env.PLAYWRIGHT_VERCEL_BYPASS
      ? { "x-vercel-protection-bypass": process.env.PLAYWRIGHT_VERCEL_BYPASS, "x-vercel-set-bypass-cookie": "true" }
      : {},
  });
  const s = await apiSession(QA.aliciKurucu);

  const hedefler: Array<{ ad: string; bütçe: number; çalıştır: () => Promise<number> }> = [
    { ad: "anasayfa", bütçe: 3_000, çalıştır: async () => (await raw.get(`${process.env.PLAYWRIGHT_BASE_URL ?? "https://staging.supkeys.com"}/`)).status() },
    { ad: "ürün dizini", bütçe: 4_000, çalıştır: async () => (await raw.get(`${process.env.PLAYWRIGHT_BASE_URL ?? "https://staging.supkeys.com"}/urunler`)).status() },
    { ad: "firma dizini", bütçe: 4_000, çalıştır: async () => (await raw.get(`${process.env.PLAYWRIGHT_BASE_URL ?? "https://staging.supkeys.com"}/firmalar`)).status() },
    { ad: "API sağlık", bütçe: 3_000, çalıştır: async () => (await raw.get(`${API}/health`)).status() },
    { ad: "taleplerim", bütçe: 3_000, çalıştır: async () => (await s.ctx.get("company/listings/tenders")).status() },
    { ad: "siparişler", bütçe: 3_000, çalıştır: async () => (await s.ctx.get("company/orders")).status() },
    { ad: "ürün keşfi", bütçe: 3_500, çalıştır: async () => (await s.ctx.get("company/items/discover")).status() },
    { ad: "firma dizini (panel)", bütçe: 3_500, çalıştır: async () => (await s.ctx.get("company/directory")).status() },
  ];

  const satırlar: string[] = [];
  const aşanlar: string[] = [];
  for (const h of hedefler) {
    const r = await ölç(h.çalıştır);
    satırlar.push(
      `${h.ad.padEnd(20)} p50=${String(r.p50).padStart(5)}ms  p90=${String(r.p90).padStart(5)}ms  en kötü=${String(r.en_kötü).padStart(5)}ms  bütçe=${h.bütçe}ms`,
    );
    if (r.p50 > h.bütçe) aşanlar.push(`${h.ad}: p50 ${r.p50}ms > ${h.bütçe}ms`);
    if (r.p90 > h.bütçe) aşanlar.push(`${h.ad}: p90 ${r.p90}ms > ${h.bütçe}ms (en kötü ${r.en_kötü}ms)`);
  }
  console.log("\n" + satırlar.join("\n"));
  expect(aşanlar, aşanlar.join("\n")).toEqual([]);
  await raw.dispose();
});

test("eşzamanlı 10 istek altında dizin ucu çökmez", async () => {
  test.setTimeout(180_000);
  const s = await apiSession(QA.aliciKurucu);
  const başlangıç = Date.now();
  const sonuçlar = await Promise.all(Array.from({ length: 10 }, () => s.ctx.get("company/directory")));
  const süre = Date.now() - başlangıç;
  const kodlar = sonuçlar.map((r) => r.status());
  expect(kodlar.every((c) => c < 400), `eşzamanlı istek kodları: ${kodlar.join(",")}`).toBe(true);
  console.log(`   10 eşzamanlı dizin isteği: ${süre}ms`);
  expect(süre, "10 eşzamanlı istek toplamda makul sürede bitmeli").toBeLessThan(20_000);
});
