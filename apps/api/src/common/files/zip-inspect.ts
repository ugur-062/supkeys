import { inflateRawSync } from "node:zlib";

/**
 * ZIP (xlsx/docx) ön-inceleme — BAĞIMLILIKSIZ (denetim 2026-08-23 Parça 2):
 * `ExcelJS.load` açılmış XML'i belleğe alır; 5 MB'lık sıkıştırılmış dosya
 * yüzlerce MB'a açılabilir (zip bombası) → tek istekle OOM. Yüklemeden ÖNCE
 * merkezi dizin (EOCD + CEN kayıtları) taranır: giriş sayısı, toplam ve en
 * büyük AÇILMIŞ boyut tavanlara vurulur. ZIP64 (0xFFFFFFFF alanları) ve bozuk
 * dizin REDDEDİLİR (fail-closed). Dosyanın gerçekten zip olup olmadığına
 * bakmaz — çağıran "PK" imzasını zaten kontrol eder.
 *
 * BEYANA GÜVENİLMEZ (derin denetim 2026-09-29 Y-02): CEN'deki açılmış boyut
 * ve EOCD giriş sayısı saldırganın yazdığı alanlardır; JSZip (ExcelJS'in
 * okuyucusu) EOCD sayısına bakmadan imza sürdükçe CEN'i gezer ve beyan/gerçek
 * boyut uyuşmazlığını ancak her şeyi belleğe AÇTIKTAN sonra fark eder. Bu
 * yüzden:
 *  · CEN, `cenOffset..cenOffset+cenSize` aralığında gezilir; kayıt sayısı
 *    EOCD ile, bitiş noktası aralık sonuyla ve EOCD konumuyla BİREBİR
 *    uyuşmalıdır (JSZip'in "başa eklenmiş bayt" kaydırması da böylece
 *    devre dışı kalır — iki okuyucu aynı kayıtları görür).
 *  · `assertZipWithinLimits` her girişi JSZip'in okuyacağı yerden (yerel
 *    başlık sonrası, CEN'deki sıkıştırılmış boyut kadar) TAVANLI olarak
 *    GERÇEKTEN açar (`inflateRawSync` + `maxOutputLength`); gerçek toplam
 *    tavanı aşarsa ya da beyanla uyuşmazsa ExcelJS'e hiç verilmez.
 *  · EOCD'nin disk alanları da (diskNumber, CEN başlangıç diski, bu diskteki
 *    kayıt sayısı) tek diskli arşivle birebir uyuşmalı (gözden geçirme A1):
 *    JSZip bunlardan biri 0xFFFF olunca ZIP64 yoluna girer ve CEN konumunu
 *    dosyanın herhangi bir yerine gömülebilen ZIP64 kaydından okur — yani
 *    bizim doğruladığımızdan BAŞKA bir merkezi dizini açar.
 *
 * AÇILMIŞ XML KÜÇÜK AMA NESNE PATLAMASI (gözden geçirme A1, Y-03 sınıfı):
 * ExcelJS yükleme SIRASINDA bazı aralıkları hücre hücre açar; birkaç yüz
 * baytlık XML milyonlarca nesne üretir. Kapı açılmış metni ExcelJS'in kendi
 * ayrıştırma kuralıyla tarar (`spreadsheet` tavanları):
 *  · `<mergeCell ref>` → aralıktaki HER hücre için Cell (worksheet.js
 *    _mergeCellsInternal) + birleşme başına önceki tüm birleşmelerle kesişim
 *    denetimi (O(n²));
 *  · `<definedName>` aralığı → her hücre için CellMatrix girdisi
 *    (defined-names.js; yazdırma alanı/başlıkları hariç, onlar açılmaz);
 *  · `<col min max>` → max'a kadar her sütun için Column nesnesi.
 * `<dataValidation sqref>` da her adresi açar (data-validations-xform.js) —
 * içe aktarma doğrulamaları hiç OKUMADIĞI için ExcelJS'e hiç ayrıştırılmaz:
 * her `xlsx.load` çağrısı `XLSX_LOAD_OPTIONS` ile yapılır (tavan koysaydık
 * Excel'de tüm sütuna açılır liste koyan meşru dosya reddedilirdi).
 */
export interface ZipInspection {
  entries: number;
  uncompressedBytes: number;
  maxEntryBytes: number;
}

/** ExcelJS'in yüklemede aralığı açtığı yapıların tavanları (yalnız xlsx). */
export interface SpreadsheetExpansionLimits {
  /** Birleştirilmiş hücreler + tanımlı ad aralıkları: açılacak toplam hücre. */
  maxExpandedCells: number;
  /** `<mergeCell>` sayısı (her biri öncekilerle kesişim denetimi yapar). */
  maxMergeCells: number;
  /** `<col min|max>` üst sınırı (Excel'in son sütunu XFD = 16384). */
  maxColumn: number;
}

export interface ZipLimits {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxEntryBytes: number;
  /** Verilirse açılmış girişler ExcelJS'in hücre açan yapıları için taranır. */
  spreadsheet?: SpreadsheetExpansionLimits;
}

/** xlsx için makul tavanlar: 500 satırlık şablon ≪ 1 MB; 60 MB = 100+ kat pay. */
export const XLSX_LIMITS: ZipLimits = {
  maxEntries: 200,
  maxUncompressedBytes: 60 * 1024 * 1024,
  maxEntryBytes: 40 * 1024 * 1024,
  // 100k hücre ≈ 10-30 MB nesne; şablon birleşmeleri (başlık satırı) ≪ 1k.
  spreadsheet: { maxExpandedCells: 100_000, maxMergeCells: 5_000, maxColumn: 16_384 },
};

/**
 * HER `wb.xlsx.load` bu seçenekle çağrılır: `dataValidations` ayrıştırılmaz
 * (sqref="A1:XFD1048576" → 17 milyar anahtar; içe aktarma doğrulamaları
 * okumaz). `xlsx-load-options.spec` kaynakta seçeneksiz çağrıyı yakalar.
 */
export const XLSX_LOAD_OPTIONS: { ignoreNodes: string[] } = { ignoreNodes: ["dataValidations"] };

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const EOCD_MIN = 22;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

export class ZipInspectError extends Error {
  constructor(
    message: string,
    public readonly reason: "corrupt" | "zip64" | "entries" | "size" | "entry-size",
  ) {
    super(message);
  }
}

interface CenEntry {
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

interface ParsedZip extends ZipInspection {
  cen: CenEntry[];
}

function parseCentralDirectory(buf: Buffer): ParsedZip {
  if (buf.length < EOCD_MIN) throw new ZipInspectError("ZIP merkezi dizini bulunamadı", "corrupt");
  // EOCD: dosya sonundan geriye doğru ara (yorum alanı ≤ 64K).
  const minStart = Math.max(0, buf.length - EOCD_MIN - 0xffff);
  let eocd = -1;
  for (let i = buf.length - EOCD_MIN; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipInspectError("ZIP merkezi dizini bulunamadı", "corrupt");
  const diskNumber = buf.readUInt16LE(eocd + 4);
  const cenDisk = buf.readUInt16LE(eocd + 6);
  const entriesOnDisk = buf.readUInt16LE(eocd + 8);
  const entries = buf.readUInt16LE(eocd + 10);
  const cenSize = buf.readUInt32LE(eocd + 12);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  // JSZip (zipEntries.js readEndOfCentral) bu ALTI alandan HERHANGİ biri
  // 0xFFFF/0xFFFFFFFF ise ZIP64 kaydını dosyanın her yerinde arar ve CEN'i
  // oradan okur — bizim gezdiğimiz CEN'den başka bir dizin. Hepsine bakılır.
  if (
    diskNumber === 0xffff ||
    cenDisk === 0xffff ||
    entriesOnDisk === 0xffff ||
    entries === 0xffff ||
    cenSize === 0xffffffff ||
    cenOffset === 0xffffffff
  ) {
    throw new ZipInspectError("ZIP64 dosyalar desteklenmiyor", "zip64");
  }
  // Tek diskli arşiv: çok diskli/tutarsız sayılı EOCD'yi iki okuyucu farklı yorumlar.
  if (diskNumber !== 0 || cenDisk !== 0 || entriesOnDisk !== entries) {
    throw new ZipInspectError("ZIP merkezi dizini bozuk (çok diskli ya da tutarsız EOCD)", "corrupt");
  }
  // CEN tam olarak EOCD'nin önünde bitmeli: aksi halde JSZip "başa eklenmiş
  // bayt" varsayıp okuma noktasını kaydırır ve bizim görmediğimiz kayıtları okur.
  if (cenOffset + cenSize !== eocd) throw new ZipInspectError("ZIP merkezi dizini bozuk", "corrupt");

  const cenEnd = cenOffset + cenSize;
  const cen: CenEntry[] = [];
  let p = cenOffset;
  let uncompressedBytes = 0;
  let maxEntryBytes = 0;
  // EOCD sayısıyla DEĞİL aralıkla sınırlı gez (JSZip de sayıya bakmıyor).
  while (p < cenEnd) {
    if (p + 46 > cenEnd || buf.readUInt32LE(p) !== CEN_SIG) {
      throw new ZipInspectError("ZIP merkezi dizin kaydı bozuk", "corrupt");
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressed = buf.readUInt32LE(p + 24);
    const localOffset = buf.readUInt32LE(p + 42);
    if (uncompressed === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipInspectError("ZIP64 girişi desteklenmiyor", "zip64");
    }
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    uncompressedBytes += uncompressed;
    if (uncompressed > maxEntryBytes) maxEntryBytes = uncompressed;
    cen.push({ flags, method, compressedSize, uncompressedSize: uncompressed, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== cenEnd || cen.length !== entries) {
    throw new ZipInspectError("ZIP merkezi dizin kayıt sayısı tutarsız", "corrupt");
  }
  return { entries, uncompressedBytes, maxEntryBytes, cen };
}

/** Yalnız merkezi dizin (beyan edilen boyutlar) — yapı doğrulamalı. */
export function inspectZip(buf: Buffer): ZipInspection {
  const { entries, uncompressedBytes, maxEntryBytes } = parseCentralDirectory(buf);
  return { entries, uncompressedBytes, maxEntryBytes };
}

/**
 * Tavan aşımında ZipInspectError fırlatır; çağıran BadRequest'e çevirir.
 * Önce ucuz beyan kontrolü, ardından her girişin GERÇEK açılımı (tavanlı).
 * Dönen boyutlar gerçek açılmış boyutlardır.
 */
export function assertZipWithinLimits(buf: Buffer, limits: ZipLimits = XLSX_LIMITS): ZipInspection {
  const info = parseCentralDirectory(buf);
  if (info.entries > limits.maxEntries) {
    throw new ZipInspectError(`ZIP giriş sayısı tavanı aşıldı (${info.entries} > ${limits.maxEntries})`, "entries");
  }
  if (info.uncompressedBytes > limits.maxUncompressedBytes) {
    throw new ZipInspectError(
      `Açılmış boyut tavanı aşıldı (${Math.round(info.uncompressedBytes / 1024 / 1024)} MB)`,
      "size",
    );
  }
  if (info.maxEntryBytes > limits.maxEntryBytes) {
    throw new ZipInspectError(`Tek giriş açılmış boyut tavanı aşıldı`, "entry-size");
  }

  // Beyan geçti — şimdi gerçekten aç ve say.
  let realTotal = 0;
  let realMax = 0;
  const expansion = limits.spreadsheet ? { cells: 0, merges: 0 } : null;
  for (const e of info.cen) {
    if (e.flags & 0x1) throw new ZipInspectError("Şifreli ZIP girişi desteklenmiyor", "corrupt");
    const lp = e.localOffset;
    if (lp + 30 > buf.length || buf.readUInt32LE(lp) !== LOC_SIG) {
      throw new ZipInspectError("ZIP yerel başlığı bozuk", "corrupt");
    }
    const dataStart = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
    const dataEnd = dataStart + e.compressedSize;
    if (dataEnd > buf.length) throw new ZipInspectError("ZIP girişi dosya sonunu aşıyor", "corrupt");
    const remaining = limits.maxUncompressedBytes - realTotal;
    let content: Buffer;
    if (e.method === METHOD_STORE) {
      content = buf.subarray(dataStart, dataEnd);
    } else if (e.method === METHOD_DEFLATE) {
      const cap = Math.min(limits.maxEntryBytes, remaining);
      try {
        content = inflateRawSync(buf.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, cap) });
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
          throw cap < limits.maxEntryBytes
            ? new ZipInspectError("Açılmış boyut tavanı aşıldı (gerçek açılım)", "size")
            : new ZipInspectError("Tek giriş açılmış boyut tavanı aşıldı (gerçek açılım)", "entry-size");
        }
        throw new ZipInspectError("ZIP girişi açılamadı", "corrupt");
      }
    } else {
      throw new ZipInspectError(`Desteklenmeyen ZIP sıkıştırma yöntemi (${e.method})`, "corrupt");
    }
    const real = content.length;
    if (real > limits.maxEntryBytes) {
      throw new ZipInspectError("Tek giriş açılmış boyut tavanı aşıldı (gerçek açılım)", "entry-size");
    }
    if (real > remaining) throw new ZipInspectError("Açılmış boyut tavanı aşıldı (gerçek açılım)", "size");
    // Beyan ≠ gerçek → sahte başlık; JSZip de sonunda reddederdi ama ancak açtıktan sonra.
    if (real !== e.uncompressedSize) {
      throw new ZipInspectError("ZIP girişi beyan edilen boyutla uyuşmuyor", "corrupt");
    }
    realTotal += real;
    if (real > realMax) realMax = real;
    // Ad kalıbına bakılmaz: ExcelJS çalışma sayfasını kalıbı ÇAPASIZ eşler
    // (/xl\/worksheets\/sheet(\d+)[.]xml/) — her giriş taranır.
    if (expansion && limits.spreadsheet && mayExpand(content)) {
      scanSpreadsheetXml(content.toString("utf8"), expansion, limits.spreadsheet);
    }
  }
  return { entries: info.entries, uncompressedBytes: realTotal, maxEntryBytes: realMax };
}

// ------------------------------------------------ ExcelJS hücre açılımı taraması
//
// Aşağıdaki yardımcılar exceljs@4.4.0'ın KENDİ ayrıştırma kurallarının
// birebir kopyasıdır (utils/col-cache.js decodeAddress/decodeEx,
// xform/book/defined-name-xform.js extractRanges, doc/defined-names.js
// rangeRegexp). Kendi "daha doğru" ayrıştırıcımızı yazsaydık ExcelJS'in
// hoşgörülü okumasıyla ayrışır, kapı küçük görüp ExcelJS büyük açardı.
// exceljs yükseltilirse bu kopyalar yeniden karşılaştırılmalı.

const EXPANSION_NEEDLES = ["<mergeCell", "<definedName", "<col ", "<col\t", "<col\n", "<col\r", "<col/", "<col>"];

function mayExpand(content: Buffer): boolean {
  return EXPANSION_NEEDLES.some((n) => content.includes(n));
}

/** Tam kopya: col-cache.decodeAddress (A-Z sütun, rakam satır, `$` atlanır; sütun > 16384 hata). */
function decodeAddress(value: string): { col: number; row: number } {
  let hasCol = false;
  let hasRow = false;
  let col = 0;
  let row = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (!hasRow && c >= 65 && c <= 90) {
      hasCol = true;
      col = col * 26 + c - 64;
    } else if (c >= 48 && c <= 57) {
      hasRow = true;
      row = row * 10 + c - 48;
    } else if (hasRow && hasCol && c !== 36) {
      break;
    }
  }
  if (hasCol && col > 16384) throw new RangeError("sütun sınır dışı");
  // Tanımsız sütun/satır ExcelJS'te undefined → Math.min/max NaN → döngü dönmez.
  return { col: hasCol ? col : NaN, row: hasRow ? row : NaN };
}

function checkN2l(n: number): void {
  if (n < 1 || n > 16384) throw new RangeError("sütun sınır dışı");
}

interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * Tam kopya: col-cache.decodeEx. Aralık da tek hücre de dikdörtgen döner
 * (Range tek hücreyi top=bottom yapar); `#REF!` gibi hata referansı null;
 * bozuk adres fırlatır.
 */
function decodeEx(value: string): { rect: Rect; range: boolean } | null {
  const groups = value.match(/(?:(?:(?:'((?:[^']|'')*)')|([^'^ !]*))!)?(.*)/)!;
  const reference = groups[3] ?? "";
  const parts = reference.split(":");
  if (parts.length > 1) {
    const tl = decodeAddress(parts[0]!);
    const br = decodeAddress(parts[1]!);
    const rect = {
      top: Math.min(tl.row, br.row),
      left: Math.min(tl.col, br.col),
      bottom: Math.max(tl.row, br.row),
      right: Math.max(tl.col, br.col),
    };
    checkN2l(rect.left);
    checkN2l(rect.right);
    return { rect, range: true };
  }
  if (reference.startsWith("#")) return null;
  const a = decodeAddress(reference);
  return { rect: { top: a.row, left: a.col, bottom: a.row, right: a.col }, range: false };
}

/**
 * ExcelJS'in `for (i = top; i <= bottom; i++) for (j = left; j <= right; j++)`
 * döngüsünün adım sayısı. NaN sınırda döngü hiç dönmez (0). Güvenli tamsayı
 * olmayan sınırda (satır numarası 2^53 üstü ya da Infinity) `i++` ilerlemez →
 * ExcelJS SONSUZ döngüye girer → Infinity.
 */
function rectCells(r: Rect): number {
  const bounds = [r.top, r.left, r.bottom, r.right];
  if (bounds.some((v) => Number.isNaN(v))) return 0;
  if (bounds.some((v) => !Number.isSafeInteger(v))) return Number.POSITIVE_INFINITY;
  const rows = r.bottom - r.top + 1;
  const cols = r.right - r.left + 1;
  return rows > 0 && cols > 0 ? rows * cols : 0;
}

/** mergeCellsWithoutStyle(ref) → Range → decodeEx; bozuk ref yüklemeyi zaten düşürür (0). */
function mergeCells(ref: string): number {
  try {
    const d = decodeEx(ref);
    return d ? rectCells(d.rect) : 0;
  } catch {
    return 0;
  }
}

function isValidRange(range: string): boolean {
  try {
    decodeEx(range);
    return true;
  } catch {
    return false;
  }
}

/** Tam kopya: defined-name-xform.js extractRanges (tırnaklı sayfa adındaki virgül). */
function extractRanges(parsedText: string): string[] {
  const ranges: string[] = [];
  let quotesOpened = false;
  let last = "";
  for (const item of parsedText.split(",")) {
    if (!item) continue;
    const quotes = (item.match(/'/g) || []).length;
    if (!quotes) {
      if (quotesOpened) last += `${item},`;
      else if (isValidRange(item)) ranges.push(item);
      continue;
    }
    const quotesEven = quotes % 2 === 0;
    if (!quotesOpened && quotesEven && isValidRange(item)) {
      ranges.push(item);
    } else if (quotesOpened && !quotesEven) {
      quotesOpened = false;
      if (isValidRange(last + item)) ranges.push(last + item);
      last = "";
    } else {
      quotesOpened = true;
      last += `${item},`;
    }
  }
  return ranges;
}

const DEFINED_NAME_RANGE = /[$](\w+)[$](\d+)(:[$](\w+)[$](\d+))?/;
/** Yazdırma alanı/başlıkları reconcile'da sayfa ayarına dönüşür ya da düşer; CellMatrix'e girmez. */
const PRINT_NAMES = new Set(["_xlnm.Print_Area", "_xlnm.Print_Titles"]);

/** defined-names.js `set model`: rangeRegexp geçen her aralık CellMatrix'te hücre hücre açılır. */
function definedNameCells(text: string): number {
  let total = 0;
  for (const range of extractRanges(text)) {
    if (!DEFINED_NAME_RANGE.test(range.split("!").pop() || "")) continue;
    try {
      // CellMatrix.addCellEx yalnız `address.top` doluysa aralığı döner.
      const d = decodeEx(range);
      if (d && d.range && d.rect.top) total += rectCells(d.rect);
    } catch {
      // ExcelJS'te de fırlatır → yükleme düşer.
    }
  }
  return total;
}

const XML_ENTITY = /&(?:(lt|gt|amp|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g;
const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(XML_ENTITY, (m, named: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (named) return NAMED_ENTITIES[named]!;
    const cp = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex!, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

function isXmlSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

interface OpenTag {
  name: string;
  attrs: Map<string, string>;
  selfClosing: boolean;
  end: number;
}

/**
 * `<ad a="…">` açılış etiketini DOĞRUSAL okur (düzenli ifade yok: düşmanca
 * girdide geri izleme kapının kendisini kilitlemesin). Değerler saxes gibi
 * normalleşir: çıplak \t \n \r (\r\n tek) boşluğa, sonra varlıklar çözülür.
 * saxes'in HATA verdiği her durumda null döner — o belgeyi ExcelJS zaten
 * yükleyemez (ya da EOF'ta yarım kalan etiketi hiç görmez).
 */
function readOpenTag(xml: string, pos: number): OpenTag | null {
  const n = xml.length;
  let i = pos + 1;
  while (i < n) {
    const c = xml.charCodeAt(i);
    if (isXmlSpace(c) || c === 0x2f || c === 0x3e || c === 0x3c) break;
    i++;
  }
  const name = xml.slice(pos + 1, i);
  const attrs = new Map<string, string>();
  for (;;) {
    while (i < n && isXmlSpace(xml.charCodeAt(i))) i++;
    if (i >= n) return null;
    const c = xml.charCodeAt(i);
    if (c === 0x3e) return { name, attrs, selfClosing: false, end: i + 1 };
    if (c === 0x2f) return xml.charCodeAt(i + 1) === 0x3e ? { name, attrs, selfClosing: true, end: i + 2 } : null;
    if (c === 0x3c) return null;
    const nameStart = i;
    while (i < n) {
      const d = xml.charCodeAt(i);
      if (isXmlSpace(d) || d === 0x3d || d === 0x3e || d === 0x2f || d === 0x3c) break;
      i++;
    }
    const attrName = xml.slice(nameStart, i);
    while (i < n && isXmlSpace(xml.charCodeAt(i))) i++;
    if (xml.charCodeAt(i) !== 0x3d) return null;
    i++;
    while (i < n && isXmlSpace(xml.charCodeAt(i))) i++;
    const q = xml[i];
    if (q !== '"' && q !== "'") return null;
    const close = xml.indexOf(q, i + 1);
    if (close < 0) return null;
    const raw = xml.slice(i + 1, close);
    if (raw.includes("<")) return null;
    attrs.set(attrName, decodeXml(raw.replace(/\r\n|[\t\n\r]/g, " ")));
    i = close + 1;
  }
}

/**
 * saxes olay sırasını izleyen doğrusal tarayıcı: yorum, CDATA ve PI metne
 * KARIŞMAZ (ExcelJS'in parse-sax'ı yalnız opentag/text/closetag dinler).
 * Birleşme, tanımlı ad ve sütunlar belge TAMAMEN ayrıştırıldıktan sonra
 * açılır; saxes hatası yüklemeyi düşürür, EOF'ta yarım kalan yapı hiç olay
 * üretmez → ikisinde de taramayı bırakmak ExcelJS ile tutarlıdır.
 */
function scanSpreadsheetXml(
  xml: string,
  acc: { cells: number; merges: number },
  lim: SpreadsheetExpansionLimits,
): void {
  const tooMany = () =>
    new ZipInspectError("Çalışma kitabı çok fazla hücre açıyor (birleşme/tanımlı ad)", "size");
  // definedName metni: açılıştan İLK kapanan etikete dek (DefinedNameXform
  // parseClose adsızdır — ilk closetag modeli bitirir).
  let nameText: string[] | null = null;
  let nameCounts = false;
  const finishName = () => {
    if (nameText && nameCounts) {
      acc.cells += definedNameCells(nameText.join(""));
      if (acc.cells > lim.maxExpandedCells) throw tooMany();
    }
    nameText = null;
  };
  const n = xml.length;
  let pos = 0;
  while (pos < n) {
    const lt = xml.indexOf("<", pos);
    const textEnd = lt < 0 ? n : lt;
    if (nameText && textEnd > pos) nameText.push(decodeXml(xml.slice(pos, textEnd).replace(/\r\n?/g, "\n")));
    if (lt < 0) break;
    let end: number;
    if (xml.startsWith("<!--", lt)) {
      end = xml.indexOf("-->", lt + 4);
      if (end < 0) return;
      pos = end + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      end = xml.indexOf("]]>", lt + 9);
      if (end < 0) return;
      pos = end + 3;
    } else if (xml.startsWith("<?", lt)) {
      end = xml.indexOf("?>", lt + 2);
      if (end < 0) return;
      pos = end + 2;
    } else if (xml.startsWith("<!", lt)) {
      // DOCTYPE/ENTITY: OOXML'de yok; iç alt küme sınırını saxes'le birebir
      // eşlemek yerine reddedilir (yanlış sınır = görülmeyen etiket).
      throw new ZipInspectError("XML belge tipi bildirimi desteklenmiyor", "corrupt");
    } else if (xml.startsWith("</", lt)) {
      end = xml.indexOf(">", lt + 2);
      if (end < 0) return;
      finishName();
      pos = end + 1;
    } else {
      const tag = readOpenTag(xml, lt);
      if (!tag) return;
      pos = tag.end;
      if (tag.name === "mergeCell") {
        acc.merges++;
        if (acc.merges > lim.maxMergeCells) {
          throw new ZipInspectError("Çalışma kitabında çok fazla birleştirilmiş hücre var", "size");
        }
        const ref = tag.attrs.get("ref");
        if (ref !== undefined) {
          acc.cells += mergeCells(ref);
          if (acc.cells > lim.maxExpandedCells) throw tooMany();
        }
      } else if (tag.name === "col") {
        // col-xform: parseInt(attr || '0', 10); Column.fromModel max(min-1, max)'a dek sütun üretir.
        const min = Number.parseInt(tag.attrs.get("min") || "0", 10);
        const max = Number.parseInt(tag.attrs.get("max") || "0", 10);
        if (min > lim.maxColumn || max > lim.maxColumn) {
          throw new ZipInspectError("Sütun tanımı Excel sınırını aşıyor", "size");
        }
      } else if (tag.name === "definedName") {
        // İç içe definedName metni sıfırlar (parseOpen yeniden başlatır).
        nameText = [];
        nameCounts = !PRINT_NAMES.has(tag.attrs.get("name") ?? "");
      }
      if (tag.selfClosing) finishName(); // saxes kendiliğinden kapanan etikette closetag da yayar
    }
  }
}
