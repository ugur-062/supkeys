import { BadRequestException, Logger } from "@nestjs/common";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { PDFParse } from "pdf-parse";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { assertZipWithinLimits, ZipInspectError } from "../../../common/files/zip-inspect";
import sharp from "sharp";
import heicConvert from "heic-convert";
import type { AiInlinePart } from "../providers/ai-provider.interface";

/**
 * Faz AI-1 — GİRDİ YÖNLENDİRİCİ (maliyetin belkemiği):
 * 1. Metin katmanlı PDF → metin çıkarımı (bedava) → TEXT yolu (en ucuz, varsayılan).
 * 2. Taranmış/karışık PDF → PDF DOĞRUDAN Gemini'ye (inlineData, ~258 token/sayfa;
 *    render kütüphanesi yok — kullanıcı kararı 2026-07-24).
 * 3. Fotoğraf (jpg/png/webp/heic) → HEIC decode + sharp ≤1500px → VISION.
 * 4. Excel/CSV (xlsx zip imzası / .csv metin) → sayfa sayfa metin tablo → TEXT
 *    (2026-08-22: "Belgeden Doldur (AI)" serbest tabloyu da okur; şablon Excel
 *    için AI'sız deterministik yol ayrı — listing-item-import).
 * Ayrı OCR servisi YOK — Gemini vision hem okur hem yapılandırır.
 *
 * Sayfa tavanı (config.maxPages) iki yolda da uygulanır. Üçüncü bir maliyet
 * tavanı YOK — AI-0'ın istek-başı %5 tavanı son savunmadır.
 */

export type AiExtractRoute = "text" | "pdf_vision" | "image_vision";

export interface RoutedInput {
  route: AiExtractRoute;
  /** TEXT yolunda sayfa-işaretli belge metni; vision'da undefined. */
  documentText?: string;
  /** Vision yollarında Gemini part'ları (PDF tek part / görüntüler çoklu part). */
  parts?: AiInlinePart[];
  pages: number;
  textPages: number;
  scanPages: number;
  /** Metin-dışı girdinin token tahmini (bütçe rezervasyonuna eklenir). */
  extraInputTokenEstimate: number;
}

/** Bir sayfada bundan az çıkarılabilir karakter varsa "taranmış" sayılır. */
const MIN_TEXT_CHARS_PER_PAGE = 100;
/** Ham telefon fotoğrafı ASLA gönderilmez — en büyük tasarruf kalemi. */
const MAX_IMAGE_WIDTH = 1500;
const JPEG_QUALITY = 80;
/** Gemini inline istek pratiği + base64 şişmesi: dosya başına ham tavan. */
const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Token tahminleri (fail-closed, yüksek uç): PDF native ~258/sayfa, görüntü ~1290 (1500px). */
const PDF_PAGE_TOKEN_ESTIMATE = 300;
const IMAGE_TOKEN_ESTIMATE = 1300;

const PDF_MIME = "application/pdf";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Sayfa başına okunan satır tavanı (token koruması). */
const MAX_SHEET_ROWS = 500;
const MAX_SHEET_COLS = 30;
const MAX_CELL_CHARS = 200;
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function routeExtractInput(
  files: { key: string; buffer: Buffer }[],
  maxPages: number,
): Promise<RoutedInput> {
  if (files.length === 0) {
    throw new BadRequestException("En az bir dosya gerekli");
  }
  for (const f of files) {
    if (f.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException(
        "Dosya çok büyük (15 MB sınırı) — belgeyi bölerek veya sıkıştırarak deneyin",
      );
    }
  }

  // Magic-bytes: istemci MIME'ına güvenilmez — içerik imzasından tespit.
  const typed = await Promise.all(
    files.map(async (f) => ({
      ...f,
      mime: (await fileTypeFromBuffer(f.buffer))?.mime ?? null,
    })),
  );

  const pdfs = typed.filter((f) => f.mime === PDF_MIME);
  const images = typed.filter((f) => f.mime != null && IMAGE_MIMES.has(f.mime));
  // Tablo: xlsx (zip imzası file-type ile) veya csv (file-type metni tanımaz →
  // anahtar uzantısı + null-byte yokluğu).
  const sheets = typed.filter(
    (f) => f.mime === XLSX_MIME || (f.mime == null && isLikelyCsv(f.key, f.buffer)),
  );
  const unknown = typed.filter(
    (f) => !pdfs.includes(f) && !images.includes(f) && !sheets.includes(f),
  );
  if (unknown.length > 0) {
    throw new BadRequestException(
      "Desteklenmeyen dosya türü — PDF, fotoğraf (JPG/PNG/WebP/HEIC) veya Excel/CSV yükleyin",
    );
  }
  const kinds = [pdfs.length > 0, images.length > 0, sheets.length > 0].filter(Boolean).length;
  if (kinds > 1 || pdfs.length > 1 || sheets.length > 1) {
    throw new BadRequestException(
      "Tek seferde ya BİR PDF, ya BİR Excel/CSV ya da fotoğraflar yükleyin (karışık gönderilemez)",
    );
  }

  if (pdfs.length === 1) {
    return routePdf(pdfs[0]!.buffer, maxPages);
  }
  if (sheets.length === 1) {
    return routeSpreadsheet(sheets[0]!.buffer, sheets[0]!.mime === XLSX_MIME, maxPages);
  }

  // Fotoğraf yolu — hepsi küçültülür, TEK çağrının çoklu part'ları olur.
  if (images.length > maxPages) {
    throw new BadRequestException(
      `Belge çok uzun (en fazla ${maxPages} görüntü) — ilgili bölümü seçin`,
    );
  }
  const parts: AiInlinePart[] = [];
  for (const img of images) {
    parts.push(await toResizedJpegPart(img.buffer, img.mime!));
  }
  return {
    route: "image_vision",
    parts,
    pages: images.length,
    textPages: 0,
    scanPages: images.length,
    extraInputTokenEstimate: images.length * IMAGE_TOKEN_ESTIMATE,
  };
}

function isLikelyCsv(key: string, buffer: Buffer): boolean {
  return /\.csv$/i.test(key) && !buffer.subarray(0, 4096).includes(0);
}

/**
 * Excel/CSV → sayfa-işaretli metin tablo ("=== Sayfa: X ===" + "| a | b |"
 * satırları). Formül hücreleri önbellek sonucuyla, tarih hücreleri ISO ile
 * gelir. Boş satırlar atlanır; tavanlar token koruması (MAX_SHEET_ROWS/COLS).
 * Her sayfa = 1 "page" (maxPages tavanına tabi).
 */
async function routeSpreadsheet(
  buffer: Buffer,
  isXlsx: boolean,
  maxPages: number,
): Promise<RoutedInput> {
  const wb = new ExcelJS.Workbook();
  if (isXlsx) {
    // Zip bombası koruması (denetim 2026-08-23): açılmış boyut tavanı yüklemeden önce.
    try {
      assertZipWithinLimits(buffer);
    } catch (e) {
      if (e instanceof ZipInspectError) {
        throw new BadRequestException(
          e.reason === "corrupt" || e.reason === "zip64"
            ? "Tablo dosyası okunamadı — .xlsx olarak yeniden kaydedip deneyin"
            : "Tablo dosyası çok büyük — ilgili sayfayı ayrı, küçük bir dosyada yükleyin",
        );
      }
      throw e;
    }
  }
  try {
    if (isXlsx) await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    else await wb.csv.read(Readable.from(buffer));
  } catch {
    throw new BadRequestException("Tablo dosyası okunamadı — .xlsx veya .csv olarak kaydedip deneyin");
  }
  const sheets = wb.worksheets.filter((w) => w.rowCount > 0);
  if (sheets.length === 0) throw new BadRequestException("Tablo boş görünüyor");
  if (sheets.length > maxPages) {
    throw new BadRequestException(
      `Belge çok uzun (en fazla ${maxPages} sayfa) — ilgili sayfaları ayrı dosyada yükleyin`,
    );
  }
  const chunks: string[] = [];
  let totalChars = 0;
  sheets.forEach((ws, i) => {
    const lines: string[] = [`=== Sayfa ${i + 1}: ${ws.name} ===`];
    let rows = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows >= MAX_SHEET_ROWS) return;
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(row.cellCount, MAX_SHEET_COLS); c++) {
        cells.push(sheetCellText(row.getCell(c).value));
      }
      if (cells.every((x) => x === "")) return;
      rows++;
      lines.push(`| ${cells.join(" | ")} |`);
    });
    const text = lines.join("\n");
    totalChars += text.length;
    chunks.push(text);
  });
  if (totalChars < 20) throw new BadRequestException("Tablo boş görünüyor");
  return {
    route: "text",
    documentText: chunks.join("\n\n"),
    pages: sheets.length,
    textPages: sheets.length,
    scanPages: 0,
    extraInputTokenEstimate: 0,
  };
}

function sheetCellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : "";
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").slice(0, MAX_CELL_CHARS);
    if ("result" in o) return sheetCellText(o.result as ExcelJS.CellValue);
    if (typeof o.text === "string") return o.text.slice(0, MAX_CELL_CHARS);
    return "";
  }
  return String(v).replace(/\s+/g, " ").trim().slice(0, MAX_CELL_CHARS);
}

async function routePdf(buffer: Buffer, maxPages: number): Promise<RoutedInput> {
  // pdf-parse v2: sayfa-bazlı metin TextResult.pages'ten gelir.
  let pageTexts: string[];
  let pages: number;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    pages = result.total;
    pageTexts = result.pages.map((p) =>
      (p.text ?? "").replace(/\s+/g, " ").trim(),
    );
  } catch (err) {
    // Teşhis için gerçek sebep loglanır (kullanıcıya sızdırılmaz).
    new Logger("AiExtractRouter").warn(
      `PDF parse hatası: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new BadRequestException(
      "PDF okunamadı — dosya bozuk veya şifreli olabilir",
    );
  } finally {
    await parser.destroy().catch(() => undefined);
  }
  if (pages > maxPages) {
    throw new BadRequestException(
      `Belge çok uzun (${pages} sayfa, en fazla ${maxPages}) — ilgili bölümü seçin`,
    );
  }

  const scanPages = pageTexts.filter(
    (t) => t.length < MIN_TEXT_CHARS_PER_PAGE,
  ).length;
  const textPages = pageTexts.length - scanPages;

  // HERHANGİ bir sayfa taranmışsa belgenin TAMAMI vision'a gider (PDF doğrudan;
  // Gemini metinli sayfaları da native okur — hibrit karmaşıklığına gerek yok).
  if (scanPages > 0 || pageTexts.length === 0) {
    return {
      route: "pdf_vision",
      parts: [{ mimeType: PDF_MIME, data: buffer.toString("base64") }],
      pages,
      textPages,
      scanPages: pages - textPages,
      extraInputTokenEstimate: pages * PDF_PAGE_TOKEN_ESTIMATE,
    };
  }

  const documentText = pageTexts
    .map((t, i) => `[Sayfa ${i + 1}]\n${t}`)
    .join("\n\n");
  return {
    route: "text",
    documentText,
    pages,
    textPages,
    scanPages: 0,
    extraInputTokenEstimate: 0,
  };
}

/** HEIC → JPEG decode + ≤1500px küçültme. Ham boyut asla gönderilmez. */
async function toResizedJpegPart(
  buffer: Buffer,
  mime: string,
): Promise<AiInlinePart> {
  let input = buffer;
  if (mime === "image/heic" || mime === "image/heif") {
    // sharp'ın prebuilt binary'si HEIC decode etmez (patent) — WASM decoder.
    const converted = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.9,
    });
    input = Buffer.from(converted);
  }
  const resized = await sharp(input)
    .rotate() // EXIF yönelimi (telefon fotoğrafı yan gelmesin)
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return { mimeType: "image/jpeg", data: resized.toString("base64") };
}
