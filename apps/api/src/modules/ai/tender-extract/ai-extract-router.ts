import { i18nMessage } from "../../../common/i18n/http-i18n";
import { BadRequestException, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import ExcelJS from "exceljs";
import { assertZipWithinLimits, XLSX_LOAD_OPTIONS, ZipInspectError } from "../../../common/files/zip-inspect";
import { readCsvInto } from "../../../common/files/spreadsheet-reader";
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
/** Çözülmüş piksel tavanı (sharp varsayılanı 268 MP — görsel bombasına açık). */
const MAX_IMAGE_PIXELS = 60_000_000;
/**
 * HEIC tavanı çok daha düşük (derin denetim R-2): N piksel için libheif WASM
 * yığınında çözülmüş YUV (~1,5N) + RGBA dönüşümü (4N, grid'de tuval de orada)
 * ve heic-decode JS tarafında ayrıca `Uint8ClampedArray(N×4)` tutar; jpeg-js
 * saf JS'te yeniden kodlar → tepe ≈ 10N bayt. WASM yığını tekil modüle ait ve
 * büyüdükten sonra KÜÇÜLMEZ. 512 MB'lık Render konteynerinde (~405 MB sürekli
 * RSS) eski 50 MP tavanı (≈ 500 MB tepe) tek istekle OOM'a götürebiliyordu.
 * 25 MP: varsayılan 24 MP iPhone fotoğrafı (5712×4284) geçer; 48 MP
 * "HEIF Max" `gorselCozunurluguCokYuksek` 400 alır. Ek olarak süreç genelinde
 * aynı anda TEK HEIC çözülür (bkz. acquireHeicDecodeSlot) — eşzamanlı istekler
 * tepe belleği üst üste bindiremez.
 */
export const MAX_HEIC_PIXELS = 25_000_000;
/** HEIC çözme sırasında en uzun bekleme; aşılırsa 429 (tekrar denenebilir). */
export const HEIC_DECODE_QUEUE_TIMEOUT_MS = 30_000;
const JPEG_QUALITY = 80;
/**
 * Gemini inline istek pratiği + base64 şişmesi: dosya başına ham tavan.
 *
 * DİKKAT: buradaki kontrol buffer ELDE EDİLDİKTEN sonra çalışır. Ingest
 * yolları R2'dan indirmeden ÖNCE `downloadAiInputs` (HEAD doğrulaması) ile
 * geçmelidir — doğrulamasız `getObject` nesnenin tamamını belleğe alıp süreci
 * OOM'a sürükleyebiliyordu (denetim 2026-08-24 Parça 6, HIGH).
 */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Bir istekteki TOPLAM açılmış bayt tavanı (dosya sayısı × tek tavan DEĞİL). */
export const MAX_TOTAL_INPUT_BYTES = 40 * 1024 * 1024;
/** Token tahminleri (fail-closed, yüksek uç): PDF native ~258/sayfa, görüntü ~1290 (1500px). */
const PDF_PAGE_TOKEN_ESTIMATE = 300;
const IMAGE_TOKEN_ESTIMATE = 1300;

const PDF_MIME = "application/pdf";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** CSV ham bayt tavanı — ExcelJS hücre-nesnesi şişmesine karşı (bkz. routeSpreadsheet). */
const MAX_CSV_BYTES = 2 * 1024 * 1024;
/** Sayfa başına okunan satır tavanı (token koruması). */
const MAX_SHEET_ROWS = 500;
const MAX_SHEET_COLS = 30;
const MAX_CELL_CHARS = 200;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_LOCAL_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ISPE_TYPE = Buffer.from("ispe", "latin1");
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
    throw new BadRequestException(i18nMessage("api.ai.enAzBirDosyaGerekli"));
  }
  let totalBytes = 0;
  for (const f of files) {
    if (f.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException(
        i18nMessage("api.ai.dosyaCokBuyuk15MbSiniri"),
      );
    }
    totalBytes += f.buffer.length;
  }
  // Toplam tavan: 20 × 15 MB = 300 MB'lık tek istek kabul edilmemeli.
  if (totalBytes > MAX_TOTAL_INPUT_BYTES) {
    throw new BadRequestException(
      i18nMessage("api.ai.secilenDosyalarinToplamBoyutuCokBuyuk"),
    );
  }

  // Magic-bytes: istemci MIME'ına güvenilmez — içerik imzasından tespit
  // (yalnız bu yolun kabul ettiği türler; bkz. detectAiInputMime).
  const typed = files.map((f) => ({ ...f, mime: detectAiInputMime(f.buffer) }));

  const pdfs = typed.filter((f) => f.mime === PDF_MIME);
  const images = typed.filter((f) => f.mime != null && IMAGE_MIMES.has(f.mime));
  // Tablo: xlsx (zip imzası + "xl/" girdisi) veya csv (metnin imzası yok →
  // anahtar uzantısı + null-byte yokluğu).
  const sheets = typed.filter(
    (f) => f.mime === XLSX_MIME || (f.mime == null && isLikelyCsv(f.key, f.buffer)),
  );
  const unknown = typed.filter(
    (f) => !pdfs.includes(f) && !images.includes(f) && !sheets.includes(f),
  );
  if (unknown.length > 0) {
    throw new BadRequestException(
      i18nMessage("api.ai.desteklenmeyenDosyaTuruPdfFotografJpg"),
    );
  }
  const kinds = [pdfs.length > 0, images.length > 0, sheets.length > 0].filter(Boolean).length;
  if (kinds > 1 || pdfs.length > 1 || sheets.length > 1) {
    throw new BadRequestException(
      i18nMessage("api.ai.tekSeferdeYaBirPdfYa"),
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
      i18nMessage("api.ai.belgeCokUzunEnFazlaGoruntu", { maxPages: maxPages }),
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

/**
 * İÇERİK İMZASINDAN TÜR TESPİTİ — BAĞIMLILIKSIZ (derin denetim 2026-09-29 Y-04):
 * Eskiden `file-type@16` kullanılıyordu; onun ASF ayrıştırıcısı boyutu 0 olan
 * bir alt başlıkta konumu GERİ sarıp mikro-görev kuyruğunda sonsuza dek
 * dönüyordu (GHSA-5v7r-6r5c-r473) → ASF GUID'iyle başlayan ~100 baytlık tek
 * dosya event loop'u kilitleyip tek süreçli API'yi TÜM kiracılar için
 * durduruyordu. Bu yol yalnız birkaç tür kabul ettiği için imzalar elle
 * tanınır; hiçbir okuma geri gitmez, döngüler hep ileri ilerler. Tanınmayan
 * her şey `null` (→ CSV sezgisi ya da "desteklenmeyen tür" reddi).
 * `file-type` (ESM-only 21.x) geri getirilmeyecek — kural: bu dosyaya
 * `ai-extract-router.spec` kaynak koruması bakar.
 */
export function detectAiInputMime(buf: Buffer): string | null {
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "%PDF") return PDF_MIME;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO-BMFF `ftyp` ana markası (file-type ile aynı eşleme; dizi/sekans
  // markaları — msf1/hevc — kabul edilmez).
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12).replace("\0", " ").trim();
    if (brand === "heic" || brand === "heix") return "image/heic";
    if (brand === "mif1") return "image/heif";
    return null;
  }
  if (buf.length >= 4 && buf.subarray(0, 4).equals(ZIP_LOCAL_SIGNATURE)) {
    return zipHasXlEntry(buf) ? XLSX_MIME : null;
  }
  return null;
}

/**
 * Yerel dosya başlıklarında "xl/" ile başlayan bir girdi adı var mı (xlsx).
 * Beyan edilen sıkıştırılmış boyuta güvenilmez: bir sonraki "PK\x03\x04"
 * imzası ileriye doğru aranır — konum her adımda en az 30 bayt artar, toplam
 * iş O(n). Yanlış pozitif zararsızdır: zip kapısı + ExcelJS yine reddeder.
 */
function zipHasXlEntry(buf: Buffer): boolean {
  let p = 0;
  while (p + 30 <= buf.length) {
    p = buf.indexOf(ZIP_LOCAL_SIGNATURE, p);
    if (p < 0 || p + 30 > buf.length) return false;
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.toString("utf8", p + 30, Math.min(buf.length, p + 30 + nameLen));
    if (name.startsWith("xl/")) return true;
    p += 30 + nameLen;
  }
  return false;
}

/**
 * HEIF'in beyan ettiği en büyük görüntü alanı (piksel) — ÇÖZMEDEN
 * (derin denetim 2026-09-29 X15). heic-decode, libheif'in bildirdiği
 * genişlik×yükseklik kadar RGBA dizisini hiçbir tavan olmadan ayırıyor ve
 * sharp'ın `limitInputPixels` kapısı ancak bundan SONRA çalışıyordu → birkaç
 * MB'lık, 20000×20000 beyan eden bir HEIC süreci OOM'a sokabiliyordu.
 * libheif her görüntü öğesi için `ispe` özelliğini ZORUNLU tutar ve onu
 * üst düzey `meta` kutusunda (iprp/ipco) arar; burada üst düzey kutular
 * ileriye doğru gezilir, her `meta` kutusunun içindeki TÜM `ispe`
 * kayıtlarının en büyüğü alınır (döşeme/küçük resim de sayılır — üst sınır,
 * fail-closed). `meta`/`ispe` yoksa ya da kutu yapısı bozuksa `null`.
 *
 * TÜRETİLMİŞ GÖRÜNTÜLER (gözden geçirme, X15): libheif `grid`/`iovl`
 * öğesinin tuvalini ispe'den DEĞİL, öğe verisindeki (çoğu zaman `idat`)
 * output_width/output_height alanından ayırır → ispe'si 1000×1000 olup
 * grid tanımında 20000×20000 beyan eden (tüm döşemeleri aynı küçük HEVC
 * verisine işaret eden) dosya yalnız-ispe kapısını geçiyordu. Bu öğelerin
 * tuvali iinf/iloc/idat'tan okunup maksimuma katılır; öğe var ama verisi
 * okunamıyorsa `null` (fail-closed).
 */
export function heifMaxDeclaredPixels(buf: Buffer): number | null {
  let max: number | null = null;
  let p = 0;
  while (p + 8 <= buf.length) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      if (p + 16 > buf.length) return null;
      const large = buf.readBigUInt64BE(p + 8);
      size = large > BigInt(buf.length) ? buf.length + 1 : Number(large);
      header = 16;
    } else if (size === 0) {
      size = buf.length - p;
    }
    if (size < header) return null;
    if (type === "meta") {
      const end = Math.min(buf.length, p + size);
      let q = p + header;
      while (q < end) {
        q = buf.indexOf(ISPE_TYPE, q);
        if (q < 0 || q >= end) break;
        // ispe: tip + 4 bayt sürüm/bayrak + u32 genişlik + u32 yükseklik.
        if (q + 16 <= end) {
          const pixels = buf.readUInt32BE(q + 8) * buf.readUInt32BE(q + 12);
          if (max == null || pixels > max) max = pixels;
        }
        q += 4;
      }
      // meta bir FullBox: çocuklar 4 bayt sürüm/bayraktan sonra başlar.
      const canvas = heifDerivedCanvasPixels(buf, p + header + 4, end);
      if (canvas == null) return null;
      if (canvas > 0 && (max == null || canvas > max)) max = canvas;
    }
    p += size;
  }
  return max;
}

/** Tuvali öğe verisinde beyan edilen türetilmiş HEIF öğeleri (ISO 23008-12). */
const HEIF_DERIVED_CANVAS_TYPES = new Set(["grid", "iovl"]);
/** Tuval boyutu için okunan en fazla öğe verisi (grid ≤ 12, iovl ≤ 18 bayt). */
const HEIF_CANVAS_HEADER_BYTES = 18;
/** Bir grid/iovl öğesinin kabul edilen en fazla iloc kapsamı (gerçekte 1). */
const MAX_DERIVED_ITEM_EXTENTS = 16;

interface HeifBox {
  type: string;
  /** Başlıktan sonraki ilk bayt. */
  body: number;
  end: number;
}

/**
 * [start, end) aralığındaki ardışık kutular — yalnız ileri gider; kutu
 * boyutu başlıktan küçükse ya da aralığı aşıyorsa `null`.
 */
function heifChildBoxes(buf: Buffer, start: number, end: number): HeifBox[] | null {
  const boxes: HeifBox[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) return null;
      const large = buf.readBigUInt64BE(p + 8);
      if (large > BigInt(end - p)) return null;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) return null;
    boxes.push({ type: buf.toString("latin1", p + 4, p + 8), body: p + header, end: p + size });
    p += size;
  }
  return p === end ? boxes : null;
}

/**
 * meta çocuklarındaki grid/iovl öğelerinin en büyük tuval alanı (piksel).
 * Böyle öğe yoksa 0; öğe var ama iinf/iloc/idat ya da öğe verisi
 * okunamıyorsa `null`. Okumalar kutu sınırlarında kalır, döngüler ileri gider
 * ve kapsam sayısı sınırlıdır (sıfır genişlikli iloc alanlarıyla CPU
 * tüketilemez).
 */
function heifDerivedCanvasPixels(buf: Buffer, start: number, end: number): number | null {
  try {
    const children = heifChildBoxes(buf, start, end);
    if (children == null) return null;
    const iinf = children.find((b) => b.type === "iinf");
    if (!iinf) return 0;

    // iinf/infe → türetilmiş öğe kimlikleri.
    const derived = new Map<number, string>();
    const iinfEntries = iinf.body + 4 + (buf[iinf.body] === 0 ? 2 : 4);
    const infes = heifChildBoxes(buf, iinfEntries, iinf.end);
    if (infes == null) return null;
    for (const infe of infes) {
      if (infe.type !== "infe") continue;
      const version = buf[infe.body]!;
      if (version < 2) continue; // v0/v1'de item_type yok (grid olamaz).
      const idAt = infe.body + 4;
      const typeAt = idAt + (version === 2 ? 2 : 4) + 2;
      if (typeAt + 4 > infe.end) return null;
      const itemType = buf.toString("latin1", typeAt, typeAt + 4);
      if (!HEIF_DERIVED_CANVAS_TYPES.has(itemType)) continue;
      derived.set(version === 2 ? buf.readUInt16BE(idAt) : buf.readUInt32BE(idAt), itemType);
    }
    if (derived.size === 0) return 0;

    const iloc = children.find((b) => b.type === "iloc");
    if (!iloc) return null;
    const locations = parseIlocForItems(buf, iloc, new Set(derived.keys()));
    if (locations == null) return null;
    const idat = children.find((b) => b.type === "idat");

    let max = 0;
    for (const [id, itemType] of derived) {
      const loc = locations.get(id);
      if (!loc) return null;
      const data = readItemPrefix(buf, loc, idat, HEIF_CANVAS_HEADER_BYTES);
      if (data == null) return null;
      const pixels = derivedCanvasPixels(data, itemType);
      if (pixels == null) return null;
      if (pixels > max) max = pixels;
    }
    return max;
  } catch {
    // Buffer okuması sınır dışı (RangeError) → bozuk yapı.
    return null;
  }
}

interface IlocLocation {
  method: number;
  extents: { offset: number; length: number }[];
}

/** iloc kutusundan yalnız istenen öğelerin konumları (ISO 14496-12 §8.11.3). */
function parseIlocForItems(
  buf: Buffer,
  iloc: HeifBox,
  wanted: Set<number>,
): Map<number, IlocLocation> | null {
  const version = buf[iloc.body]!;
  if (version > 2) return null;
  let o = iloc.body + 4;
  const offsetSize = buf[o]! >> 4;
  const lengthSize = buf[o]! & 0x0f;
  const baseOffsetSize = buf[o + 1]! >> 4;
  const indexSize = version >= 1 ? buf[o + 1]! & 0x0f : 0;
  o += 2;
  const validSize = (n: number) => n === 0 || n === 4 || n === 8;
  if (![offsetSize, lengthSize, baseOffsetSize, indexSize].every(validSize)) return null;
  /** 0/2/4/8 baytlık işaretsiz alan; kutu sınırını aşarsa `null`. */
  const readN = (n: number): number | null => {
    if (o + n > iloc.end) return null;
    let v: number;
    if (n === 0) v = 0;
    else if (n === 2) v = buf.readUInt16BE(o);
    else if (n === 4) v = buf.readUInt32BE(o);
    else {
      const big = buf.readBigUInt64BE(o);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      v = Number(big);
    }
    o += n;
    return v;
  };
  const idSize = version < 2 ? 2 : 4;
  const count = readN(idSize);
  if (count == null) return null;

  const result = new Map<number, IlocLocation>();
  const extentStride = indexSize + offsetSize + lengthSize;
  for (let i = 0; i < count; i++) {
    const id = readN(idSize);
    if (id == null) return null;
    let method = 0;
    if (version >= 1) {
      const m = readN(2);
      if (m == null) return null;
      method = m & 0x0f;
    }
    if (readN(2) == null) return null; // data_reference_index
    const base = readN(baseOffsetSize);
    const extentCount = readN(2);
    if (base == null || extentCount == null) return null;
    if (!wanted.has(id)) {
      // İlgisiz öğe: kapsamları tek adımda atla (sıfır genişlikte döngü yok).
      o += extentCount * extentStride;
      if (o > iloc.end) return null;
      continue;
    }
    if (extentCount === 0 || extentCount > MAX_DERIVED_ITEM_EXTENTS) return null;
    const extents: { offset: number; length: number }[] = [];
    for (let e = 0; e < extentCount; e++) {
      if (readN(indexSize) == null) return null;
      const offset = readN(offsetSize);
      const length = readN(lengthSize);
      if (offset == null || length == null) return null;
      extents.push({ offset: base + offset, length });
    }
    result.set(id, { method, extents });
  }
  return result;
}

/**
 * Öğe verisinin ilk `limit` baytı (kapsamlar birleştirilerek). Yöntem 0 dosya
 * ofseti, 1 `idat` içi ofset; 2 (öğe ofseti) ve sınır dışı kapsam → `null`.
 */
function readItemPrefix(
  buf: Buffer,
  loc: IlocLocation,
  idat: HeifBox | undefined,
  limit: number,
): Buffer | null {
  let sourceStart: number;
  let sourceEnd: number;
  if (loc.method === 0) {
    sourceStart = 0;
    sourceEnd = buf.length;
  } else if (loc.method === 1 && idat) {
    sourceStart = idat.body;
    sourceEnd = idat.end;
  } else {
    return null;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (const ext of loc.extents) {
    if (total >= limit) break;
    const from = sourceStart + ext.offset;
    // length 0 = kaynağın sonuna kadar (ISO 14496-12).
    const to = ext.length === 0 ? sourceEnd : from + ext.length;
    if (from > sourceEnd || to > sourceEnd || to < from) return null;
    const take = Math.min(to - from, limit - total);
    chunks.push(buf.subarray(from, from + take));
    total += take;
  }
  return Buffer.concat(chunks);
}

/**
 * grid: sürüm, bayrak, rows-1, cols-1, output_width/height (bayrak&1 → 32,
 * değilse 16 bit). iovl: sürüm, bayrak, 4×u16 dolgu rengi, ardından aynı
 * genişlikte output_width/height. Veri kısaysa `null`.
 */
function derivedCanvasPixels(data: Buffer, itemType: string): number | null {
  if (data.length < 2) return null;
  const wide = (data[1]! & 1) === 1;
  const at = itemType === "grid" ? 4 : 10;
  const field = wide ? 4 : 2;
  if (data.length < at + 2 * field) return null;
  const width = wide ? data.readUInt32BE(at) : data.readUInt16BE(at);
  const height = wide ? data.readUInt32BE(at + field) : data.readUInt16BE(at + field);
  return width * height;
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
  // CSV'de zip-benzeri bir ön-kontrol yok: ExcelJS satır/hücreleri nesne olarak
  // belleğe açar → 15 MB'lık dar hücreli bir CSV (ör. "1,1,1,…") milyonlarca
  // hücre nesnesine dönüşüp GB'larca bellek ister. Satır tavanı (MAX_SHEET_ROWS)
  // ancak okuma SIRASINDA çalıştığı için koruma değil. Kalem içe aktarma
  // dosyaları küçük olduğundan CSV'ye ayrı, düşük bir bayt tavanı koyuyoruz
  // (denetim 2026-08-24 Parça 6).
  if (!isXlsx && buffer.length > MAX_CSV_BYTES) {
    throw new BadRequestException(
      i18nMessage("api.ai.csvDosyasiCokBuyukIlgiliSatirlari"),
    );
  }
  if (isXlsx) {
    // Zip bombası koruması (denetim 2026-08-23): açılmış boyut tavanı yüklemeden önce.
    try {
      assertZipWithinLimits(buffer);
    } catch (e) {
      if (e instanceof ZipInspectError) {
        throw new BadRequestException(
          e.reason === "corrupt" || e.reason === "zip64"
            ? i18nMessage("api.ai.tabloDosyasiOkunamadi")
            : i18nMessage("api.ai.tabloDosyasiCokBuyuk"),
        );
      }
      throw e;
    }
  }
  try {
    if (isXlsx) await wb.xlsx.load(buffer as unknown as ArrayBuffer, XLSX_LOAD_OPTIONS);
    // TR Excel CSV'si ";" ayracli ve ondalik "," — varsayilan "," ile okununca
    // "2,5;120,5" hucreleri ondalik virgulden bolunuyordu (MU-08 S016).
    // MU-19 S029: ham metin korunur ("1.500" 1.5'e, "05-09-2026" ABD tarihine
    // donusmeden modele gider).
    else await readCsvInto(wb, buffer);
  } catch {
    throw new BadRequestException(i18nMessage("api.ai.tabloDosyasiOkunamadiXlsxVeyaCsv"));
  }
  const sheets = wb.worksheets.filter((w) => w.rowCount > 0);
  if (sheets.length === 0) throw new BadRequestException(i18nMessage("api.ai.tabloBosGorunuyor"));
  if (sheets.length > maxPages) {
    throw new BadRequestException(
      i18nMessage("api.ai.belgeCokUzunEnFazlaSayfa", { maxPages: maxPages }),
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
  if (totalChars < 20) throw new BadRequestException(i18nMessage("api.ai.tabloBosGorunuyor"));
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
    // Sayfa tavanı METİN ÇIKARMADAN ÖNCE: `getText()` TÜM sayfaları ayrıştırıp
    // ancak ondan sonra tavana bakıyordu → binlerce sayfalık "sayfa bombası"
    // dakikalarca CPU yakıp tek süreçteki tüm kiracıları yavaşlatıyordu
    // (denetim 2026-08-24 Parça 6). getInfo() yalnız belge meta verisini okur.
    const info = await parser.getInfo();
    if (info.total > maxPages) {
      throw new BadRequestException(
        i18nMessage("api.ai.belgeCokUzunSayfaEnFazla", { total: info.total, maxPages: maxPages }),
      );
    }
    const result = await parser.getText();
    pages = result.total;
    pageTexts = result.pages.map((p) =>
      (p.text ?? "").replace(/\s+/g, " ").trim(),
    );
  } catch (err) {
    // Sayfa tavanı reddi (yukarıda) kullanıcıya AYNEN dönmeli — "PDF okunamadı"
    // altında kaybolmasın.
    if (err instanceof BadRequestException) throw err;
    // Teşhis için gerçek sebep loglanır (kullanıcıya sızdırılmaz).
    new Logger("AiExtractRouter").warn(
      `PDF parse hatası: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new BadRequestException(
      i18nMessage("api.ai.pdfOkunamadiDosyaBozukVeyaSifreli"),
    );
  } finally {
    await parser.destroy().catch(() => undefined);
  }
  if (pages > maxPages) {
    throw new BadRequestException(
      i18nMessage("api.ai.belgeCokUzunSayfaEnFazla2", { pages: pages, maxPages: maxPages }),
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
    // Piksel tavanı ÇÖZMEDEN ÖNCE (X15): heicConvert beyan edilen boyut kadar
    // belleği tavansız ayırır; sharp'ın tavanı ancak ondan sonra çalışır.
    const declared = heifMaxDeclaredPixels(buffer);
    if (declared == null) {
      throw new BadRequestException(i18nMessage("api.ai.gorselOkunamadiDosyaBozukOlabilir"));
    }
    if (declared > MAX_HEIC_PIXELS) {
      throw new BadRequestException(
        i18nMessage("api.ai.gorselCozunurluguCokYuksek", {
          maxMegapixels: MAX_HEIC_PIXELS / 1_000_000,
        }),
      );
    }
    // Tek yuva (R-2): sıra beklemesi zaman aşımına uğrarsa 429 — çözme
    // hatasına (400) ÇEVRİLMEZ, bu yüzden try'ın dışında alınır.
    const release = await acquireHeicDecodeSlot();
    try {
      // sharp'ın prebuilt binary'si HEIC decode etmez (patent) — WASM decoder.
      const converted = await heicConvert({
        buffer,
        format: "JPEG",
        quality: 0.9,
      });
      input = Buffer.from(converted);
    } catch (err) {
      throw imageDecodeError(err, "HEIC");
    } finally {
      release();
    }
  }
  // `limitInputPixels`: sharp varsayılanı 268 MP — "görsel bombası" (küçük
  // dosya, devasa çözülmüş piksel) ile bellek/CPU tüketilebiliyordu. Belge
  // fotoğrafı için 60 MP fazlasıyla yeterli (denetim 2026-08-24 Parça 6).
  let resized: Buffer;
  try {
    resized = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate() // EXIF yönelimi (telefon fotoğrafı yan gelmesin)
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (err) {
    throw imageDecodeError(err, "sharp");
  }
  return { mimeType: "image/jpeg", data: resized.toString("base64") };
}

/**
 * SÜREÇ GENELİNDE TEK HEIC ÇÖZME YUVASI (derin denetim R-2). heic-decode
 * zincirinde await'ler var (libheif.ready, display sözü) → iki istek aynı
 * anda çözerse WASM yığını ve JS RGBA dizileri üst üste biner. Yuva boşsa
 * hemen alınır; doluysa FIFO sırada beklenir ve `release` yuvayı doğrudan
 * sıradakine devreder. `timeoutMs` içinde sıra gelmezse bekleyen sıradan
 * çıkarılır ve 429 atılır (yuva sızmaz, sıra bozulmaz). 503 DEĞİL: web
 * interceptor'ı her 5xx'i genel "sunucu hatası" toast'ına çevirir ve
 * ServerErrorSentryFilter 5xx HttpException'ı Sentry'ye yazar — geçici
 * yoğunlukta kullanıcı i18n mesajını görmeli, Sentry gürültülenmemeli.
 */
let heicDecodeBusy = false;
const heicDecodeWaiters: (() => void)[] = [];

function acquireHeicDecodeSlot(
  timeoutMs: number = HEIC_DECODE_QUEUE_TIMEOUT_MS,
): Promise<() => void> {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = heicDecodeWaiters.shift();
    if (next) next();
    else heicDecodeBusy = false;
  };
  if (!heicDecodeBusy) {
    heicDecodeBusy = true;
    return Promise.resolve(release);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = heicDecodeWaiters.indexOf(grant);
      if (i >= 0) heicDecodeWaiters.splice(i, 1);
      new Logger("AiExtractRouter").warn(
        `HEIC decode queue wait exceeded ${timeoutMs} ms (waiting: ${heicDecodeWaiters.length})`,
      );
      reject(
        new HttpException(
          i18nMessage("api.ai.gorselIslemeYogunBirazSonraDeneyin", undefined, "HEIC_DECODE_BUSY"),
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    }, timeoutMs);
    const grant = () => {
      clearTimeout(timer);
      resolve(release);
    };
    heicDecodeWaiters.push(grant);
  });
}

/**
 * Bozuk/kesik görsel ya da piksel tavanı aşımı kullanıcıya anlamlı 400 döner
 * (eskiden yakalanmıyor → 500 + Sentry; derin denetim 2026-09-29 S016).
 * Gerçek sebep yalnız loglanır.
 */
function imageDecodeError(err: unknown, stage: string): BadRequestException {
  const message = err instanceof Error ? err.message : String(err);
  new Logger("AiExtractRouter").warn(`Image decode failed (${stage}): ${message}`);
  if (/pixel limit/i.test(message)) {
    return new BadRequestException(
      i18nMessage("api.ai.gorselCozunurluguCokYuksek", {
        maxMegapixels: MAX_IMAGE_PIXELS / 1_000_000,
      }),
    );
  }
  return new BadRequestException(i18nMessage("api.ai.gorselOkunamadiDosyaBozukOlabilir"));
}
