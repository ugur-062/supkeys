import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { assertZipWithinLimits, ZipInspectError } from "./zip-inspect";

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
    throw new BadRequestException("Dosya verisi geçersiz");
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
          ? "Excel dosyası okunamadı — .xlsx olarak yeniden kaydedip deneyin"
          : "Excel dosyası çok büyük/karmaşık — tek sayfa bırakıp yeniden deneyin",
      );
    }
    throw e;
  }
}

function detectCsvDelimiter(buffer: Buffer): string {
  const head = buffer.subarray(0, 4096).toString("utf8").split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of head) if (ch in counts) counts[ch]!++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
}

export async function readUploadedWorksheet(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  limits: SpreadsheetLimits;
}): Promise<ExcelJS.Worksheet> {
  const { buffer, fileName, mimeType, limits } = input;
  if (buffer.length === 0) throw new BadRequestException("Dosya boş");
  if (buffer.length > limits.maxFileBytes) {
    throw new BadRequestException(
      `Dosya çok büyük (${Math.round(limits.maxFileBytes / 1024 / 1024)} MB sınırı)`,
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
        "Makrolu dosya (.xlsm) kabul edilmez — .xlsx olarak kaydedin",
      );
    }
    assertXlsxSafe(buffer);
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException(
        "Excel dosyası okunamadı — .xlsx olarak yeniden kaydedip deneyin",
      );
    }
  } else if (looksCsv) {
    if (buffer.length > limits.maxCsvBytes) {
      throw new BadRequestException(
        "CSV dosyası çok büyük — şablonu .xlsx olarak kaydedip yükleyin (CSV için sınır 1 MB)",
      );
    }
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

  const named = wb.getWorksheet(limits.sheetName);
  const ws = named ?? wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new BadRequestException("Dosyada sayfa bulunamadı");
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
