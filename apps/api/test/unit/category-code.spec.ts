/**
 * Ata zinciri — nitelik MİRASININ ve eşleştirme ADAYLARININ ortak temeli.
 * İkisi bu tek fonksiyondan okuyor; zincir bozulursa hem yanlış nitelik
 * sorulur hem yanlış tedarikçi eşleşir.
 */
import {
  categoryAncestors,
  categoryLevel,
  categorySegment,
  isCategoryCode,
} from "@rothern/shared";
import { deriveCategoryMatchCandidates } from "../../src/common/helpers/tender-category-match.helper";

describe("kategori kodu yardımcıları", () => {
  it("yapraktan segmente tam zincir çıkarır", () => {
    expect(categoryAncestors("39122215")).toEqual([
      "39000000",
      "39120000",
      "39122200",
      "39122215",
    ]);
  });

  it("üst seviye kodda zincir KISALIR, yinelenmez", () => {
    // L3 kodu verilince "kendisi" ile L3 aynı — tek kez görünmeli.
    expect(categoryAncestors("39122200")).toEqual([
      "39000000",
      "39120000",
      "39122200",
    ]);
    expect(categoryAncestors("39120000")).toEqual(["39000000", "39120000"]);
    expect(categoryAncestors("39000000")).toEqual(["39000000"]);
  });

  it("geçersiz kod boş zincir döner (sessizce uydurmaz)", () => {
    for (const bad of ["", "39", "abcdefgh", "391222150", "3912221"]) {
      expect(categoryAncestors(bad)).toEqual([]);
      expect(isCategoryCode(bad)).toBe(false);
    }
  });

  it("seviyeyi koddan okur", () => {
    expect(categoryLevel("39000000")).toBe(1);
    expect(categoryLevel("39120000")).toBe(2);
    expect(categoryLevel("39122200")).toBe(3);
    expect(categoryLevel("39122215")).toBe(4);
    expect(categoryLevel("bozuk")).toBe(0);
  });

  it("segmenti çıkarır", () => {
    expect(categorySegment("39122215")).toBe("39000000");
    expect(categorySegment("bozuk")).toBeNull();
  });
});

describe("eşleştirme adayları — zincire taşındıktan sonra DAVRANIŞ AYNI", () => {
  it("segment ayrı, alt adaylar L2/L3/kendisi", () => {
    const r = deriveCategoryMatchCandidates(["39122215"]);
    expect(r.segmentIds).toEqual(["39000000"]);
    // Segment alt adaylara SIZMAMALI — eski davranış böyleydi.
    expect(r.subCandidates.sort()).toEqual(
      ["39120000", "39122200", "39122215"].sort(),
    );
  });

  it("çok kodda tekilleştirir", () => {
    const r = deriveCategoryMatchCandidates(["39122215", "39122216", "abc"]);
    expect(r.segmentIds).toEqual(["39000000"]);
    expect(r.subCandidates).toContain("39122200");
    expect(r.subCandidates).not.toContain("abc");
  });

  it("boş girdide boş döner", () => {
    expect(deriveCategoryMatchCandidates([])).toEqual({
      segmentIds: [],
      subCandidates: [],
    });
  });
});
