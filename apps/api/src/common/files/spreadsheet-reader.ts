import { i18nMessage } from "../i18n/http-i18n";
import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { assertZipWithinLimits, XLSX_LOAD_OPTIONS, ZipInspectError } from "./zip-inspect";

/**
 * YÜKLENEN TABLO DOSYASINI OKUMA — TEK KAYNAK.
 *
 * İçe aktarma yolları (ilan kalemi, teklif fiyatı, ÜRÜN kataloğu) aynı
 * düşmanca girdiyi alıyor. Buradaki korumaların HERHANGİ BİRİ bir yolda
 * kopyalanırken atlanırsa o yol açık kalır:
 *
 *  · İSTEMCİ MIME'ına GÜVENİLMEZ — tür imzadan (ZIP "PK") anlaşılır.
 *  · `.xlsm` REDDEDİLİR — makro taşır.
 *  · ZIP BOMBASI: açılmış boyut/giriş tavanı ExcelJS'e VERMEDEN önce
 *    kontrol edilir (ExcelJS tüm XML'i belleğe açar).
 *  · CSV'ye AYRI ve DAHA DAR tavan: `csv.read` dosyanın tamamını hücre
 *    nesnesine açıyor — 3,7 MB dar hücreli CSV ~470-860 MB heap demek
 *    (denetim P5 HIGH).
 *  · Base64 gövdesi katı doğrulanır.
 */
export interface SpreadsheetLimits {
  maxFileBytes: number;
  maxCsvBytes: number;
  /** Tercih edilen sayfa adı; yoksa dolu ilk sayfaya düşülür. */
  sheetName: string;
}

export function decodeBase64Strict(s: string): Buffer {
  const clean = s.replace(/^data:[^;]+;base64,/, "");
  if (!/^[A-Za-z0-9+/=\s]*$/.test(clean)) {
    throw new BadRequestException(i18nMessage("api.files.dosyaVerisiGecersiz"));
  }
  return Buffer.from(clean, "base64");
}

/** ZIP merkezi dizin tavanları → kullanıcı yüzlü 400. */
export function assertXlsxSafe(buffer: Buffer): void {
  try {
    assertZipWithinLimits(buffer);
  } catch (e) {
    if (e instanceof ZipInspectError) {
      throw new BadRequestException(
        e.reason === "corrupt" || e.reason === "zip64"
          ? i18nMessage("api.files.excelDosyasiOkunamadiZip")
          : i18nMessage("api.files.excelDosyasiCokBuyukKarmasik"),
      );
    }
    throw e;
  }
}

/** CSV ayraci ilk satirdan: TR Excel ";" (ondalik ","), digerleri "," ya da TAB. Tum CSV yollari bunu kullanir. */
export function detectCsvDelimiter(buffer: Buffer): string {
  const head = buffer.subarray(0, 4096).toString("utf8").split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of head) if (ch in counts) counts[ch]!++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * Tum CSV okumalari icin ExcelJS secenekleri — TEK KAYNAK (derin denetim
 * MU-19 S029). ExcelJS'in varsayilan `map`i her hucreye once `Number(datum)`
 * ve katı 'MM-DD-YYYY' tarih kalibi uyguluyor: TR binlik "1.500" 1.5'e,
 * GG-AA-YYYY "05-09-2026" 9 Mayis'a donusuyor ve yerel ayristiricilar
 * (parseLocaleNumber/parseImportDate) hic calismiyordu. Ham metin korunur
 * (bos hucre null); sayi/tarih yorumu yalniz yerel ayristiricida, xlsx metin
 * hucresiyle AYNI kuralla yapilir.
 */
export function csvReadOptions(buffer: Buffer): Partial<ExcelJS.CsvReadOptions> {
  return {
    parserOptions: { delimiter: detectCsvDelimiter(buffer) },
    dateFormats: [],
    map: (datum: unknown) => (datum === "" ? null : datum),
  };
}

export async function readUploadedWorksheet(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  limits: SpreadsheetLimits;
}): Promise<ExcelJS.Worksheet> {
  const { buffer, fileName, mimeType, limits } = input;
  if (buffer.length === 0) throw new BadRequestException(i18nMessage("api.files.dosyaBos"));
  if (buffer.length > limits.maxFileBytes) {
    throw new BadRequestException(
      i18nMessage("api.files.dosyaCokBuyukMbSiniri", { round: Math.round(limits.maxFileBytes / 1024 / 1024) }),
    );
  }

  const wb = new ExcelJS.Workbook();
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
  const looksCsv =
    !isZip &&
    (/\.csv$/i.test(fileName) || mimeType === "text/csv") &&
    !buffer.subarray(0, 4096).includes(0);

  if (isZip) {
    if (/\.xlsm$/i.test(fileName)) {
      throw new BadRequestException(
        i18nMessage("api.files.makroluDosyaXlsmKabulEdilmezXlsx"),
      );
    }
    assertXlsxSafe(buffer);
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer, XLSX_LOAD_OPTIONS);
    } catch {
      throw new BadRequestException(
        i18nMessage("api.files.excelDosyasiOkunamadiXlsxOlarakYeniden"),
      );
    }
  } else if (looksCsv) {
    if (buffer.length > limits.maxCsvBytes) {
      throw new BadRequestException(
        i18nMessage("api.files.csvDosyasiCokBuyukSablonuXlsx"),
      );
    }
    try {
      await wb.csv.read(Readable.from(buffer), csvReadOptions(buffer));
    } catch {
      throw new BadRequestException(i18nMessage("api.files.csvDosyasiOkunamadi"));
    }
  } else {
    throw new BadRequestException(
      i18nMessage("api.files.desteklenmeyenDosyaExcelXlsxVeyaCsv"),
    );
  }

  const named = wb.getWorksheet(limits.sheetName);
  const ws = named ?? wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new BadRequestException(i18nMessage("api.files.dosyadaSayfaBulunamadi"));
  return ws;
}

/** exceljs hücre değerini düz metne indirger (richText/formül/hyperlink dahil). */
export function cellToText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    }
    if ("result" in o) return cellToText(o.result as ExcelJS.CellValue);
    if ("text" in o) return String(o.text ?? "").trim();
    if ("hyperlink" in o) return String(o.hyperlink ?? "").trim();
  }
  return "";
}
