/**
 * ZIP (xlsx/docx) ön-inceleme — BAĞIMLILIKSIZ (denetim 2026-08-23 Parça 2):
 * `ExcelJS.load` açılmış XML'i belleğe alır; 5 MB'lık sıkıştırılmış dosya
 * yüzlerce MB'a açılabilir (zip bombası) → tek istekle OOM. Yüklemeden ÖNCE
 * merkezi dizin (EOCD + CEN kayıtları) taranır: giriş sayısı, toplam ve en
 * büyük AÇILMIŞ boyut tavanlara vurulur. ZIP64 (0xFFFFFFFF alanları) ve bozuk
 * dizin REDDEDİLİR (fail-closed). Dosyanın gerçekten zip olup olmadığına
 * bakmaz — çağıran "PK" imzasını zaten kontrol eder.
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
const EOCD_MIN = 22;

export class ZipInspectError extends Error {
  constructor(
    message: string,
    public readonly reason: "corrupt" | "zip64" | "entries" | "size" | "entry-size",
  ) {
    super(message);
  }
}

export function inspectZip(buf: Buffer): ZipInspection {
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
  if (cenOffset + cenSize > buf.length) throw new ZipInspectError("ZIP merkezi dizini bozuk", "corrupt");

  let p = cenOffset;
  let uncompressedBytes = 0;
  let maxEntryBytes = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) {
      throw new ZipInspectError("ZIP merkezi dizin kaydı bozuk", "corrupt");
    }
    const uncompressed = buf.readUInt32LE(p + 24);
    if (uncompressed === 0xffffffff) throw new ZipInspectError("ZIP64 girişi desteklenmiyor", "zip64");
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    uncompressedBytes += uncompressed;
    if (uncompressed > maxEntryBytes) maxEntryBytes = uncompressed;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, uncompressedBytes, maxEntryBytes };
}

/** Tavan aşımında ZipInspectError fırlatır; çağıran BadRequest'e çevirir. */
export function assertZipWithinLimits(buf: Buffer, limits: ZipLimits = XLSX_LIMITS): ZipInspection {
  const info = inspectZip(buf);
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
  return info;
}
