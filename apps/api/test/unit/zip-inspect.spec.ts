import ExcelJS from "exceljs";
import * as zlib from "node:zlib";
import {
  assertZipWithinLimits,
  inspectZip,
  ZipInspectError,
} from "../../src/common/files/zip-inspect";
import { assertXlsxSafe } from "../../src/modules/company-listings/import/listing-item-import.service";

/**
 * Zip bombası koruması (denetim 2026-08-23 Parça 2): ExcelJS.load'dan önce
 * merkezi dizin tavanı. Bağımlılıksız mini zip yazıcı ile sentetik dosyalar.
 */
function crc32(buf: Buffer): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Verilen girişlerle (ad, içerik) deflate'li ZIP üretir; `fakeUncompressed` ile CEN'e yalan boyut yazılabilir. */
function buildZip(entries: { name: string; data: Buffer; fakeUncompressed?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const cens: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const comp = zlib.deflateRawSync(e.data);
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const uncomp = e.fakeUncompressed ?? e.data.length;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(uncomp, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const cen = Buffer.alloc(46 + name.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(uncomp, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    name.copy(cen, 46);
    locals.push(local, comp);
    cens.push(cen);
    offset += local.length + comp.length;
  }
  const cenBuf = Buffer.concat(cens);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cenBuf, eocd]);
}

describe("inspectZip / assertZipWithinLimits", () => {
  it("gerçek (ExcelJS üretimi) küçük xlsx tavanların altında — geçer", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kalemler");
    for (let i = 0; i < 50; i++) ws.addRow([`Kalem ${i}`, i, "adet"]);
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const info = inspectZip(buf);
    expect(info.entries).toBeGreaterThan(3);
    expect(info.uncompressedBytes).toBeLessThan(5 * 1024 * 1024);
    expect(() => assertZipWithinLimits(buf)).not.toThrow();
    expect(() => assertXlsxSafe(buf)).not.toThrow();
  });

  it("zip bombası: 2 MB'lık sıfır dizisi ~2 KB'a iner; CEN açılmış boyutu tavanı aşarsa REDDEDİLİR", () => {
    const big = Buffer.alloc(2 * 1024 * 1024, 0);
    // 40 giriş × 2 MB = 80 MB açılmış > 60 MB tavanı; sıkıştırılmış toplam ~100 KB
    const zip = buildZip(Array.from({ length: 40 }, (_, i) => ({ name: `xl/worksheets/sheet${i}.xml`, data: big })));
    expect(zip.length).toBeLessThan(200 * 1024);
    expect(() => assertZipWithinLimits(zip)).toThrow(ZipInspectError);
    expect(() => assertZipWithinLimits(zip)).toThrow(/Açılmış boyut/);
    expect(() => assertXlsxSafe(zip)).toThrow(/çok büyük/);
  });

  it("tek giriş tavanı ve giriş sayısı tavanı ayrı ayrı yakalanır; ZIP64 / bozuk dizin reddedilir", () => {
    const small = Buffer.from("x");
    const hugeOne = buildZip([{ name: "a.xml", data: small, fakeUncompressed: 50 * 1024 * 1024 }]);
    expect(() => assertZipWithinLimits(hugeOne)).toThrow(/Tek giriş/);
    const many = buildZip(Array.from({ length: 250 }, (_, i) => ({ name: `f${i}`, data: small })));
    expect(() => assertZipWithinLimits(many)).toThrow(/giriş sayısı/);
    const zip64 = buildZip([{ name: "a", data: small, fakeUncompressed: 0xffffffff }]);
    expect(() => inspectZip(zip64)).toThrow(/ZIP64/);
    expect(() => inspectZip(Buffer.from("PK\x03\x04 bozuk"))).toThrow(/bulunamadı|bozuk/);
  });
});
