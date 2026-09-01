import ExcelJS from "exceljs";
import { ITEM_IMPORT_SHEET, matchImportColumn } from "@rothern/shared";
import {
  ListingItemImportService,
  parseLocaleNumber,
  parseImportDate,
} from "../../src/modules/company-listings/import/listing-item-import.service";

/**
 * Kalem Excel şablonu — şablon ↔ parser ROUND-TRIP + satır-hata matrisi.
 * DB yok (saf unit). Sözleşme: şablon üreticinin başlıklarını parser tanır;
 * hatalı satır AKTARILMAZ ama önizlemede gösterilir; geçerli satır AiTenderDraftItem
 * şeklinde döner (web aynı mapAiDraftToForm köprüsünü kullanır).
 */

const svc = new ListingItemImportService();

async function fillTemplate(
  opts: { listingType: "ALIM" | "SATIS"; priceScope?: "TOPLU" | "KALEM" },
  rows: unknown[][],
): Promise<string> {
  const tpl = await svc.buildTemplate(opts);
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
  it("ALIM şablonu: Kalemler + Nasıl Doldurulur + Örnek; başlıklar parser'ın tanıdığı adlar", async () => {
    const buf = await svc.buildTemplate({ listingType: "ALIM" });
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

  it("SATIS+KALEM şablonu taban/hemen-al sütunlarını içerir; SATIS+TOPLU içermez", async () => {
    const kalem = await svc.buildTemplate({ listingType: "SATIS", priceScope: "KALEM" });
    const toplu = await svc.buildTemplate({ listingType: "SATIS", priceScope: "TOPLU" });
    const cols = async (b: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(b as unknown as ArrayBuffer);
      const out: string[] = [];
      wb.getWorksheet(ITEM_IMPORT_SHEET)!.getRow(1).eachCell((c) => out.push(String(matchImportColumn(c.value))));
      return out;
    };
    expect(await cols(kalem)).toEqual(expect.arrayContaining(["minUnitPrice", "buyNowUnitPrice"]));
    expect(await cols(toplu)).not.toEqual(expect.arrayContaining(["minUnitPrice"]));
  });
});

describe("round-trip: doldurulmuş şablon → parse", () => {
  it("geçerli satırlar aktarılır; hatalı satırlar errors ile önizlemede kalır; boş satır atlanır", async () => {
    const b64 = await fillTemplate({ listingType: "ALIM" }, [
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
      minUnitPrice: null,
      buyNowUnitPrice: null,
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
    const b64 = await fillTemplate({ listingType: "ALIM" }, [
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

  it("SATIS+KALEM: hemen-al < taban → satır hatası; ALIM'da taban/hemen-al sütunları yok sayılır", async () => {
    const b64 = await fillTemplate({ listingType: "SATIS", priceScope: "KALEM" }, [
      ["Ürün A", 10, "adet", "", "", "", "", 100, 80],
      ["Ürün B", 10, "adet", "", "", "", "", 100, 120],
    ]);
    const res = await svc.parse({
      fileName: "s.xlsx",
      mimeType: "x",
      dataBase64: b64,
      listingType: "SATIS",
      priceScope: "KALEM",
    });
    expect(res.rows[0]!.errors).toEqual(["Hemen-Al fiyatı tabandan küçük olamaz"]);
    expect(res.rows[1]!.errors).toEqual([]);
    expect(res.rows[1]!.item).toMatchObject({ minUnitPrice: 100, buyNowUnitPrice: 120 });

    // Aynı dosya ALIM olarak okunursa taban/hemen-al sütunları allowed dışı → eşlenmez, hata yok.
    const alim = await svc.parse({ fileName: "s.xlsx", mimeType: "x", dataBase64: b64, listingType: "ALIM" });
    expect(alim.columns).not.toContain("minUnitPrice");
    expect(alim.rows[0]!.errors).toEqual([]);
    expect(alim.rows[0]!.item.minUnitPrice).toBeNull();
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
  it("parseImportDate", () => {
    expect(parseImportDate("15.09.2026")).toEqual({ iso: "2026-09-15", invalid: false });
    expect(parseImportDate("15/09/2026")).toEqual({ iso: "2026-09-15", invalid: false });
    expect(parseImportDate("2026-09-15")).toEqual({ iso: "2026-09-15", invalid: false });
    expect(parseImportDate("31.02.2026").invalid).toBe(true);
    expect(parseImportDate("")).toEqual({ iso: null, invalid: false });
    expect(parseImportDate(new Date(Date.UTC(2026, 0, 5)))).toEqual({ iso: "2026-01-05", invalid: false });
  });
});
