import { describe, expect, it } from "vitest";
import {
  resolvedCategoryIds,
  visibleBreakdownRows,
  visibleCategoryRef,
  visibleCategoryRefs,
  visibleRowCategories,
} from "../visible-categories";

/**
 * GİZLİ SEGMENT — WEB'İN TEK SÜZGECİ (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori talepte, üründe ya da başka yerde de gösterilmesin").
 * Kaynak `@rothern/shared` `HIDDEN_SEGMENTS`; bu yardımcılar API'den gelen
 * kategori nesnelerini aynı kurala indirir. 46 (kolluk/emniyet) ve 77 (çevre
 * hizmetleri) 2026-10-09'da, 10 (canlı bitki) 2026-09-19'da gizlendi.
 */
describe("visibleCategoryRefs / visibleCategoryRef", () => {
  const rows = [
    { id: "46181500", name: "Koruyucu giysi" },
    { id: "39121600", name: "Devre kesiciler" },
    { id: "10151500", name: "Tohumlar" },
    { id: "31161500", name: "Vidalar" },
  ];

  it("gizli segmentin altındaki nesneler düşer, sıra korunur (`id` anahtarı)", () => {
    expect(visibleCategoryRefs(rows).map((r) => r.id)).toEqual(["39121600", "31161500"]);
  });

  it("panel satırlarının `code` anahtarı da aynı kuraldan geçer", () => {
    const panel = rows.map((r) => ({ code: r.id, name: r.name }));
    expect(visibleCategoryRefs(panel).map((r) => r.code)).toEqual(["39121600", "31161500"]);
  });

  it("boş / eksik girdi boş dizi; tek nesnede gizli → null", () => {
    expect(visibleCategoryRefs(undefined)).toEqual([]);
    expect(visibleCategoryRefs(null)).toEqual([]);
    expect(visibleCategoryRef(null)).toBeNull();
    expect(visibleCategoryRef({ id: "46000000", name: "Kolluk" })).toBeNull();
    expect(visibleCategoryRef({ id: "77101500", name: "Çevre" })).toBeNull();
    const kept = { id: "39000000", name: "Elektrik" };
    expect(visibleCategoryRef(kept)).toBe(kept);
  });
});

describe("visibleRowCategories — liste satırı + '+N kategori' sayacı", () => {
  it("süzen API: liste ve sayaç aynen geçer", () => {
    expect(visibleRowCategories([{ code: "39121600", name: "A" }], 2)).toEqual({
      categories: [{ code: "39121600", name: "A" }],
      extraCount: 2,
    });
  });

  it("satırda gizli kategori geldiyse düşer ve sayaç SIFIRLANIR (gizliyi '+1' diye saymak da göstermektir)", () => {
    expect(
      visibleRowCategories(
        [
          { code: "46181500", name: "Koruyucu giysi" },
          { code: "39121600", name: "A" },
        ],
        3,
      ),
    ).toEqual({ categories: [{ code: "39121600", name: "A" }], extraCount: 0 });
  });

  it("eksik liste / sayaç güvenli", () => {
    expect(visibleRowCategories(undefined, undefined)).toEqual({ categories: [], extraCount: 0 });
    expect(visibleRowCategories([], -2)).toEqual({ categories: [], extraCount: 0 });
  });
});

describe("visibleBreakdownRows — pano kırılım grafikleri (W-14)", () => {
  it("segment kodu gizli olan satır düşer", () => {
    const rows = [
      { id: "46000000", label: "Kolluk ve Emniyet Ekipmanları", amount: 9 },
      { id: "39000000", label: "Elektrik Sistemleri", amount: 5 },
      { label: "Diğer", amount: 1 },
    ];
    expect(visibleBreakdownRows(rows).map((r) => r.label)).toEqual(["Elektrik Sistemleri", "Diğer"]);
  });

  it("etiketi ham gizli kod olan satır düşer (API adı bulamayınca kodu basar)", () => {
    expect(visibleBreakdownRows([{ label: "46000000" }, { label: " 77000000 " }, { label: "39000000" }, { label: "Makine" }]).map((r) => r.label)).toEqual([
      "39000000",
      "Makine",
    ]);
  });

  it("kanıt yoksa satır aynen geçer — ada bakarak tahmin yürütülmez", () => {
    const rows = [{ label: "Kolluk ve Emniyet Ekipmanları" }];
    expect(visibleBreakdownRows(rows)).toEqual(rows);
    expect(visibleBreakdownRows(undefined)).toEqual([]);
  });
});

describe("resolvedCategoryIds — çizilebilir seçimler (W-09/W-10)", () => {
  it("ad cevabı yokken (yükleniyor / hata) gizli olmayan her kimlik yerinde kalır", () => {
    expect(resolvedCategoryIds(["46181500", "39121600", "31161500"], undefined)).toEqual(["39121600", "31161500"]);
  });

  it("ad cevabı geldiyse yalnız SATIRI OLAN kimlikler kalır — asılı '…' çipi olmaz", () => {
    expect(resolvedCategoryIds(["39121600", "39129999", "31161500"], [{ id: "31161500" }, { id: "39121600" }])).toEqual([
      "39121600",
      "31161500",
    ]);
  });

  it("eski API gizli kodun satırını döndürse de kimlik çizilmez", () => {
    expect(resolvedCategoryIds(["46181500", "39121600"], [{ id: "46181500" }, { id: "39121600" }])).toEqual(["39121600"]);
  });
});
