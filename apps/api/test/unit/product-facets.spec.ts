import {
  contextualFacetCounts,
  employeeValuesFor,
  priceHistogram,
  type ProductFacetRow,
} from "../../src/common/company/product-index";
import { employeeBucket } from "@rothern/shared";

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
  company: {
    city: "İstanbul",
    activities: ["MANUFACTURER"],
    companyVerificationStatus: "VERIFIED",
    certifications: [],
    employeeCount: null,
    ...o.company,
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
    expect(f.cities.find((c) => c.city === "İzmir")?.count).toBe(1);
    // Çalışan da daralır → 250+ kalmaz.
    expect(f.employees.find((e) => e.key === 250)).toBeUndefined();
  });

  it("çalışan sayacı kendi seçimini hariç tutar", () => {
    const f = contextualFacetCounts(rows, { employees: "50" });
    expect(f.employees.map((e) => e.key).sort((a, b) => a - b)).toEqual([10, 50, 250]);
    // Şehir çalışan seçimiyle daralır: yalnız 50-249'luk firma kalır.
    expect(f.cities).toEqual([{ city: "İstanbul", count: 1 }]);
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

  it("fiyatsız (ON_REQUEST) ürünler histograma girmez", () => {
    const rows = [row({ priceAmount: 100 }), row({ priceAmount: 900 }), row({ priceMode: "ON_REQUEST", priceAmount: null })];
    expect(priceHistogram(rows)!.buckets.reduce((a, b) => a + b.count, 0)).toBe(2);
  });
});
