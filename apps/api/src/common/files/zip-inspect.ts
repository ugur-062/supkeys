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
 */
export interface ZipInspection {
  entries: number;
  uncompressedBytes: number;
  maxEntryBytes: number;
}

export interface ZipLimits {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxEntryBytes: number;
}

/** xlsx için makul tavanlar: 500 satırlık şablon ≪ 1 MB; 60 MB = 100+ kat pay. */
export const XLSX_LIMITS: ZipLimits = {
  maxEntries: 200,
  maxUncompressedBytes: 60 * 1024 * 1024,
  maxEntryBytes: 40 * 1024 * 1024,
};

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
  const entries = buf.readUInt16LE(eocd + 10);
  const cenSize = buf.readUInt32LE(eocd + 12);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cenSize === 0xffffffff || cenOffset === 0xffffffff) {
    throw new ZipInspectError("ZIP64 dosyalar desteklenmiyor", "zip64");
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
    let real: number;
    if (e.method === METHOD_STORE) {
      real = e.compressedSize;
    } else if (e.method === METHOD_DEFLATE) {
      const cap = Math.min(limits.maxEntryBytes, remaining);
      try {
        real = inflateRawSync(buf.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, cap) }).length;
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
  }
  return { entries: info.entries, uncompressedBytes: realTotal, maxEntryBytes: realMax };
}
