import {
  contextualFacetCounts,
  employeeValuesFor,
  priceHistogram,
  productIndexWhere,
  type ProductFacetRow,
} from "../../src/common/company/product-index";
import { FAST_REPLY_HOURS, medianFirstReplyHours, roundReplyHours } from "../../src/common/company/reply-time";
import { employeeBucket } from "@rothern/shared";
import { resolveCityId } from "../../src/common/geo/geo-index";

/**
 * SÜZGEÇ SAYAÇLARI — SAF mantık (2026-09-07 grupları).
 *
 * Bu dosya DB'ye dokunmaz: kova sınırları, bağlama duyarlı sayım ve histogram
 * kovalaması saf fonksiyonlar. Aynı kurallar `public-product-index.spec.ts`te
 * gerçek sorguyla da doğrulanıyor — buradaki hızlı geri bildirim için.
 */
const row = (o: Partial<ProductFacetRow> & { company?: Partial<ProductFacetRow["company"]> } = {}): ProductFacetRow => ({
  categoryId: "39121000",
  priceMode: "FIXED",
  moq: null,
  priceAmount: null,
  ...o,
  // TRY ürünlerde taban = tutar (2026-09-27: histogram TRY karşılığından).
  priceAmountBase: o.priceAmountBase !== undefined ? o.priceAmountBase : (o.priceAmount ?? null),
  company: {
    city: "İstanbul",
    activities: ["MANUFACTURER"],
    companyVerificationStatus: "VERIFIED",
    certifications: [],
    employeeCount: null,
    medianReplyHours: null,
    ...o.company,
    // Gerçek satır gibi şehirden dünya şehir listesi kaydı (2026-09-27).
    cityId: o.company?.cityId !== undefined ? o.company.cityId : resolveCityId("TR", o.company?.city ?? "İstanbul"),
  },
});

describe("employeeBucket — serbest metin → kova", () => {
  it("aralık metnini ALT SINIRA göre kovalar", () => {
    expect(employeeBucket("1-9")).toBe(1);
    expect(employeeBucket("10-49")).toBe(10);
    expect(employeeBucket("50-249")).toBe(50);
    expect(employeeBucket("250+")).toBe(250);
    // Eski serbest metin biçimleri.
    expect(employeeBucket("50-100")).toBe(50);
    expect(employeeBucket("250-500")).toBe(250);
    expect(employeeBucket("500-1000")).toBe(250);
    // "10-50" İKİ kovaya yayılır; alt sınır kazanır (bilinçli yaklaşıklık).
    expect(employeeBucket("10-50")).toBe(10);
  });

  it("sayı içermeyen ya da anlamsız metin hiçbir kovaya girmez", () => {
    expect(employeeBucket("bilinmiyor")).toBeNull();
    expect(employeeBucket("")).toBeNull();
    expect(employeeBucket(null)).toBeNull();
    expect(employeeBucket("0")).toBeNull();
  });

  it("binlik ayracı yutulur — '1.200 kişi' 250+ olmalı", () => {
    expect(employeeBucket("1.200 kişi")).toBe(250);
  });

  it("employeeValuesFor seçili kovaya düşen HAM dizeleri döner", () => {
    const distinct = ["10-49", "50-100", "250-500", "bilinmiyor"];
    expect(employeeValuesFor(distinct, "50")).toEqual(["50-100"]);
    expect(employeeValuesFor(distinct, "10,250").sort()).toEqual(["10-49", "250-500"]);
    // Seçim yoksa hiçbir şey eşlenmez (çağıran `where`e koşul EKLEMEZ).
    expect(employeeValuesFor(distinct, undefined)).toEqual([]);
  });
});

describe("contextualFacetCounts — yeni boyutlar", () => {
  const rows = [
    row({ company: { certifications: ["ISO 9001", "CE"], employeeCount: "50-249", city: "İstanbul" } }),
    row({ company: { certifications: ["ISO 9001"], employeeCount: "10-49", city: "İzmir" } }),
    row({ company: { certifications: [], employeeCount: "250+", city: "İzmir" } }),
  ];

  it("sertifika sayacı KENDİ seçimini hariç tutar, diğer boyutları daraltır", () => {
    const f = contextualFacetCounts(rows, { cert: "ISO 9001" });
    // Kendi boyutu hariç → CE hâlâ sayılır.
    expect(f.certifications.find((c) => c.cert === "CE")?.count).toBe(1);
    // Şehir sertifikayla daralır → sertifikasız üçüncü satır düşer.
    expect(f.cities.find((c) => c.city === "izmir")?.count).toBe(1);
    // Çalışan da daralır → 250+ kalmaz.
    expect(f.employees.find((e) => e.key === 250)).toBeUndefined();
  });

  it("çalışan sayacı kendi seçimini hariç tutar", () => {
    const f = contextualFacetCounts(rows, { employees: "50" });
    expect(f.employees.map((e) => e.key).sort((a, b) => a - b)).toEqual([10, 50, 250]);
    // Şehir çalışan seçimiyle daralır: yalnız 50-249'luk firma kalır.
    expect(f.cities).toEqual([{ city: "istanbul", name: "İstanbul", country: "TR", count: 1 }]);
  });

  it("sertifika serbest metni KIRPILIR ama normalize EDİLMEZ", () => {
    // Süzgeç ham dizeyle sorguluyor; küçük harfe indirseydik sayılan ile
    // eşleşen ayrışır ve kutucuk tıklanınca liste boşalırdı.
    const f = contextualFacetCounts(
      [row({ company: { certifications: ["  ISO 9001  "] } }), row({ company: { certifications: ["iso 9001"] } })],
      {},
    );
    expect(f.certifications.map((c) => c.cert).sort()).toEqual(["ISO 9001", "iso 9001"]);
  });

  it("MOQ sayaçları KÜMÜLATİF; MOQ'suz ürün her kovaya girer", () => {
    const f = contextualFacetCounts([row({ moq: 5 }), row({ moq: 50 }), row({ moq: null })], {});
    expect(f.moq["10"]).toBe(2);
    expect(f.moq["100"]).toBe(3);
    expect(f.moq["1000"]).toBe(3);
  });
});

describe("priceHistogram", () => {
  it("fiyatı yazılı 2'den az ürün varsa null", () => {
    expect(priceHistogram([])).toBeNull();
    expect(priceHistogram([row({ priceAmount: 100 })])).toBeNull();
    // Hepsi aynı fiyattaysa aralık yok → kova çizilemez.
    expect(priceHistogram([row({ priceAmount: 100 }), row({ priceAmount: 100 })])).toBeNull();
  });

  it("gerçek uçları döner ve HİÇBİR ürünü düşürmez", () => {
    const rows = [100, 200, 300, 400, 500, 600].map((p) => row({ priceAmount: p }));
    const h = priceHistogram(rows)!;
    expect(h.min).toBe(100);
    expect(h.max).toBe(600);
    expect(h.buckets.reduce((a, b) => a + b.count, 0)).toBe(6);
  });

  it("tek aykırı değer tüm çubukları ilk kovaya sıkıştırmaz", () => {
    // p5-p95 kovalanır: 4.000.000'luk tek ürün ölçeği bozmamalı.
    const rows = [...Array(20)].map((_, i) => row({ priceAmount: 100 + i * 10 }));
    rows.push(row({ priceAmount: 4_000_000 }));
    const h = priceHistogram(rows)!;
    expect(h.max).toBe(4_000_000);
    // Aykırı değer son kovaya taşar, kalanlar dağılır → dolu kova > 1.
    expect(h.buckets.filter((b) => b.count > 0).length).toBeGreaterThan(1);
    expect(h.buckets.reduce((a, b) => a + b.count, 0)).toBe(21);
  });

  it("KOVALAR LOG ÖLÇEKLİ: mertebeler arası dağılım tek çubuğa çökmez", () => {
    // Canlı bulgu: 3 ₺ – 465.000 ₺ aralığında doğrusal kovada ürünlerin
    // tamamı ilk çubuğa düşüyor, histogram hiçbir şey anlatmıyordu.
    const rows = [3, 12, 40, 90, 250, 700, 2_000, 6_000, 20_000, 60_000, 180_000, 465_000].map((p) =>
      row({ priceAmount: p }),
    );
    const h = priceHistogram(rows)!;
    const filled = h.buckets.filter((b) => b.count > 0).length;
    expect(filled).toBeGreaterThanOrEqual(6);
    // Hiçbir kova çoğunluğu yutmamalı.
    expect(Math.max(...h.buckets.map((b) => b.count))).toBeLessThan(rows.length / 2);
    // Kova sınırları artan ve çarpansal.
    expect(h.buckets.every((b, i) => i === 0 || b.from >= h.buckets[i - 1]!.from)).toBe(true);
  });

  it("quantiles ön ayar sınırları verir (doğrusal bölme DEĞİL)", () => {
    // Çarpık dağılım: 9 ucuz + 1 çok pahalı. Doğrusal bölmede ilk aralık
    // hepsini yutardı; üçte birlik sınır gerçek dağılımı izler.
    const rows = [10, 12, 14, 16, 18, 20, 22, 24, 26, 500_000].map((p) => row({ priceAmount: p }));
    const h = priceHistogram(rows)!;
    expect(h.quantiles.p33).toBeLessThan(h.quantiles.p66);
    expect(h.quantiles.p66).toBeLessThan(h.max);
    expect(h.quantiles.p66).toBeLessThan(1000);
  });

  it("arayüz testi O-016: her çubuğun sayısı = o çubuğa tıklayınca gelen liste (aykırı uçlar dahil)", () => {
    // p5–p95 dışındaki uçlar: eskiden ilk/son kovaya sayılıyor ama kovanın
    // sınırı kırpılmış aralıkta kalıyordu ("16 ürün" → 12 ürün).
    const prices = [1.5, 3, 9, 9.5, 12, 14, 17, 18, 20, 25, 33, 40, 55, 70, 90, 120, 140, 200, 300, 5_000, 80_000];
    const rows = prices.map((p) => row({ priceAmount: p }));
    const h = priceHistogram(rows)!;
    expect(h.min).toBe(1);
    expect(h.max).toBe(80_000);
    const where = (from: number, to: number) => productIndexWhere({ priceMin: from, priceMax: to });
    for (const b of h.buckets) {
      // Süzgeç kapalı aralık: `productIndexWhere` aynı sınırları gte/lte yazar.
      expect(JSON.stringify(where(b.from, b.to))).toContain(`"gte":${b.from}`);
      expect(JSON.stringify(where(b.from, b.to))).toContain(`"lte":${b.to}`);
      const listed = prices.filter((p) => p >= b.from && p <= b.to).length;
      expect(b.count).toBe(listed);
    }
    // Sınırlar artan, tam sayı; hiçbir ürün iki çubukta sayılmaz.
    expect(h.buckets.every((b, i) => Number.isInteger(b.from) && b.to > b.from && (i === 0 || b.from === h.buckets[i - 1]!.to))).toBe(true);
    expect(h.buckets.reduce((a, b) => a + b.count, 0)).toBe(prices.length);
  });

  it("arayüz testi D-074: ters aralık (min > max) yer değiştirir, boş liste vermez", () => {
    const json = JSON.stringify(productIndexWhere({ priceMin: 5000, priceMax: 100 }));
    expect(json).toContain('"gte":100');
    expect(json).toContain('"lte":5000');
  });

  it("iç kova sınırına TAM denk gelen fiyat iki çubukta birden sayılmaz", () => {
    // 100..290 (10'ar) dizisinde log sınırlarından biri 140'a yuvarlanıyor.
    const prices = [...Array(20)].map((_, i) => 100 + i * 10);
    const h = priceHistogram(prices.map((p) => row({ priceAmount: p })))!;
    const inner = h.buckets.slice(1).map((b) => b.from);
    expect(inner.some((e) => prices.includes(e))).toBe(false);
    expect(h.buckets.reduce((a, b) => a + b.count, 0)).toBe(prices.length);
  });

  it("fiyatsız (ON_REQUEST) ürünler histograma girmez", () => {
    const rows = [row({ priceAmount: 100 }), row({ priceAmount: 900 }), row({ priceMode: "ON_REQUEST", priceAmount: null })];
    expect(priceHistogram(rows)!.buckets.reduce((a, b) => a + b.count, 0)).toBe(2);
  });
});

describe("ilk yanıt süresi — 'Hızlı yanıt veren' altlığı", () => {
  const h = (n: number) => ({ createdAt: new Date(0), replies: [{ createdAt: new Date(n * 3_600_000) }] });

  it("ORTANCA döner; tek unutulmuş talep sonucu bozmaz", () => {
    // Ortalama olsaydı 300 saatlik tek talep ölçüyü 60'a çıkarırdı.
    expect(medianFirstReplyHours([h(1), h(2), h(3), h(4), h(300)])).toBe(3);
  });

  it("yanıtlanmamış talep hesaba GİRMEZ; hiç yanıt yoksa null (0 DEĞİL)", () => {
    expect(medianFirstReplyHours([{ createdAt: new Date(0), replies: [] }])).toBeNull();
    expect(medianFirstReplyHours([])).toBeNull();
    // "ölçüm yok" ile "anında yanıtlıyor" aynı şey değil.
    expect(medianFirstReplyHours([h(0)])).toBe(0);
  });

  it("roundReplyHours bir ondalık; null korunur", () => {
    expect(roundReplyHours(6.44)).toBe(6.4);
    expect(roundReplyHours(null)).toBeNull();
  });

  it("süzgeç: ölçüsü OLMAYAN firma 'hızlı' sayılmaz", () => {
    const rows = [
      row({ company: { medianReplyHours: 3 } }),
      row({ company: { medianReplyHours: FAST_REPLY_HOURS + 1 } }),
      row({ company: { medianReplyHours: null } }),
    ];
    expect(contextualFacetCounts(rows, {}).fastReply).toBe(1);
    // Kendi boyutunu hariç tutar: seçiliyken de aynı sayıyı verir.
    expect(contextualFacetCounts(rows, { fastReply: true }).fastReply).toBe(1);
    // Diğer boyutlar seçimle DARALIR.
    expect(contextualFacetCounts(rows, { fastReply: true }).cities[0]!.count).toBe(1);
  });
});
