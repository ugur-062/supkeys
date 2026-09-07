import {
  RADIUS_OPTIONS,
  TR_PROVINCES,
  haversineKm,
  provincesWithin,
  resolveProvince,
} from "@rothern/shared";

/**
 * İL KOORDİNAT TABLOSU — "Yakınımda" süzgecinin altlığı.
 *
 * Tablo elle yazıldı; bir basamak kayması (39.93 yerine 3.993) sessizce
 * yanlış illeri "yakın" sayardı ve kimse fark etmezdi. Bu yüzden hem SINIRLAR
 * hem BİLİNEN MESAFELER doğrulanıyor: Türkiye kabaca 36-42° enlem, 26-45°
 * boylam arasında ve şu mesafeler herkesçe bilinen değerler.
 */
describe("TR il tablosu", () => {
  it("81 il, plaka kodları 1..81 eksiksiz ve tekil", () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(TR_PROVINCES.map((p) => p.plate)).toEqual([...Array(81)].map((_, i) => i + 1));
    expect(new Set(TR_PROVINCES.map((p) => p.name)).size).toBe(81);
  });

  it("koordinatlar Türkiye sınırları içinde", () => {
    for (const p of TR_PROVINCES) {
      expect(p.lat).toBeGreaterThan(35.8);
      expect(p.lat).toBeLessThan(42.2);
      expect(p.lng).toBeGreaterThan(25.6);
      expect(p.lng).toBeLessThan(44.9);
    }
  });

  it.each([
    ["İstanbul", "Ankara", 350],
    ["İzmir", "Ankara", 520],
    ["Ankara", "Erzurum", 720],
    ["İstanbul", "İzmir", 330],
  ])("%s – %s ≈ %i km (±%%12)", (a, b, expected) => {
    const at = (n: string) => TR_PROVINCES.find((p) => p.name === n)!;
    const got = haversineKm(at(a), at(b));
    expect(Math.abs(got - expected) / expected).toBeLessThan(0.12);
  });

  it("resolveProvince: ad, aksan/büyük harf ve POSTA KODU", () => {
    expect(resolveProvince("izmir")?.plate).toBe(35);
    expect(resolveProvince("İZMİR")?.plate).toBe(35);
    expect(resolveProvince("Afyonkarahisar")?.plate).toBe(3);
    // Posta kodunun ilk iki hanesi plaka kodudur.
    expect(resolveProvince("34110")?.name).toBe("İstanbul");
    expect(resolveProvince("06")?.name).toBe("Ankara");
    expect(resolveProvince("bilinmeyen")).toBeNull();
    expect(resolveProvince("")).toBeNull();
    // 99 diye bir plaka yok.
    expect(resolveProvince("99999")).toBeNull();
  });

  it("provincesWithin seçilen ili DAİMA içerir ve yarıçapla büyür", () => {
    const ist = TR_PROVINCES.find((p) => p.name === "İstanbul")!;
    const r25 = provincesWithin(ist, 25);
    expect(r25).toContain("İstanbul");
    for (const [a, b] of [[25, 50], [50, 100], [100, 250]] as [number, number][]) {
      expect(provincesWithin(ist, a).length).toBeLessThanOrEqual(provincesWithin(ist, b).length);
    }
    // 250 km İstanbul'dan tüm ülkeyi kapsamamalı — kapsasaydı süzgeç işe yaramazdı.
    expect(provincesWithin(ist, 250).length).toBeLessThan(TR_PROVINCES.length / 2);
  });

  it("en küçük yarıçap 25 km — il merkezli veride 10 km 'aynı il' demekti", () => {
    expect(RADIUS_OPTIONS[0]).toBe(25);
    expect(RADIUS_OPTIONS).not.toContain(10);
  });
});
