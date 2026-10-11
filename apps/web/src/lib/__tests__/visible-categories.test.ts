import { describe, expect, it } from "vitest";
import {
  resolvedCategoryIds,
  visibleBreakdownRows,
  visibleCategoryRef,
  visibleCategoryRefs,
  visibleRowCategories,
} from "../visible-categories";

/**
 * GİZLİ KATEGORİ — WEB'İN TEK SÜZGECİ (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori talepte, üründe ya da başka yerde de gösterilmesin").
 * Kaynak `@rothern/shared` `HIDDEN_CATEGORY_PREFIXES`; bu yardımcılar API'den
 * gelen kategori nesnelerini aynı kurala indirir. 77 (çevre hizmetleri)
 * 2026-10-09'da, 10 (canlı bitki) 2026-09-19'da gizlendi.
 *
 * 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
 * GÖRÜNÜR; yalnız silah ve kolluk dalları gizli — aile `4610…4615, 4620, 4622`
 * ve görünür 4618 ailesinin `461825` sınıfı. Kuralın birimi kod ÖNEKİDİR.
 */
describe("visibleCategoryRefs / visibleCategoryRef", () => {
  const rows = [
    { id: "46101500", name: "Ateşli silahlar" },
    { id: "39121600", name: "Devre kesiciler" },
    { id: "10151500", name: "Tohumlar" },
    { id: "31161500", name: "Vidalar" },
  ];

  it("gizli bir önekin altındaki nesneler düşer, sıra korunur (`id` anahtarı)", () => {
    expect(visibleCategoryRefs(rows).map((r) => r.id)).toEqual(["39121600", "31161500"]);
  });

  it("46 görünür segmenttir: görünür ailesi kalır, gizli ailesi ve gizli sınıfı düşer", () => {
    const mixed = [
      { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları" },
      { id: "46181500", name: "Koruyucu giysi" },
      { id: "46100000", name: "Hafif silahlar ve mühimmat" },
      { id: "46151600", name: "Kalabalık kontrol ekipmanı" },
      { id: "46182500", name: "Kişisel güvenlik cihazları veya silahları" },
      { id: "46182501", name: "Biber gazı" },
      { id: "46191600", name: "Yangın söndürücüler" },
      { id: "46220000", name: "Mühimmat imha" },
    ];
    expect(visibleCategoryRefs(mixed).map((r) => r.id)).toEqual(["46000000", "46181500", "46191600"]);
    for (const row of mixed) {
      const kept = ["46000000", "46181500", "46191600"].includes(row.id);
      expect(visibleCategoryRef(row), row.id).toBe(kept ? row : null);
    }
  });

  it("panel satırlarının `code` anahtarı da aynı kuraldan geçer", () => {
    const panel = rows.map((r) => ({ code: r.id, name: r.name }));
    expect(visibleCategoryRefs(panel).map((r) => r.code)).toEqual(["39121600", "31161500"]);
  });

  it("boş / eksik girdi boş dizi; tek nesnede gizli → null", () => {
    expect(visibleCategoryRefs(undefined)).toEqual([]);
    expect(visibleCategoryRefs(null)).toEqual([]);
    expect(visibleCategoryRef(null)).toBeNull();
    expect(visibleCategoryRef({ id: "46100000", name: "Hafif silahlar" })).toBeNull();
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
          { code: "46101500", name: "Ateşli silahlar" },
          { code: "39121600", name: "A" },
        ],
        3,
      ),
    ).toEqual({ categories: [{ code: "39121600", name: "A" }], extraCount: 0 });
  });

  it("görünür 46 kodu satırda kalır ve sayaç aynen geçer (liste süzülmüş sayılır)", () => {
    const row = [{ code: "46181500", name: "Koruyucu giysi" }];
    expect(visibleRowCategories(row, 2)).toEqual({ categories: row, extraCount: 2 });
  });

  it("eksik liste / sayaç güvenli", () => {
    expect(visibleRowCategories(undefined, undefined)).toEqual({ categories: [], extraCount: 0 });
    expect(visibleRowCategories([], -2)).toEqual({ categories: [], extraCount: 0 });
  });
});

describe("visibleBreakdownRows — pano kırılım grafikleri (W-14)", () => {
  it("segment kodu gizli olan satır düşer; görünür 46 satırı kalır", () => {
    const rows = [
      { id: "92000000", label: "Kamu Düzeni ve Güvenlik Hizmetleri", amount: 9 },
      { id: "39000000", label: "Elektrik Sistemleri", amount: 5 },
      { id: "46000000", label: "İş Güvenliği ve Yangın Ekipmanları", amount: 3 },
      { label: "Diğer", amount: 1 },
    ];
    expect(visibleBreakdownRows(rows).map((r) => r.label)).toEqual([
      "Elektrik Sistemleri",
      "İş Güvenliği ve Yangın Ekipmanları",
      "Diğer",
    ]);
  });

  it("etiketi ham gizli kod olan satır düşer (API adı bulamayınca kodu basar)", () => {
    expect(
      visibleBreakdownRows([{ label: "92000000" }, { label: " 77000000 " }, { label: "46100000" }, { label: "39000000" }, { label: "Makine" }]).map(
        (r) => r.label,
      ),
    ).toEqual(["39000000", "Makine"]);
  });

  it("kanıt yoksa satır aynen geçer — ada bakarak tahmin yürütülmez", () => {
    const rows = [{ label: "Kamu Düzeni ve Güvenlik Hizmetleri" }];
    expect(visibleBreakdownRows(rows)).toEqual(rows);
    expect(visibleBreakdownRows(undefined)).toEqual([]);
  });
});

describe("resolvedCategoryIds — çizilebilir seçimler (W-09/W-10)", () => {
  it("ad cevabı yokken (yükleniyor / hata) gizli olmayan her kimlik yerinde kalır", () => {
    expect(resolvedCategoryIds(["46101500", "39121600", "31161500"], undefined)).toEqual(["39121600", "31161500"]);
    // Görünür 46 kodu "yükleniyor" çipi olarak yerinde kalır; gizli sınıfın yaprağı düşer.
    expect(resolvedCategoryIds(["46181500", "46182501"], undefined)).toEqual(["46181500"]);
  });

  it("ad cevabı geldiyse yalnız SATIRI OLAN kimlikler kalır — asılı '…' çipi olmaz", () => {
    expect(resolvedCategoryIds(["39121600", "39129999", "31161500"], [{ id: "31161500" }, { id: "39121600" }])).toEqual([
      "39121600",
      "31161500",
    ]);
  });

  it("eski API gizli kodun satırını döndürse de kimlik çizilmez", () => {
    expect(resolvedCategoryIds(["46101500", "39121600"], [{ id: "46101500" }, { id: "39121600" }])).toEqual(["39121600"]);
  });
});
