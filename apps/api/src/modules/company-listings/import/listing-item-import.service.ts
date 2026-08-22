import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ITEM_IMPORT_EXAMPLE_SHEET,
  ITEM_IMPORT_HELP_SHEET,
  ITEM_IMPORT_MAX_FILE_BYTES,
  ITEM_IMPORT_MAX_ROWS,
  ITEM_IMPORT_SHEET,
  MAX_MONEY,
  MAX_QUANTITY,
  MIN_MONEY,
  MIN_QUANTITY,
  MONEY_DECIMALS,
  QUANTITY_DECIMALS,
  itemImportColumnsFor,
  matchImportColumn,
  type ItemImportColumn,
  type ItemImportColumnKey,
  type ItemImportItem,
  type ItemImportResult,
  type ItemImportRow,
} from "@rothern/shared";
import ExcelJS from "exceljs";
import { Readable } from "stream";

/**
 * Kalem Excel şablonu — ÜRET + OKU (2026-08-22). AI YOK: deterministik,
 * bütçe yemez, her pakete açık. Hiçbir şey YAZMAZ — yalnız önizleme döner;
 * ihale oluşturma normal POST /company/listings (DTO ikinci kez doğrular).
 *
 * Sütun tanımı @rothern/shared `item-import.ts` (tek kaynak). Parser şablon
 * dışı başlık dizilişine de toleranslı: başlık satırını ilk 15 satırda arar,
 * başlıkları TR-katlanmış eşler (alias'lar dahil) — kullanıcı kendi listesini
 * başlıkları uyarlayarak da yükleyebilir.
 */

const INK = "18181B";
const INK_LIGHT = "F4F4F5";
const MUTED = "71717A";
const LOCKED_FILL = "FAFAFA";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface TemplateOptions {
  listingType: "ALIM" | "SATIS";
  priceScope?: "TOPLU" | "KALEM";
}

@Injectable()
export class ListingItemImportService {
  // ------------------------------------------------------------ ŞABLON
  async buildTemplate(opts: TemplateOptions): Promise<Buffer> {
    const cols = itemImportColumnsFor(opts);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();

    // 1) Kalemler — yalnız başlık; kullanıcı 2. satırdan itibaren doldurur.
    const ws = wb.addWorksheet(ITEM_IMPORT_SHEET, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = cols.map((c) => ({
      key: c.key,
      width: c.width,
    }));
    const header = ws.addRow(cols.map((c) => (c.required ? `${c.header} *` : c.header)));
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK}` } };
      cell.alignment = { vertical: "middle" };
      cell.protection = { locked: true };
    });
    // Veri hücreleri: sayı/para/tarih biçimleri + kilit AÇIK (başlık kilitli kalır).
    for (let r = 2; r <= ITEM_IMPORT_MAX_ROWS + 1; r++) {
      const row = ws.getRow(r);
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.protection = { locked: false };
        if (c.kind === "number") cell.numFmt = "#,##0.###";
        if (c.kind === "money") cell.numFmt = "#,##0.00";
        if (c.kind === "date") cell.numFmt = "dd.mm.yyyy";
      });
    }
    // Sayfa koruması (parolasız: kullanıcı isterse kaldırır) — başlıklar
    // yanlışlıkla bozulmasın; veri alanı serbest.
    await ws.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatColumns: true,
      formatRows: true,
      insertRows: true,
      deleteRows: true,
      sort: true,
      autoFilter: true,
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

    // 2) Nasıl Doldurulur
    const help = wb.addWorksheet(ITEM_IMPORT_HELP_SHEET);
    help.columns = [{ width: 30 }, { width: 14 }, { width: 90 }];
    const h0 = help.addRow(["Sütun", "Zorunlu", "Açıklama"]);
    h0.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK}` } };
    });
    for (const c of cols) {
      const r = help.addRow([c.header, c.required ? "Evet" : "Hayır", c.hint]);
      r.getCell(3).alignment = { wrapText: true, vertical: "top" };
      if (c.required) r.getCell(2).font = { bold: true };
    }
    help.addRow([]);
    const notes = [
      `"${ITEM_IMPORT_SHEET}" sayfasında 1. satır başlıktır — DEĞİŞTİRMEYİN. Kalemleri 2. satırdan itibaren alt alta yazın.`,
      `En fazla ${ITEM_IMPORT_MAX_ROWS} kalem. Boş satırlar atlanır.`,
      "Fiyatlar KDV HARİÇ girilir. Ondalık ayracı virgül veya nokta olabilir (12,5 ya da 12.5).",
      "Tarihler GG.AA.YYYY (ör. 15.09.2026) ya da Excel tarih hücresi olabilir.",
      "Dosyayı kaydedip (.xlsx) ihale formundaki 'Excel ile İçe Aktar' ile yükleyin; aktarmadan önce önizleme görürsünüz.",
      "Sütunların sırası önemli değil; başlık metni aynı kaldığı sürece sütun ekleyip çıkarabilirsiniz (zorunlular hariç).",
    ];
    for (const n of notes) {
      const r = help.addRow([n]);
      help.mergeCells(r.number, 1, r.number, 3);
      r.getCell(1).alignment = { wrapText: true };
      r.getCell(1).font = { color: { argb: `FF${MUTED}` } };
    }

    // 3) Örnek — görsel rehber (parser bu sayfayı OKUMAZ).
    const ex = wb.addWorksheet(ITEM_IMPORT_EXAMPLE_SHEET);
    ex.columns = cols.map((c) => ({ width: c.width }));
    const exh = ex.addRow(cols.map((c) => (c.required ? `${c.header} *` : c.header)));
    exh.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK_LIGHT}` } };
    });
    const samples: Record<ItemImportColumnKey, unknown>[] = [
      {
        name: 'Çelik boru 2" DN50 dikişsiz',
        quantity: 120,
        unit: "m",
        description: "ST37, 6 m boy, kaynaklı bağlantıya uygun",
        materialCode: "BRU-200",
        requiredByDate: "15.09.2026",
        targetUnitPrice: 185,
        minUnitPrice: 150,
        buyNowUnitPrice: 210,
      },
      {
        name: "Dirsek 90° 2\"",
        quantity: 40,
        unit: "adet",
        description: "",
        materialCode: "DRS-290",
        requiredByDate: "",
        targetUnitPrice: 42.5,
        minUnitPrice: 35,
        buyNowUnitPrice: 50,
      },
      {
        name: "Flanş DN50 PN16",
        quantity: 12.5,
        unit: "kg",
        description: "Kör flanş, galvaniz",
        materialCode: "",
        requiredByDate: "30.09.2026",
        targetUnitPrice: "",
        minUnitPrice: "",
        buyNowUnitPrice: "",
      },
    ];
    for (const s of samples) {
      const r = ex.addRow(cols.map((c) => s[c.key] ?? ""));
      r.eachCell((cell) => (cell.font = { color: { argb: `FF${MUTED}` } }));
      r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LOCKED_FILL}` } };
    }

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  // ------------------------------------------------------------ OKUMA
  async parse(input: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
    listingType: "ALIM" | "SATIS";
    priceScope?: "TOPLU" | "KALEM";
  }): Promise<ItemImportResult> {
    const buffer = decodeBase64Strict(input.dataBase64);
    if (buffer.length === 0) throw new BadRequestException("Dosya boş");
    if (buffer.length > ITEM_IMPORT_MAX_FILE_BYTES) {
      throw new BadRequestException("Dosya çok büyük (5 MB sınırı)");
    }
    const ws = await this.readWorksheet(buffer, input.fileName, input.mimeType);
    const allowed = itemImportColumnsFor(input);
    return parseWorksheet(ws, allowed);
  }

  /** xlsx (zip imzası) veya csv (metin) — istemci MIME'ına güvenilmez. */
  private async readWorksheet(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<ExcelJS.Worksheet> {
    const wb = new ExcelJS.Workbook();
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
    const looksCsv =
      !isZip &&
      (/\.csv$/i.test(fileName) || mimeType === "text/csv") &&
      !buffer.subarray(0, 4096).includes(0);
    if (isZip) {
      if (/\.xlsm$/i.test(fileName)) {
        throw new BadRequestException("Makrolu dosya (.xlsm) kabul edilmez — .xlsx olarak kaydedin");
      }
      try {
        await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      } catch {
        throw new BadRequestException("Excel dosyası okunamadı — .xlsx olarak yeniden kaydedip deneyin");
      }
    } else if (looksCsv) {
      try {
        await wb.csv.read(Readable.from(buffer), {
          parserOptions: { delimiter: detectCsvDelimiter(buffer) },
        });
      } catch {
        throw new BadRequestException("CSV dosyası okunamadı");
      }
    } else {
      throw new BadRequestException(
        "Desteklenmeyen dosya — Excel (.xlsx) veya CSV yükleyin. Şablonu indirip kullanabilirsiniz.",
      );
    }
    const named = wb.getWorksheet(ITEM_IMPORT_SHEET);
    const ws = named ?? wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException("Dosyada sayfa bulunamadı");
    return ws;
  }
}

// ---------------------------------------------------------------- yardımcılar

function decodeBase64Strict(s: string): Buffer {
  const clean = s.replace(/^data:[^;]+;base64,/, "");
  if (!/^[A-Za-z0-9+/=\s]*$/.test(clean)) {
    throw new BadRequestException("Dosya verisi geçersiz");
  }
  return Buffer.from(clean, "base64");
}

function detectCsvDelimiter(buffer: Buffer): string {
  const head = buffer.subarray(0, 4096).toString("utf8").split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of head) if (ch in counts) counts[ch]!++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
}

/** exceljs hücre değerini düz metne indirger (richText/formül/hyperlink/Date dahil). */
export function cellText(v: ExcelJS.CellValue): string | number | Date | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    }
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if ("text" in o && typeof o.text === "string") return o.text;
    if ("error" in o) return null;
  }
  return String(v);
}

/** "1.234,5" / "1,234.5" / "12,5" / "12.5" → number (TR ve EN biçimleri). */
export function parseLocaleNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().replace(/\s/g, "").replace(/[₺$€£]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Son görülen ayraç ondalık, diğeri binlik.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    // Tek virgül: ondalık (TR). Birden çok virgül: binlik.
    s = (s.match(/,/g) ?? []).length === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    // "1.234" (3 hane) binlik sayılır mı? Belirsiz — tek nokta + tam 3 hane sonrası → binlik.
    const parts = s.split(".");
    if (parts.length > 2) s = s.replace(/\./g, "");
    else if (
      parts.length === 2 &&
      parts[1]!.length === 3 &&
      parts[0]!.length <= 3 &&
      /^[1-9]\d*$/.test(parts[0]!)
    ) {
      // "1.234" → 1234 (TR binlik). "0.500"/"12.500" 3 ondalık miktar da olabilir ama
      // TR kullanıcı 12,500 yazar; ikilem kabul: tam-3-hane+nokta = binlik.
      s = s.replace(".", "");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function decimalsOf(n: number): number {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

/** Date / "GG.AA.YYYY" / "YYYY-MM-DD" / "GG/AA/YYYY" → ISO YYYY-MM-DD. */
export function parseImportDate(v: unknown): { iso: string | null; invalid: boolean } {
  if (v == null || v === "") return { iso: null, invalid: false };
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return { iso: null, invalid: true };
    // exceljs tarih hücresini UTC gece yarısı olarak verir — UTC parçaları kullan.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return { iso: `${y}-${m}-${d}`, invalid: false };
  }
  const s = String(v).trim();
  let y: number, m: number, d: number;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) {
    d = +mt[1]!; m = +mt[2]!; y = +mt[3]!;
  } else if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) {
    y = +mt[1]!; m = +mt[2]!; d = +mt[3]!;
  } else {
    return { iso: null, invalid: true };
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { iso: null, invalid: true };
  }
  return {
    iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    invalid: false,
  };
}

/**
 * Başlık satırını bul (ilk 15 satır): en çok sütun eşleyen satır. Zorunlu
 * sütunlar (Kalem Adı, Miktar, Birim) eşleşmezse şablon değildir.
 */
export function locateHeader(
  ws: ExcelJS.Worksheet,
  allowed: ItemImportColumn[],
): { headerRow: number; map: Map<number, ItemImportColumnKey> } {
  const allowedKeys = new Set(allowed.map((c) => c.key));
  let best: { headerRow: number; map: Map<number, ItemImportColumnKey> } | null = null;
  const limit = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    const map = new Map<number, ItemImportColumnKey>();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = matchImportColumn(cellText(cell.value));
      if (key && allowedKeys.has(key) && ![...map.values()].includes(key)) map.set(col, key);
    });
    if (!best || map.size > best.map.size) best = { headerRow: r, map };
  }
  const keys = new Set(best?.map.values() ?? []);
  if (!best || !keys.has("name") || !keys.has("quantity") || !keys.has("unit")) {
    throw new BadRequestException(
      "Şablon sütunları bulunamadı — başlık satırında en az 'Kalem Adı', 'Miktar' ve 'Birim' olmalı. Şablonu indirip kullanın.",
    );
  }
  return best;
}

export function parseWorksheet(
  ws: ExcelJS.Worksheet,
  allowed: ItemImportColumn[],
): ItemImportResult {
  const { headerRow, map } = locateHeader(ws, allowed);
  const columns = [...map.values()];
  const rows: ItemImportRow[] = [];
  let truncated = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: Partial<Record<ItemImportColumnKey, unknown>> = {};
    let any = false;
    for (const [col, key] of map) {
      const v = cellText(row.getCell(col).value);
      if (v != null && String(v).trim() !== "") any = true;
      raw[key] = v;
    }
    if (!any) continue; // boş satır
    if (rows.length >= ITEM_IMPORT_MAX_ROWS) {
      truncated++;
      continue;
    }
    rows.push(validateRow(r, raw, allowed));
  }

  const validCount = rows.filter((x) => x.errors.length === 0).length;
  return {
    sheetName: ws.name,
    columns,
    rows,
    validCount,
    invalidCount: rows.length - validCount,
    truncated,
  };
}

function validateRow(
  rowNumber: number,
  raw: Partial<Record<ItemImportColumnKey, unknown>>,
  allowed: ItemImportColumn[],
): ItemImportRow {
  const errors: string[] = [];
  const has = (k: ItemImportColumnKey) => allowed.some((c) => c.key === k);
  const text = (k: ItemImportColumnKey, label: string, max: number, required: boolean) => {
    const v = raw[k];
    const s = v == null ? "" : String(v instanceof Date ? v.toISOString() : v).trim();
    if (!s) {
      if (required) errors.push(`${label} boş`);
      return null;
    }
    if (s.length > max) {
      errors.push(`${label} çok uzun (en fazla ${max} karakter)`);
      return s.slice(0, max);
    }
    return s;
  };
  const money = (k: ItemImportColumnKey, label: string) => {
    if (!has(k)) return null;
    const v = raw[k];
    if (v == null || String(v).trim() === "") return null;
    const n = parseLocaleNumber(v);
    if (n == null) {
      errors.push(`${label} sayı değil`);
      return null;
    }
    if (n < MIN_MONEY || n > MAX_MONEY) {
      errors.push(`${label} 0,01 ile 1e15 arasında olmalı`);
      return null;
    }
    if (decimalsOf(n) > MONEY_DECIMALS) {
      errors.push(`${label} en fazla ${MONEY_DECIMALS} ondalık olabilir`);
      return null;
    }
    return n;
  };

  const name = text("name", "Kalem Adı", 200, true);
  const unit = text("unit", "Birim", 20, true);
  const description = text("description", "Açıklama", 2000, false);
  const materialCode = text("materialCode", "Malzeme Kodu", 50, false);

  let quantity: number | null = null;
  {
    const v = raw.quantity;
    if (v == null || String(v).trim() === "") errors.push("Miktar boş");
    else {
      const n = parseLocaleNumber(v);
      if (n == null) errors.push("Miktar sayı değil");
      else if (n < MIN_QUANTITY || n > MAX_QUANTITY) errors.push("Miktar 0,001 ile 1.000.000.000 arasında olmalı");
      else if (decimalsOf(n) > QUANTITY_DECIMALS) errors.push(`Miktar en fazla ${QUANTITY_DECIMALS} ondalık olabilir`);
      else quantity = n;
    }
  }

  let requiredByDate: string | null = null;
  if (has("requiredByDate")) {
    const d = parseImportDate(raw.requiredByDate);
    if (d.invalid) errors.push("Termin tarihi geçersiz (GG.AA.YYYY bekleniyor)");
    requiredByDate = d.iso;
  }

  const targetUnitPrice = money("targetUnitPrice", "Hedef Birim Fiyat");
  const minUnitPrice = money("minUnitPrice", "Taban Birim Fiyat");
  const buyNowUnitPrice = money("buyNowUnitPrice", "Hemen-Al Birim Fiyat");
  if (minUnitPrice != null && buyNowUnitPrice != null && buyNowUnitPrice < minUnitPrice) {
    errors.push("Hemen-Al fiyatı tabandan küçük olamaz");
  }

  const item: ItemImportItem = {
    name,
    description,
    quantity,
    unit,
    materialCode,
    requiredByDate,
    targetUnitPrice,
    minUnitPrice,
    buyNowUnitPrice,
  };
  return { rowNumber, item, errors };
}

export { XLSX_MIME };
