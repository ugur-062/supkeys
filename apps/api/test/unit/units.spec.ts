import {
  UNITS,
  COMMON_UNIT_CODES,
  convertUnit,
  getUnit,
  isQuantityValidForUnit,
  normalizeUnit,
  unitLabel,
} from "@rothern/shared";

/**
 * Faz 1 — ölçü birimi kataloğu sözleşmesi.
 * Bu katalog `ListingItem.unitCode` + Excel içe aktarma + sipariş snapshot'ının
 * ORTAK kaynağı; buradaki bir bozulma üç yüzeye birden yayılır.
 */
describe("Ölçü birimi kataloğu", () => {
  describe("katalog bütünlüğü", () => {
    it("kodlar tekil", () => {
      const codes = UNITS.map((u) => u.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it("sık kullanılanların hepsi katalogda var", () => {
      for (const c of COMMON_UNIT_CODES) expect(getUnit(c)).not.toBeNull();
    });

    it("her boyutta bir TEMEL birim (toBase=1) var", () => {
      const dims = [...new Set(UNITS.map((u) => u.dimension))];
      for (const d of dims) {
        const bases = UNITS.filter((u) => u.dimension === d && u.toBase === 1);
        expect(bases.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("alias'lar birimler arasında ÇAKIŞMIYOR", () => {
      // Çakışma olsaydı normalizeUnit sessizce yanlış birim döndürürdü.
      const seen = new Map<string, string>();
      for (const u of UNITS) {
        for (const a of u.aliases) {
          const prev = seen.get(a);
          expect(prev === undefined || prev === u.code).toBe(true);
          seen.set(a, u.code);
        }
      }
    });
  });

  describe("normalizeUnit — asıl dert buydu", () => {
    it("aynı birimin yazım varyantları TEK koda düşer", () => {
      // Bu beş değer bugüne kadar DB'de beş ayrı satır değeriydi.
      for (const v of ["adet", "Adet", "ADET", "ad", "pcs"]) {
        expect(normalizeUnit(v)).toBe("PCE");
      }
    });

    it("Türkçe büyük İ sorunu yok", () => {
      expect(normalizeUnit("KİLO")).toBe("KG");
      expect(normalizeUnit("kilo")).toBe("KG");
    });

    it("nokta/boşluk toleranslı", () => {
      expect(normalizeUnit("ad.")).toBe("PCE");
      expect(normalizeUnit(" kg ")).toBe("KG");
      expect(normalizeUnit("metre kare")).toBe("M2");
    });

    it("sembol ve kod da tanınır", () => {
      expect(normalizeUnit("m²")).toBe("M2");
      expect(normalizeUnit("M3")).toBe("M3");
    });

    it("tanınmayan birim null döner — İŞ ENGELLENMEZ", () => {
      // Liste bilinçli KAPALI DEĞİL: kullanıcı "bobin" yazabilmeli.
      expect(normalizeUnit("bobin")).toBeNull();
      expect(normalizeUnit("")).toBeNull();
      expect(normalizeUnit(null)).toBeNull();
    });
  });

  describe("isQuantityValidForUnit — yeni kazanılan doğrulama", () => {
    it("adet ondalık KABUL ETMEZ", () => {
      expect(isQuantityValidForUnit(2.5, "PCE")).toBe(false);
      expect(isQuantityValidForUnit(3, "PCE")).toBe(true);
    });

    it("kg ondalık kabul eder (3 haneye kadar)", () => {
      expect(isQuantityValidForUnit(2.5, "KG")).toBe(true);
      expect(isQuantityValidForUnit(2.125, "KG")).toBe(true);
      expect(isQuantityValidForUnit(2.1255, "KG")).toBe(false);
    });

    it("kayan nokta artığı YANLIŞ RET üretmez", () => {
      // 0.1 + 0.2 = 0.30000000000000004 — naif kontrol burada patlardı.
      expect(isQuantityValidForUnit(0.1 + 0.2, "KG")).toBe(true);
    });

    it("bilinmeyen birimde kural uygulanmaz (fail-open)", () => {
      expect(isQuantityValidForUnit(2.5, null)).toBe(true);
      expect(isQuantityValidForUnit(2.5, "BOBIN")).toBe(true);
    });
  });

  describe("convertUnit — boyut içi", () => {
    it("ton → kg", () => expect(convertUnit(3, "TON", "KG")).toBe(3000));
    it("cm → m", () => expect(convertUnit(250, "CM", "M")).toBeCloseTo(2.5, 6));
    it("BOYUT FARKLIYSA null (kg → metre asla)", () => {
      expect(convertUnit(3, "TON", "M")).toBeNull();
      expect(convertUnit(1, "PCE", "KG")).toBeNull();
    });
  });

  describe("unitLabel — gösterim", () => {
    it("bilinen kodda katalog adı", () =>
      expect(unitLabel("PCE", "her neyse")).toBe("adet"));
    it("bilinmeyen kodda serbest metne düşer", () =>
      expect(unitLabel(null, "bobin")).toBe("bobin"));
    it("ikisi de yoksa tire", () => expect(unitLabel(null, null)).toBe("—"));
  });
});

describe("belirsiz alias'lar kasıtlı olarak tanınmaz", () => {
  it('"mt" hiçbir birime düşmez (metre mi metric ton mu belirsiz)', () => {
    // 3 mt çelik → 3 metre mi 3 ton mu? Sessizce seçmek yanlış sipariş üretir.
    expect(normalizeUnit("mt")).toBeNull();
    expect(normalizeUnit("MT")).toBeNull();
  });
});
