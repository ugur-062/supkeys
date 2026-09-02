import { BadRequestException, Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import {
  PRICE_MODE_LABELS,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_EXAMPLE_SHEET,
  PRODUCT_IMPORT_HELP_SHEET,
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_SHEET,
  isCategoryCode,
  matchProductColumn,
  normalizeProductHeader,
  type ProductImportColumnKey,
  type ProductImportResult,
  type ProductImportRow,
} from "@rothern/shared";
import {
  cellToText,
  decodeBase64Strict,
  readUploadedWorksheet,
} from "../../common/files/spreadsheet-reader";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * ÜRÜN EXCEL ŞABLONU — ÜRET + OKU (Faz 4).
 *
 * AI YOK: deterministik, bütçe yemez, her pakete açık. Hiçbir şey YAZMAZ —
 * yalnız ÖNİZLEME döner; yazma normal uçlardan, kullanıcı onayıyla.
 *
 * Sütun tanımı `@rothern/shared` `product-import.ts` (tek kaynak). Dosya
 * okuma `common/files/spreadsheet-reader.ts` (zip bombası, CSV tavanı, MIME
 * sniff, .xlsm reddi — hepsi orada, kopyalanmıyor).
 *
 * ── GÖRSEL EXCEL'DE TAŞINMAZ ──────────────────────────────────────────────
 * İçe aktarılan ürün TASLAK doğar; yayımlamak en az bir görsel istiyor
 * (`productPublishBlockers`). Toplu yükleme kataloğu hızlı kurar, yayımlama
 * bilinçli kalır — 500 ürün tek tıkla vitrine düşmez.
 */
const INK = "18181B";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CSV_BYTES = 1024 * 1024;

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ ŞABLON
  async buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();

    const ws = wb.addWorksheet(PRODUCT_IMPORT_SHEET, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = PRODUCT_IMPORT_COLUMNS.map((c) => ({
      key: c.key,
      width: c.width,
    }));
    const header = ws.addRow(
      PRODUCT_IMPORT_COLUMNS.map((c) => (c.required ? `${c.header} *` : c.header)),
    );
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK}` } };
      cell.alignment = { vertical: "middle" };
    });
    for (let r = 2; r <= PRODUCT_IMPORT_MAX_ROWS + 1; r += 1) {
      const row = ws.getRow(r);
      PRODUCT_IMPORT_COLUMNS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.kind === "number") cell.numFmt = "#,##0.###";
        if (c.kind === "money") cell.numFmt = "#,##0.00";
      });
    }
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: PRODUCT_IMPORT_COLUMNS.length },
    };

    // Nasıl Doldurulur
    const help = wb.addWorksheet(PRODUCT_IMPORT_HELP_SHEET);
    help.columns = [{ width: 24 }, { width: 12 }, { width: 95 }];
    const h = help.addRow(["Sütun", "Zorunlu", "Açıklama"]);
    h.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK}` } };
    });
    for (const c of PRODUCT_IMPORT_COLUMNS) {
      const r = help.addRow([c.header, c.required ? "Evet" : "Hayır", c.hint]);
      r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    }
    help.addRow([]);
    for (const note of [
      `"${PRODUCT_IMPORT_SHEET}" sayfasında 1. satır başlıktır — DEĞİŞTİRMEYİN. Ürünleri 2. satırdan yazın.`,
      `En fazla ${PRODUCT_IMPORT_MAX_ROWS} ürün. Boş satırlar atlanır.`,
      "GÖRSEL Excel ile yüklenemez. İçe aktarılan ürünler TASLAK olur; yayımlamak için panelden en az bir görsel ekleyin.",
      "Aynı Stok Kodu ikinci kez yüklenirse mevcut ürün GÜNCELLENİR — kopya oluşmaz.",
      "Kademeli fiyat tablosu Excel ile girilemez; Fiyat Tipi'ni Kademeli seçip tabloyu panelden ekleyin.",
      "Varyasyonları ayrı ürün olarak açmayın — renk/ölçü farkını kategoriye özel özelliklere yazın.",
    ]) {
      const r = help.addRow([note]);
      r.getCell(1).alignment = { wrapText: true };
      help.mergeCells(`A${r.number}:C${r.number}`);
    }

    // Örnek
    const ex = wb.addWorksheet(PRODUCT_IMPORT_EXAMPLE_SHEET);
    ex.columns = PRODUCT_IMPORT_COLUMNS.map((c) => ({ width: c.width }));
    const eh = ex.addRow(PRODUCT_IMPORT_COLUMNS.map((c) => c.header));
    eh.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK}` } };
    });
    ex.addRow([
      "Dağıtım Panosu 400A IP54",
      "PANO-400",
      "Sanayi tesisleri için 400 amper dağıtım panosu. IP54 koruma, elektrostatik boyalı sac gövde, bakır bara. TSE ve CE belgeli.",
      "39122215",
      "adet",
      "Rothern",
      "RD-400-IP54",
      "dağıtım panosu, elektrik panosu, ip54",
      "Sabit",
      48000,
      "TRY",
      1,
    ]);
    ex.addRow([
      "Çelik Boru DN50",
      "BORU-50",
      "Dikişsiz karbon çeliği boru, DN50, et kalınlığı 3,6 mm. EN 10216 standardında.",
      "40171501",
      "metre",
      "",
      "",
      "çelik boru, dikişsiz boru, dn50",
      "Teklif isteyin",
      "",
      "",
      100,
    ]);

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  // ------------------------------------------------------------ OKUMA
  async parse(input: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<ProductImportResult> {
    const buffer = decodeBase64Strict(input.dataBase64);
    const ws = await readUploadedWorksheet({
      buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
      limits: {
        maxFileBytes: MAX_FILE_BYTES,
        maxCsvBytes: MAX_CSV_BYTES,
        sheetName: PRODUCT_IMPORT_SHEET,
      },
    });
    const result = this.parseWorksheet(ws);
    await this.markUnknownCategories(result.rows);
    return result;
  }

  /**
   * 8 hanelik biçim doğru ama katalogda KARŞILIĞI OLMAYAN kodu düşürür.
   *
   * Biçim denetimi yetmiyor: "39122216" geçerli görünür, katalogda yoksa ürün
   * hiçbir yere bağlanmayan bir koda sahip olur — nitelik mirası boş döner,
   * yayın kapısı ise `categoryId` dolu olduğu için AÇIK kalır. Elle yazılan
   * bir sütunda bu tipik hata; tek sorguyla ayıklanır ve önizlemede görünür.
   */
  private async markUnknownCategories(rows: ProductImportRow[]): Promise<void> {
    const codes = [...new Set(rows.map((r) => r.categoryId).filter((c): c is string => !!c))];
    if (codes.length === 0) return;
    const found = await this.prisma.category.findMany({
      where: { id: { in: codes }, isActive: true },
      select: { id: true },
    });
    const known = new Set(found.map((c) => c.id));
    for (const r of rows) {
      if (r.categoryId && !known.has(r.categoryId)) {
        r.issues.push(`Kategori kodu katalogda yok ("${r.categoryId}") — panelden seçin`);
        r.categoryId = null;
      }
    }
  }

  /**
   * Şablon dışı diziliş de okunur: başlık satırı ilk 15 satırda aranır,
   * başlıklar TR-katlanmış eşlenir (alias dahil). Kullanıcı kendi listesini
   * başlıkları uyarlayarak da yükleyebilsin.
   */
  private parseWorksheet(ws: ExcelJS.Worksheet): ProductImportResult {
    const notices: string[] = [];
    let headerRow = -1;
    let map: Partial<Record<ProductImportColumnKey, number>> = {};

    for (let r = 1; r <= Math.min(15, ws.rowCount); r += 1) {
      const candidate: Partial<Record<ProductImportColumnKey, number>> = {};
      ws.getRow(r).eachCell((cell, col) => {
        const key = matchProductColumn(cellToText(cell.value));
        if (key && candidate[key] == null) candidate[key] = col;
      });
      if (candidate.name != null) {
        headerRow = r;
        map = candidate;
        break;
      }
    }
    if (headerRow === -1) {
      throw new BadRequestException(
        `Başlık satırı bulunamadı — "${PRODUCT_IMPORT_COLUMNS[0].header}" sütunu zorunlu. Şablonu indirip kullanın.`,
      );
    }

    const unknownHeaders: string[] = [];
    ws.getRow(headerRow).eachCell((cell) => {
      const raw = cellToText(cell.value);
      if (raw && !matchProductColumn(raw)) unknownHeaders.push(raw);
    });
    if (unknownHeaders.length > 0) {
      notices.push(
        `Tanınmayan sütun yok sayıldı: ${unknownHeaders.slice(0, 5).join(", ")}`,
      );
    }

    const rows: ProductImportRow[] = [];
    let skipped = 0;
    for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
      if (rows.length >= PRODUCT_IMPORT_MAX_ROWS) {
        skipped = ws.rowCount - r + 1;
        break;
      }
      const row = ws.getRow(r);
      const get = (k: ProductImportColumnKey): string => {
        const col = map[k];
        return col == null ? "" : cellToText(row.getCell(col).value);
      };
      const name = get("name").slice(0, 200);
      // Tamamen boş satır sessizce atlanır (Excel'de sık).
      if (!name && !get("code") && !get("description")) continue;

      const issues: string[] = [];
      if (!name) issues.push("Ürün adı boş");

      const categoryId = get("categoryId").trim();
      if (categoryId && !isCategoryCode(categoryId)) {
        issues.push(`Kategori kodu 8 haneli olmalı ("${categoryId}")`);
      }

      const unit = get("unit").trim() || "adet";

      const rawMode = normalizeProductHeader(get("priceMode"));
      const priceMode = rawMode ? PRICE_MODE_LABELS[rawMode] : "ON_REQUEST";
      if (rawMode && !priceMode) {
        issues.push(
          `Fiyat tipi tanınmadı ("${get("priceMode")}") — "Teklif isteyin" varsayıldı`,
        );
      }
      const mode = priceMode ?? "ON_REQUEST";

      const price = parseNumber(get("price"));
      if (mode === "FIXED" && price == null) {
        issues.push('Fiyat tipi "Sabit" ama birim fiyat boş');
      }

      const keywords = get("keywords")
        .split(/[,;]/)
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 15);

      rows.push({
        rowNumber: r,
        name,
        code: get("code").trim().slice(0, 50) || null,
        description: get("description").slice(0, 5000) || null,
        categoryId: categoryId && isCategoryCode(categoryId) ? categoryId : null,
        unit,
        brand: get("brand").trim().slice(0, 100) || null,
        mpn: get("mpn").trim().slice(0, 100) || null,
        keywords,
        priceMode: mode,
        price: mode === "FIXED" ? price : null,
        currency: get("currency").trim().toUpperCase().slice(0, 3) || null,
        moq: parseNumber(get("moq")),
        issues,
      });
    }

    if (skipped > 0) {
      // Sessiz kırpma YOK: kullanıcı kaç satırın alınmadığını görmeli.
      notices.push(
        `${PRODUCT_IMPORT_MAX_ROWS} satır sınırı aşıldı — ${skipped} satır alınmadı.`,
      );
    }
    if (rows.length === 0) {
      throw new BadRequestException("Dosyada okunabilir ürün satırı bulunamadı");
    }
    return { rows, notices };
  }
}

/** "1.234,56" ve "1,234.56" biçimlerinin ikisini de okur. */
function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const cleaned = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export { XLSX_MIME };
