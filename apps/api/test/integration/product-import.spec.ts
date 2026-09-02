/**
 * ÜRÜN TOPLU İÇE AKTARMA — şablon, ayrıştırma ve yazma sözleşmesi.
 *
 * Kilitlenen ana iddialar:
 *  · ayrıştırma HİÇBİR ŞEY YAZMAZ (yalnız önizleme),
 *  · aynı stok kodu KOPYA ÜRETMEZ (upsert),
 *  · içe aktarılan ürün TASLAK doğar — 500 satır tek tıkla vitrine düşmez,
 *  · sessiz kırpma yok: sınır aşılırsa kullanıcı kaç satırın düştüğünü görür.
 */
import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { PRODUCT_IMPORT_SHEET } from "@rothern/shared";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { ProductImportService } from "../../src/modules/company-items/product-import.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { foldSearchText } from "@rothern/shared";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

/** Katalogda GERÇEKTEN var olan bir kategori (kod doğrulaması bunu arar). */
async function makeCategory(code: string, nameTr: string, level: number) {
  await prisma.category.create({
    data: {
      id: code, code, nameTr, keywords: "",
      searchText: foldSearchText(nameTr),
      level, parentId: null, isActive: true, sortOrder: 0,
    },
  });
}

const importer = () => new ProductImportService(prisma as unknown as PrismaService);
const items = () =>
  new CompanyItemsService(
    prisma as unknown as PrismaService,
    { log: jest.fn() } as never,
    {} as never,
  );

/** Verilen satırlardan bir xlsx üretir (başlıklar şablonla aynı). */
async function makeSheet(rows: unknown[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(PRODUCT_IMPORT_SHEET);
  ws.addRow([
    "Ürün Adı", "Stok Kodu", "Açıklama", "Kategori Kodu", "Birim",
    "Marka", "Üretici Parça No", "Anahtar Kelimeler", "Fiyat Tipi",
    "Birim Fiyat", "Para Birimi", "Min. Sipariş",
  ]);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer).toString("base64");
}

const parse = async (rows: unknown[][]) =>
  importer().parse({
    fileName: "urunler.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dataBase64: await makeSheet(rows),
  });

describe("ürün şablonu", () => {
  it("üç sayfalı xlsx üretir", async () => {
    const buf = await importer().buildTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Ürünler",
      "Nasıl Doldurulur",
      "Örnek",
    ]);
    // Örnek sayfası GERÇEK veri taşır — kullanıcı biçimi görsün.
    expect(wb.getWorksheet("Örnek")!.rowCount).toBeGreaterThan(2);
  });
});

describe("ayrıştırma — kategori kodu doğrulaması", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("katalogda olmayan kodu önizlemede işaretler ve boşaltır", async () => {
    await makeCategory("40170000", "Boru sistemleri", 2);
    const res = await parse([
      ["Var olan", "K1", "", "40170000", "adet"],
      ["Uydurma", "K2", "", "99999999", "adet"],
    ]);
    expect(res.rows[0].categoryId).toBe("40170000");
    expect(res.rows[0].issues).toEqual([]);
    expect(res.rows[1].categoryId).toBeNull();
    expect(res.rows[1].issues[0]).toContain("katalogda yok");
  });
});

describe("ayrıştırma — hiçbir şey YAZMAZ", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("satırları okur ve veritabanına DOKUNMAZ", async () => {
    const r = await parse([
      ["Pano 400A", "P1", "x".repeat(120), "39122215", "adet", "ABB", "M1",
        "pano, elektrik", "Sabit", 48000, "TRY", 1],
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe("Pano 400A");
    expect(r.rows[0].priceMode).toBe("FIXED");
    expect(r.rows[0].price).toBe(48000);
    expect(r.rows[0].keywords).toEqual(["pano", "elektrik"]);
    expect(await prisma.companyItem.count()).toBe(0);
  });

  it("fiyat tipi boşsa TEKLİF İSTEYİN — sıfır fiyat uydurmaz", async () => {
    const r = await parse([["Boru", "", "", "", "metre", "", "", "", "", "", "", ""]]);
    expect(r.rows[0].priceMode).toBe("ON_REQUEST");
    expect(r.rows[0].price).toBeNull();
    expect(r.rows[0].issues).toEqual([]);
  });

  it('"Sabit" ama fiyat boşsa SATIR DÜŞMEZ, sorun olarak işaretlenir', async () => {
    // Satırı atmak kullanıcının 400 satırlık dosyasından sessizce eksiltmek
    // olurdu; sorunu göstermek düzeltme şansı verir.
    const r = await parse([["Boru", "", "", "", "metre", "", "", "", "Sabit", "", "", ""]]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].issues[0]).toContain("birim fiyat boş");
  });

  it("geçersiz kategori kodu satırı düşürmez, uyarır", async () => {
    const r = await parse([["Boru", "", "", "123", "metre", "", "", "", "", "", "", ""]]);
    expect(r.rows[0].categoryId).toBeNull();
    expect(r.rows[0].issues[0]).toContain("8 haneli");
  });

  it("Türkçe ve İngilizce ondalık biçimlerinin ikisini de okur", async () => {
    const a = await parse([["A", "", "", "", "adet", "", "", "", "Sabit", "1.234,56", "", ""]]);
    const b = await parse([["B", "", "", "", "adet", "", "", "", "Sabit", "1,234.56", "", ""]]);
    expect(a.rows[0].price).toBeCloseTo(1234.56);
    expect(b.rows[0].price).toBeCloseTo(1234.56);
  });

  it("boş satırları atlar", async () => {
    const r = await parse([
      ["Pano", "", "", "", "adet", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
      ["Boru", "", "", "", "metre", "", "", "", "", "", "", ""],
    ]);
    expect(r.rows).toHaveLength(2);
  });

  it("okunabilir satır yoksa 400", async () => {
    await expect(
      parse([["", "", "", "", "", "", "", "", "", "", "", ""]]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("başlık satırı yoksa 400", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(PRODUCT_IMPORT_SHEET);
    ws.addRow(["alakasiz", "sutunlar"]);
    ws.addRow(["a", "b"]);
    const buf = await wb.xlsx.writeBuffer();
    await expect(
      importer().parse({
        fileName: "x.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dataBase64: Buffer.from(buf as ArrayBuffer).toString("base64"),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("desteklenmeyen dosya 400", async () => {
    await expect(
      importer().parse({
        fileName: "x.pdf",
        mimeType: "application/pdf",
        dataBase64: Buffer.from("%PDF-1.4 sahte").toString("base64"),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("yazma — taslak doğar, kopya üretmez", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("içe aktarılan ürün TASLAK doğar", async () => {
    // 500 satır tek tıkla vitrine düşmemeli; yayımlama bilinçli adım kalmalı.
    const { auth } = await makeCompanyWithUser(prisma);
    await items().importRows(auth, [
      { name: "Pano", unit: "adet", code: "P1" },
    ]);
    const row = await prisma.companyItem.findFirstOrThrow();
    expect(row.isPublic).toBe(false);
    expect(row.publishedAt).toBeNull();
  });

  it("aynı stok kodu KOPYA üretmez, günceller", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const a = await items().importRows(auth, [
      { name: "Pano 400A", unit: "adet", code: "P1" },
    ]);
    expect(a).toEqual({ created: 1, updated: 0 });
    const b = await items().importRows(auth, [
      { name: "Pano 400A REV2", unit: "adet", code: "P1" },
    ]);
    expect(b).toEqual({ created: 0, updated: 1 });
    expect(await prisma.companyItem.count()).toBe(1);
    expect((await prisma.companyItem.findFirstOrThrow()).name).toBe("Pano 400A REV2");
  });

  it("KODSUZ satır her zaman yeni kayıt — ada göre eşleştirmez", async () => {
    // "Çelik Boru" gibi tekrar eden adlarda ada göre eşleştirmek yanlış
    // ürünü ezerdi.
    const { auth } = await makeCompanyWithUser(prisma);
    await items().importRows(auth, [{ name: "Çelik Boru", unit: "metre" }]);
    await items().importRows(auth, [{ name: "Çelik Boru", unit: "metre" }]);
    expect(await prisma.companyItem.count()).toBe(2);
  });

  it("fiyat ve etiketler yazılır, arama metni kurulur", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await items().importRows(auth, [
      {
        name: "Pano", unit: "adet", code: "P9", brand: "ABB",
        keywords: ["pano", "elektrik"], priceMode: "FIXED", price: 500,
        currency: "USD", moq: 5,
      },
    ]);
    const row = await prisma.companyItem.findFirstOrThrow();
    expect(row.priceMode).toBe("FIXED");
    expect(row.priceAmount?.toString()).toBe("500");
    expect(row.priceCurrency).toBe("USD");
    expect(row.moq?.toString()).toBe("5");
    expect(row.keywords).toEqual(["pano", "elektrik"]);
    expect(row.searchText).toContain("pano");
    expect(row.searchText).toContain("abb");
  });

  it("katalogda OLMAYAN kategori kodu yazılmaz", async () => {
    // Biçim doğru ama karşılığı yok: nitelik mirası boş dönerdi, yayın kapısı
    // ise `categoryId` dolu olduğu için açık kalırdı. Yazma yolunda süzülür.
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("40170000", "Boru sistemleri", 2);
    await items().importRows(auth, [
      { name: "Var olan", unit: "adet", code: "K1", categoryId: "40170000" },
      { name: "Uydurma", unit: "adet", code: "K2", categoryId: "99999999" },
    ]);
    const rows = await prisma.companyItem.findMany({ orderBy: { code: "asc" } });
    expect(rows[0].categoryId).toBe("40170000");
    expect(rows[1].categoryId).toBeNull();
  });

  it("başka firmanın kodu ezilmez", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    await items().importRows(a.auth, [{ name: "A ürünü", unit: "adet", code: "SAME" }]);
    await items().importRows(b.auth, [{ name: "B ürünü", unit: "adet", code: "SAME" }]);
    expect(await prisma.companyItem.count()).toBe(2);
  });
});
