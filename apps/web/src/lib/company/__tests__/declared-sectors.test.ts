import { describe, expect, it } from "vitest";
import { declaredSectors, sectorsOf } from "../declared-sectors";

/**
 * Firma kategori beyanı YALNIZ SEKTÖR (sahip kararı 2026-10-29). Seçici,
 * kayıt özeti ve Profilim aynı listeyi okur: depodaki (ya da eski taslaktaki)
 * iki dizinin GÖRÜNÜR sektörleri, kayıtlı sırayla.
 */
describe("declaredSectors", () => {
  it("yalnız sektör beyanı aynen döner (kayıtlı sıra)", () => {
    expect(declaredSectors(["22000000", "31000000", "12000000"], [])).toEqual(["22000000", "31000000", "12000000"]);
    expect(declaredSectors([], [])).toEqual([]);
    expect(declaredSectors(null, undefined)).toEqual([]);
  });

  it("eski ürün / hizmet seçimi (ata zinciriyle) sektörüne iner; ana eksende olan sektör tekrar yazılmaz", () => {
    expect(
      declaredSectors(["22000000", "31000000", "12000000"], ["31160000", "31170000", "31171500", "31171501"]),
    ).toEqual(["22000000", "31000000", "12000000"]);
  });

  it("sektörü ana eksende OLMAYAN eski seçim (eski kayıt) sektörünü sona ekler", () => {
    expect(declaredSectors(["12000000"], ["14111501"])).toEqual(["12000000", "14000000"]);
    expect(declaredSectors([], ["39120000", "39121600"])).toEqual(["39000000"]);
  });

  it("ana eksendeki sektör dışı kod (eski hatalı kayıt) sektörüne yuvarlanır", () => {
    expect(declaredSectors(["39120000", "39000000"], [])).toEqual(["39000000"]);
  });

  it("katalog kodu olmayan değer ana eksende olduğu gibi kalır, alt eksende yok sayılır", () => {
    expect(declaredSectors(["cat1"], ["sub-1"])).toEqual(["cat1"]);
  });

  // GİZLİ KATEGORİ (2026-10-09 / 2026-10-10, sahip kararı): gizli kod ve YALNIZ
  // gizli bir seçimin atası olarak saklanmış görünür sektör düşer. 46 "İş
  // Güvenliği ve Yangın Ekipmanları" görünür; silah / kolluk dalları (4610,
  // 461825 …) gizli. 77 ve 10 tümüyle gizli sektörlerdir.
  it("gizli kod, altındaki seçimler ve yalnız gizli seçimin atası olan sektör düşer", () => {
    expect(
      declaredSectors(["46000000", "31000000", "77000000"], ["46100000", "46101500", "31160000", "10151500"]),
    ).toEqual(["31000000"]);
    expect(declaredSectors(["46000000"], ["46101500"])).toEqual([]);
    expect(declaredSectors(["46000000"], ["46180000", "46182500", "46182501"])).toEqual([]);
    expect(declaredSectors(["77000000"], ["77101500"])).toEqual([]);
  });

  it("46 görünür sektördür: tek başına ya da görünür bir seçimle sektör olarak kalır", () => {
    expect(declaredSectors(["46000000"], [])).toEqual(["46000000"]);
    expect(declaredSectors(["46000000"], ["46100000", "46101500", "46180000", "46181500"])).toEqual(["46000000"]);
  });
});

describe("sectorsOf", () => {
  it("kümeyi sektörlerine indirir: sıra korunur, tekrar yok, kod olmayan değer aynen", () => {
    expect(sectorsOf(["39000000", "39121600", "23211500", "23000000", "cat1"])).toEqual([
      "39000000",
      "23000000",
      "cat1",
    ]);
    expect(sectorsOf([])).toEqual([]);
  });
});
