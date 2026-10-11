import ExcelJS from "exceljs";
import { ITEM_IMPORT_SHEET, itemImportColumnsFor, matchImportColumn } from "@rothern/shared";
import {
  ListingItemImportService,
  parseLocaleNumber,
  parseImportDate,
  parseWorksheet,
} from "../../src/modules/company-listings/import/listing-item-import.service";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { csvAsUtf8 } from "../../src/common/files/spreadsheet-reader";

/** Windows-1254 (Turkce Windows Excel'in klasik CSV'si) baytlari — test yardimcisi. */
const CP1254: Record<string, number> = {
  "\u00c7": 0xc7, "\u00e7": 0xe7, "\u011e": 0xd0, "\u011f": 0xf0, "\u0130": 0xdd, "\u0131": 0xfd,
  "\u00d6": 0xd6, "\u00f6": 0xf6, "\u015e": 0xde, "\u015f": 0xfe, "\u00dc": 0xdc, "\u00fc": 0xfc,
};
function cp1254(text: string): Buffer {
  return Buffer.from([...text].map((ch) => CP1254[ch] ?? ch.charCodeAt(0)));
}

/**
 * Kalem Excel şablonu — şablon ↔ parser ROUND-TRIP + satır-hata matrisi.
 * DB yok (saf unit). Sözleşme: şablon üreticinin başlıklarını parser tanır;
 * hatalı satır AKTARILMAZ ama önizlemede gösterilir; geçerli satır AiTenderDraftItem
 * şeklinde döner (web aynı mapAiDraftToForm köprüsünü kullanır).
 */

const svc = new ListingItemImportService();

async function fillTemplate(rows: unknown[][]): Promise<string> {
  const tpl = await svc.buildTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(ITEM_IMPORT_SHEET)!;
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    r.forEach((v, j) => (row.getCell(j + 1).value = v as ExcelJS.CellValue));
    row.commit();
  });
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer).toString("base64");
}

describe("şablon üretimi", () => {
  it("şablon (tek sütun kümesi — satış ilanı kaldırıldı): Kalemler + Nasıl Doldurulur + Örnek; başlıklar parser'ın tanıdığı adlar", async () => {
    const buf = await svc.buildTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      ITEM_IMPORT_SHEET,
      "Nasıl Doldurulur",
      "Örnek",
    ]);
    const header = wb.getWorksheet(ITEM_IMPORT_SHEET)!.getRow(1);
    const keys: string[] = [];
    header.eachCell((c) => keys.push(String(matchImportColumn(c.value))));
    expect(keys).toEqual([
      "name",
      "quantity",
      "unit",
      "description",
      "materialCode",
      "requiredByDate",
      "targetUnitPrice",
    ]);
  });
});

describe("round-trip: doldurulmuş şablon → parse", () => {
  it("geçerli satırlar aktarılır; hatalı satırlar errors ile önizlemede kalır; boş satır atlanır", async () => {
    const b64 = await fillTemplate([
      ['Çelik boru 2"', 120, "m", "ST37", "BRU-200", "15.09.2026", 185],
      ["Dirsek 90°", "12,5", "kg", "", "", new Date(Date.UTC(2026, 8, 30)), "42,50"],
      [], // boş → atlanır
      ["", 5, "kg"], // ad boş → hata
      ["Flanş", "abc", "adet"], // miktar sayı değil
      ["Conta", 1.23456, "adet"], // 3'ten fazla ondalık
      ["Vana", 3, "adet", "", "", "31.02.2026"], // geçersiz tarih
      ["Uzun birim", 1, "x".repeat(21)], // birim çok uzun
    ]);
    const res = await svc.parse({
      fileName: "sablon.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dataBase64: b64,
      listingType: "ALIM",
    });
    expect(res.sheetName).toBe(ITEM_IMPORT_SHEET);
    expect(res.rows).toHaveLength(7);
    expect(res.validCount).toBe(2);
    expect(res.invalidCount).toBe(5);
    expect(res.truncated).toBe(0);

    const [r1, r2, r3, r4, r5, r6, r7] = res.rows;
    expect(r1!.rowNumber).toBe(2);
    expect(r1!.errors).toEqual([]);
    expect(r1!.item).toMatchObject({
      name: 'Çelik boru 2"',
      quantity: 120,
      unit: "m",
      description: "ST37",
      materialCode: "BRU-200",
      requiredByDate: "2026-09-15",
      targetUnitPrice: 185,
    });
    // TR ondalık + Excel tarih hücresi (UTC) + para metni
    expect(r2!.item).toMatchObject({ quantity: 12.5, requiredByDate: "2026-09-30", targetUnitPrice: 42.5 });
    // Faz 1: serbest metin birim kanonik koda çevrilir.
    expect(r1!.item.unitCode).toBe("M");
    expect(r2!.item.unitCode).toBe("KG");
    expect(r3!.errors).toEqual(["Kalem Adı boş"]);
    expect(r3!.rowNumber).toBe(5); // boş 4. satır atlandı, numara korunur
    expect(r4!.errors).toEqual(["Miktar sayı değil"]);
    expect(r5!.errors[0]).toMatch(/ondalık/);
    expect(r6!.errors[0]).toMatch(/Termin tarihi geçersiz/);
    expect(r7!.errors[0]).toMatch(/Birim çok uzun/);
  });

  it("Faz 1: birim ile ÇELİŞEN miktar reddedilir (12,5 adet)", async () => {
    const b64 = await fillTemplate([
      ["Vida", "12,5", "adet"], // adet ondalık kabul etmez
      ["Tel", "12,5", "kg"], // kg kabul eder
      ["Bobin", "12,5", "bobin"], // bilinmeyen birim → kural uygulanmaz
    ]);
    const res = await svc.parse({
      fileName: "s.xlsx",
      mimeType: "x",
      dataBase64: b64,
      listingType: "ALIM",
    });
    const [a, b, c] = res.rows;
    expect(a!.errors[0]).toMatch(/tam sayı/);
    expect(b!.errors).toEqual([]);
    expect(b!.item.unitCode).toBe("KG");
    // Bilinmeyen birim satırı GEÇERLİ kalır (liste kapalı değil) ama kodsuz.
    expect(c!.errors).toEqual([]);
    expect(c!.item.unitCode).toBeNull();
  });

  it("Rusça birimler kod alır; birim hatası okuyucunun dilinde birim adı basar (2026-09-27)", async () => {
    const b64 = await fillTemplate([
      ["Болт", "12,5", "шт"], // шт = adet → ondalık reddedilir
      ["Кабель", "120", "м"],
      ["Цемент", "3", "мешок"],
    ]);
    const res = await runWithLocale("ru", () =>
      svc.parse({ fileName: "s.xlsx", mimeType: "x", dataBase64: b64, listingType: "ALIM" }),
    );
    const [a, b, c] = res.rows;
    expect(a!.item.unitCode).toBe("PCE");
    expect(a!.errors[0]).toContain("«шт.»");
    expect(a!.errors[0]).not.toContain("adet");
    expect(b!.item.unitCode).toBe("M");
    expect(c!.item.unitCode).toBe("BAG");
  });

  it("şablon dışı ama başlıkları uyumlu kendi listesi (alias + farklı sıra + üstte başlık satırları) okunur", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Liste");
    ws.addRow(["Firma X — Satınalma Listesi"]);
    ws.addRow([]);
    ws.addRow(["Stok Kodu", "Ürün", "Adet", "Birimi", "Teslim Tarihi"]);
    ws.addRow(["K-1", "Vida M8", 1000, "adet", "2026-10-01"]);
    ws.addRow(["K-2", "Somun M8", 1000, "adet", ""]);
    const b64 = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer).toString("base64");
    const res = await svc.parse({ fileName: "liste.xlsx", mimeType: "x", dataBase64: b64, listingType: "ALIM" });
    expect(res.sheetName).toBe("Liste");
    expect(res.validCount).toBe(2);
    expect(res.rows[0]!.item).toMatchObject({
      materialCode: "K-1",
      name: "Vida M8",
      quantity: 1000,
      unit: "adet",
      requiredByDate: "2026-10-01",
    });
  });

  it("CSV (noktalı virgül) okunur", async () => {
    const csv = "Kalem Adı;Miktar;Birim\nBoru;10;m\nDirsek;5;adet\n";
    const res = await svc.parse({
      fileName: "kalemler.csv",
      mimeType: "text/csv",
      dataBase64: Buffer.from(csv, "utf8").toString("base64"),
      listingType: "ALIM",
    });
    expect(res.validCount).toBe(2);
    expect(res.rows[1]!.item).toMatchObject({ name: "Dirsek", quantity: 5, unit: "adet" });
  });

  it("MU-19 (S029): CSV'de TR binlik ve GG-AA-YYYY tarih xlsx metin hücresiyle AYNI ayrışır (ExcelJS varsayılan map'i devrede değil)", async () => {
    const csv =
      "Kalem Adı;Miktar;Birim;Teslim Tarihi\nÇelik sac;1.500;kg;05-11-2099\nVida;2,5;m;2099-10-01\nSomun;007;adet;\n";
    const res = await svc.parse({
      fileName: "kalemler.csv",
      mimeType: "text/csv",
      dataBase64: Buffer.from(csv, "utf8").toString("base64"),
      listingType: "ALIM",
    });
    expect(res.rows.map((r) => r.errors)).toEqual([[], [], []]);
    expect(res.validCount).toBe(3);
    expect(res.rows[0]!.item).toMatchObject({ name: "Çelik sac", quantity: 1500, requiredByDate: "2099-11-05" });
    expect(res.rows[1]!.item).toMatchObject({ name: "Vida", quantity: 2.5, requiredByDate: "2099-10-01" });
    expect(res.rows[2]!.item).toMatchObject({ name: "Somun", quantity: 7 });
  });

  it("derin denetim S029: Windows-1254 CSV (TR Excel varsayılanı) başlık ve kalem adıyla bozulmadan okunur", async () => {
    const csv = cp1254("Kalem Adı;Miktar;Birim\nÇelik boru;10;m\nŞiş dirsek;5;adet\n");
    const res = await svc.parse({
      fileName: "kalemler.csv",
      mimeType: "text/csv",
      dataBase64: csv.toString("base64"),
      listingType: "ALIM",
    });
    expect(res.validCount).toBe(2);
    expect(res.rows[0]!.item).toMatchObject({ name: "Çelik boru", quantity: 10 });
    expect(res.rows[1]!.item).toMatchObject({ name: "Şiş dirsek", quantity: 5 });
  });

  it("zorunlu başlıklar yoksa şablon-dışı hatası; xlsm ve bilinmeyen dosya reddedilir", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("S").addRow(["Foo", "Bar"]);
    const b64 = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer).toString("base64");
    await expect(
      svc.parse({ fileName: "x.xlsx", mimeType: "x", dataBase64: b64, listingType: "ALIM" }),
    ).rejects.toThrow(/Şablon sütunları bulunamadı/);
    await expect(
      svc.parse({ fileName: "x.xlsm", mimeType: "x", dataBase64: b64, listingType: "ALIM" }),
    ).rejects.toThrow(/Makrolu/);
    await expect(
      svc.parse({
        fileName: "x.pdf",
        mimeType: "application/pdf",
        dataBase64: Buffer.from("%PDF-1.4 ...").toString("base64"),
        listingType: "ALIM",
      }),
    ).rejects.toThrow(/Desteklenmeyen dosya/);
  });
});

describe("seyrek satır (derin denetim 2026-09-29 Y-03)", () => {
  // Başlık + 1 satır + çok uzaktaki TEK hücre: dosya birkaç KB; eski döngü
  // 1..rowCount arasındaki HER satırı/hücreyi getRow/getCell ile OLUŞTURUYORDU
  // (gerçek saldırıda r=1048576 → ~1M Row + milyonlarca Cell → OOM).
  const FAR = 200_000;
  async function sparseXlsx(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ITEM_IMPORT_SHEET);
    ws.addRow(["Kalem Adı", "Miktar", "Birim"]);
    ws.addRow(["Boru", 10, "m"]);
    ws.getCell(`A${FAR}`).value = "Uzak kalem";
    ws.getCell(`B${FAR}`).value = 3;
    ws.getCell(`C${FAR}`).value = "adet";
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  it("yalnız VAR OLAN satırlar gezilir; aradaki boş satırlar/hücreler yaratılmaz", async () => {
    const buf = await sparseXlsx();
    expect(buf.length).toBeLessThan(20 * 1024);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet(ITEM_IMPORT_SHEET)!;
    expect(ws.rowCount).toBe(FAR); // rowCount = son satır NUMARASI

    const res = parseWorksheet(ws, itemImportColumnsFor());
    expect(res.rows.map((r) => r.rowNumber)).toEqual([2, FAR]);
    expect(res.validCount).toBe(2);
    expect(res.rows[1]!.item).toMatchObject({ name: "Uzak kalem", quantity: 3, unit: "adet" });
    // Okuma çalışma sayfasını büyütmemeli: ara satırlar hâlâ yok.
    expect(ws.findRow(3)).toBeUndefined();
    expect(ws.findRow(FAR / 2)).toBeUndefined();
    expect(ws.findRow(FAR - 1)).toBeUndefined();
  });

  it("servis yolu (parse) seyrek dosyayı aynı şekilde okur", async () => {
    const b64 = (await sparseXlsx()).toString("base64");
    const res = await svc.parse({ fileName: "seyrek.xlsx", mimeType: "x", dataBase64: b64, listingType: "ALIM" });
    expect(res.rows.map((r) => r.rowNumber)).toEqual([2, FAR]);
    expect(res.truncated).toBe(0);
  });
});

describe("yardımcılar", () => {
  it("parseLocaleNumber TR/EN biçimleri", () => {
    expect(parseLocaleNumber("1.234,5")).toBe(1234.5);
    expect(parseLocaleNumber("1,234.5")).toBe(1234.5);
    expect(parseLocaleNumber("12,5")).toBe(12.5);
    expect(parseLocaleNumber("12.5")).toBe(12.5);
    expect(parseLocaleNumber("1.234")).toBe(1234);
    expect(parseLocaleNumber("0.500")).toBe(0.5);
    expect(parseLocaleNumber(" 185 ₺ ")).toBe(185);
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber(7)).toBe(7);
  });
  /**
   * Arayüz testi kapanış NUM: kural Türkçeye sabitti; İngilizce arayüzde
   * "1,500" 1,5 ve "12.500" 12500 okunup satır "Hazır" işaretleniyordu.
   */
  it("parseLocaleNumber istek dilinin ayraç kuralıyla", () => {
    // EN: virgül binlik, nokta ondalık.
    expect(parseLocaleNumber("1,500", "en")).toBe(1500);
    expect(parseLocaleNumber("12.500", "en")).toBe(12.5);
    expect(parseLocaleNumber("1,500.5", "en")).toBe(1500.5);
    expect(parseLocaleNumber("12,5", "en")).toBe(12.5); // başka alışkanlık
    expect(parseLocaleNumber("1,234,567", "en")).toBe(1234567);
    // TR / RU: nokta binlik, virgül ondalık.
    expect(parseLocaleNumber("1,500", "tr")).toBe(1.5);
    expect(parseLocaleNumber("12.500", "tr")).toBe(12500);
    expect(parseLocaleNumber("1.250,5", "tr")).toBe(1250.5);
    expect(parseLocaleNumber("0,5", "ru")).toBe(0.5);
    expect(parseLocaleNumber("1 234,5", "ru")).toBe(1234.5);
    // Düzensiz gruplama sayı değildir.
    expect(parseLocaleNumber("1.2.3", "tr")).toBeNull();
  });
  it("parseImportDate", () => {
    expect(parseImportDate("15.09.2026")).toEqual({ iso: "2026-09-15", invalid: false });
    expect(parseImportDate("15/09/2026")).toEqual({ iso: "2026-09-15", invalid: false });
    expect(parseImportDate("2026-09-15")).toEqual({ iso: "2026-09-15", invalid: false });
    expect(parseImportDate("31.02.2026").invalid).toBe(true);
    expect(parseImportDate("")).toEqual({ iso: null, invalid: false });
    expect(parseImportDate(new Date(Date.UTC(2026, 0, 5)))).toEqual({ iso: "2026-01-05", invalid: false });
  });
});

describe("csvAsUtf8 (derin denetim S029)", () => {
  it("geçerli UTF-8 (BOM'lu/BOM'suz) aynı tampon döner", () => {
    const plain = Buffer.from("Kalem Adı;Miktar\n", "utf8");
    expect(csvAsUtf8(plain, "tr")).toBe(plain);
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain]);
    expect(csvAsUtf8(bom, "tr")).toBe(bom);
  });

  it("geçersiz UTF-8: TR/EN'de Windows-1254, RU'da Windows-1251 çözülür", () => {
    expect(csvAsUtf8(cp1254("Kalem Adı;Şç"), "tr").toString("utf8")).toBe("Kalem Adı;Şç");
    expect(csvAsUtf8(cp1254("ığü"), "en").toString("utf8")).toBe("ığü");
    // "Труба" Windows-1251'de
    const cp1251 = Buffer.from([0xd2, 0xf0, 0xf3, 0xe1, 0xe0]);
    expect(csvAsUtf8(cp1251, "ru").toString("utf8")).toBe("Труба");
  });
});
