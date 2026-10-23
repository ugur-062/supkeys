import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HIDDEN_BRANCH_PREFIXES,
  HIDDEN_CATEGORY_LABEL,
  HIDDEN_SEGMENT_LABEL,
  HIDDEN_SEGMENT_PREFIXES,
  hiddenPrefixOfCode,
  hiddenSearchReason,
  isHiddenCategoryCode,
  productCategoryLabel,
} from "../category-label";

/**
 * YÖNETİMDE ÜRÜN KATEGORİSİ ETİKETİ (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori başka yerde de gösterilmesin"; arayüz denetimi W-16).
 * Gizli daldaki kategori yönetim ekranında da ADIYLA basılmaz; personel
 * nedenini görsün diye sabit not yazılır ("—" kategorisiz sanılırdı).
 *
 * 2026-10-10: 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla geri açıldı;
 * yalnız silah ve kolluk aileleri (+ 461825 sınıfı) gizli. Not iki biçimli:
 * segmenti gizli koda "— (gizli segment)", görünür segmentin gizli dalındaki
 * koda "— (gizli kategori)".
 */
describe("productCategoryLabel", () => {
  it("görünür kategori adıyla; ad yoksa '—'", () => {
    expect(productCategoryLabel({ categoryId: "39000000", categoryName: "Elektrik Malzemeleri", hiddenCategory: false })).toBe(
      "Elektrik Malzemeleri",
    );
    expect(productCategoryLabel({ categoryId: "39000000", categoryName: null })).toBe("—");
    expect(productCategoryLabel({ categoryId: null, categoryName: null })).toBe("—");
    expect(productCategoryLabel({})).toBe("—");
  });

  it("46 geri açıldı: KKD, yangın ve iş güvenliği kategorileri ADIYLA basılır", () => {
    expect(productCategoryLabel({ categoryId: "46181500", categoryName: "Koruyucu giysiler", hiddenCategory: false })).toBe(
      "Koruyucu giysiler",
    );
    expect(productCategoryLabel({ categoryId: "46191600", categoryName: "Yangınla mücadele ekipmanı" })).toBe("Yangınla mücadele ekipmanı");
    expect(productCategoryLabel({ categoryId: "46000000", categoryName: "İş Güvenliği ve Yangın Ekipmanları" })).toBe(
      "İş Güvenliği ve Yangın Ekipmanları",
    );
  });

  it("segmenti gizli kod: '— (gizli segment)' (API bayrağıyla ya da bayraksız)", () => {
    expect(HIDDEN_SEGMENT_LABEL).toBe("— (gizli segment)");
    expect(productCategoryLabel({ categoryId: "77101500", categoryName: null, hiddenCategory: true })).toBe(HIDDEN_SEGMENT_LABEL);
    expect(productCategoryLabel({ categoryId: "10151500", categoryName: null })).toBe(HIDDEN_SEGMENT_LABEL);
  });

  it("görünür segmentin gizli ailesi / sınıfı: '— (gizli kategori)' — 'gizli segment' YAZILMAZ (segment sitede görünüyor)", () => {
    expect(HIDDEN_CATEGORY_LABEL).toBe("— (gizli kategori)");
    for (const categoryId of ["46101500", "46100000", "46151716", "46201100", "46221500", "46182500", "46182501"]) {
      expect(productCategoryLabel({ categoryId, categoryName: null, hiddenCategory: true }), categoryId).toBe(HIDDEN_CATEGORY_LABEL);
    }
  });

  it("bayrağı göndermeyen eski yanıt adı gönderse de ad BASILMAZ (ikinci kat: kod)", () => {
    for (const categoryId of ["77101500", "10151500", "52121700"]) {
      expect(productCategoryLabel({ categoryId, categoryName: "Havlular" }), categoryId).toBe(HIDDEN_SEGMENT_LABEL);
    }
    for (const categoryId of ["46101500", "46150000", "46182503"]) {
      expect(productCategoryLabel({ categoryId, categoryName: "Ateşli silahlar" }), categoryId).toBe(HIDDEN_CATEGORY_LABEL);
    }
  });

  it("API 'gizli' diyor ama yerel kopya kodu tanımıyor (API daha yeni): düzey iddia edilmez", () => {
    expect(productCategoryLabel({ categoryId: "39121600", categoryName: null, hiddenCategory: true })).toBe(HIDDEN_CATEGORY_LABEL);
  });
});

describe("hiddenPrefixOfCode / isHiddenCategoryCode", () => {
  it("kodu kapsayan öneki verir; uzunluk düzeyi söyler", () => {
    expect(hiddenPrefixOfCode("77101500")).toBe("77");
    expect(hiddenPrefixOfCode("46101500")).toBe("4610");
    expect(hiddenPrefixOfCode("46182501")).toBe("461825");
    expect(hiddenPrefixOfCode("4615")).toBe("4615"); // kodun baş kısmı (arama kutusu)
    expect(hiddenPrefixOfCode("46181500")).toBeNull();
    expect(hiddenPrefixOfCode("46")).toBeNull();
    expect(hiddenPrefixOfCode(null)).toBeNull();
  });

  it("46 ve iş güvenliği / yangın aileleri görünür; silah ve kolluk dalları, 77 gizli", () => {
    for (const code of ["46000000", "46160000", "46171500", "46181500", "46182400", "46191600", "46211700", "39121600", "31000000"]) {
      expect(isHiddenCategoryCode(code), code).toBe(false);
    }
    for (const code of ["46100000", "46111500", "46121500", "46131500", "46141500", "46151500", "46201000", "46221500", "46182500", "77101500"]) {
      expect(isHiddenCategoryCode(code), code).toBe(true);
    }
    expect(isHiddenCategoryCode(null)).toBe(false);
    expect(isHiddenCategoryCode("")).toBe(false);
  });
});

/**
 * Kategoriler sayfası: gizli daldaki kod aramasının "Sonuç yok" nedeni.
 * API `hiddenPrefix` (kodu kapsayan gizli önek) ya da eski biçimde
 * `hiddenSegment` (ilk iki hane) döner.
 */
describe("hiddenSearchReason", () => {
  it("neden yoksa null (düz 'Sonuç yok')", () => {
    expect(hiddenSearchReason({}, "zzqq")).toBeNull();
    expect(hiddenSearchReason(undefined, "43230000")).toBeNull();
    expect(hiddenSearchReason({ hiddenSegment: undefined, hiddenPrefix: null }, "31171500")).toBeNull();
  });

  it("tümüyle gizli segment: 'NN segmenti … gizli'", () => {
    expect(hiddenSearchReason({ hiddenSegment: "43" }, "43230000")).toMatch(/^Sonuç yok — 43 segmenti katalog sadeleştirmesiyle gizli/);
    expect(hiddenSearchReason({ hiddenPrefix: "77", hiddenSegment: "77" }, "7710")).toMatch(/— 77 segmenti /);
  });

  it("görünür segmentin gizli ailesi / sınıfı: düzey önekten — '46 segmenti gizli' DENMEZ", () => {
    expect(hiddenSearchReason({ hiddenPrefix: "4610" }, "46101500")).toMatch(/— 4610 ailesi katalog sadeleştirmesiyle gizli/);
    expect(hiddenSearchReason({ hiddenPrefix: "461825" }, "46182501")).toMatch(/— 461825 sınıfı /);
    // Eski biçimli yanıt (yalnız ilk iki hane): düzey yazılan koddan bulunur.
    const fromOldShape = hiddenSearchReason({ hiddenSegment: "46" }, "4610 15 00");
    expect(fromOldShape).toMatch(/— 4610 ailesi /);
    expect(fromOldShape).not.toMatch(/46 segmenti/);
    expect(hiddenSearchReason({ hiddenSegment: "46" }, "46.18.25")).toMatch(/— 461825 sınıfı /);
  });
});

/**
 * NÖBETÇİ — yerel kopya kaynaktan ayrışamaz. Admin `@rothern/shared`a bağlı
 * değil; gizli listelerin tek kaynağı
 * `packages/shared/src/constants/category-catalog.ts` (`HIDDEN_SEGMENTS` +
 * `HIDDEN_BRANCH_PREFIXES`). Oraya önek eklenir/çıkarılırsa bu test kırmızı
 * olur ve kopya güncellenir.
 */
describe("yerel gizli listeler — paylaşılan kaynakla birebir", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "packages", "shared", "src", "constants", "category-catalog.ts"),
    "utf8",
  );
  const listOf = (name: string, digits: RegExp) => {
    const block = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(source);
    return block ? [...block[1]!.matchAll(digits)].map((m) => m[1]!) : null;
  };
  const sharedSegments = listOf("HIDDEN_SEGMENTS", /^\s*"(\d{2})"/gm);
  const sharedBranches = listOf("HIDDEN_BRANCH_PREFIXES", /^\s*"(\d{4}|\d{6})"/gm);

  it("kaynak dosyada iki liste de bulunur", () => {
    expect(sharedSegments).not.toBeNull();
    expect(sharedBranches).not.toBeNull();
    expect(sharedSegments!.length).toBeGreaterThan(0);
    expect(sharedBranches!.length).toBeGreaterThan(0);
  });

  it("aynı segmentler, aynı sırayla", () => {
    expect([...HIDDEN_SEGMENT_PREFIXES]).toEqual(sharedSegments);
  });

  it("aynı gizli dallar (aile / sınıf önekleri), aynı sırayla", () => {
    expect([...HIDDEN_BRANCH_PREFIXES]).toEqual(sharedBranches);
  });

  it("paylaşılan kaynak birleşik listeyi YALNIZ bu iki listeden kurar (üçüncü bir liste yok)", () => {
    expect(source).toContain(
      "export const HIDDEN_CATEGORY_PREFIXES: readonly string[] = [...HIDDEN_SEGMENTS, ...HIDDEN_BRANCH_PREFIXES];",
    );
    // Kaynakta başka bir `HIDDEN_…` listesi tanımlanırsa kopya onu da aynalamalı.
    expect([...source.matchAll(/^export const (HIDDEN_[A-Z_]+)/gm)].map((m) => m[1])).toEqual([
      "HIDDEN_SEGMENTS",
      "HIDDEN_BRANCH_PREFIXES",
      "HIDDEN_CATEGORY_PREFIXES",
    ]);
  });

  it("46 artık segment listesinde değil; 77 hâlâ gizli", () => {
    expect(HIDDEN_SEGMENT_PREFIXES).not.toContain("46");
    expect(HIDDEN_SEGMENT_PREFIXES).toContain("77");
    for (const p of HIDDEN_BRANCH_PREFIXES) expect(HIDDEN_SEGMENT_PREFIXES).not.toContain(p.slice(0, 2));
  });
});
