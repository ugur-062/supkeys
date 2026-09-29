import ExcelJS from "exceljs";
import * as zlib from "node:zlib";
import {
  assertZipWithinLimits,
  inspectZip,
  XLSX_LIMITS,
  XLSX_LOAD_OPTIONS,
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

/** EOCD alanlarını yerinde değiştirir (yorumsuz zip: EOCD son 22 bayt). */
function patchEocd(zip: Buffer, patch: { entries?: number; cenOffset?: number }): Buffer {
  const out = Buffer.from(zip);
  const eocd = out.length - 22;
  if (patch.entries != null) {
    out.writeUInt16LE(patch.entries, eocd + 8);
    out.writeUInt16LE(patch.entries, eocd + 10);
  }
  if (patch.cenOffset != null) out.writeUInt32LE(patch.cenOffset, eocd + 16);
  return out;
}

describe("beyana güvenilmez — gerçek açılım (derin denetim 2026-09-29 Y-02)", () => {
  it("CEN'de küçük beyan, gerçekte tavan üstü açılan giriş: GERÇEK açılımla reddedilir (ExcelJS'e ulaşmaz)", () => {
    // 45 MB sıfır ~45 KB'a sıkışır; CEN/yerel başlık "1024 bayt" diye yalan söyler.
    const bomb = buildZip([
      { name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(45 * 1024 * 1024, 0), fakeUncompressed: 1024 },
    ]);
    expect(bomb.length).toBeLessThan(200 * 1024);
    // Beyan tavanın altında görünür — eski kapı buna güveniyordu.
    expect(inspectZip(bomb).uncompressedBytes).toBe(1024);
    expect(() => assertZipWithinLimits(bomb)).toThrow(/Tek giriş.*gerçek açılım/);
    expect(() => assertXlsxSafe(bomb)).toThrow(/çok büyük/);
  });

  it("girişler tek tek tavan altında ama gerçek TOPLAM tavanı aşıyor → açma bütçe sınırında kesilir", () => {
    // 25 MB dürüst + 38 MB (< 40 MB tek giriş tavanı) "10 bayt" yalanı: beyan
    // toplamı ~25 MB görünür; gerçek toplam 63 MB > 60 MB.
    const zip = buildZip([
      { name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(25 * 1024 * 1024, 0) },
      { name: "xl/worksheets/sheet2.xml", data: Buffer.alloc(38 * 1024 * 1024, 0), fakeUncompressed: 10 },
    ]);
    expect(inspectZip(zip).uncompressedBytes).toBeLessThan(XLSX_LIMITS.maxUncompressedBytes);
    let err: unknown;
    try {
      assertZipWithinLimits(zip);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ZipInspectError);
    expect((err as ZipInspectError).reason).toBe("size");
  });

  it("beyan ≠ gerçek boyut (tavan altında da olsa) → bozuk sayılır", () => {
    const zip = buildZip([{ name: "a.xml", data: Buffer.from("x".repeat(500)), fakeUncompressed: 100 }]);
    expect(() => assertZipWithinLimits(zip)).toThrow(/beyan edilen boyutla uyuşmuyor/);
    expect(() => assertXlsxSafe(zip)).toThrow(/okunamadı/);
  });

  it("EOCD giriş sayısı 0 yazılmış ama CEN kaydı var → bozuk (JSZip sayıya bakmadan okurdu)", () => {
    const zip = patchEocd(
      buildZip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(1024 * 1024, 0) }]),
      { entries: 0 },
    );
    expect(() => inspectZip(zip)).toThrow(ZipInspectError);
    expect(() => inspectZip(zip)).toThrow(/tutarsız/);
  });

  it("CEN EOCD'nin hemen önünde bitmiyor (kaydırılmış ofset / başa eklenmiş bayt) → bozuk", () => {
    const zip = buildZip([{ name: "a.xml", data: Buffer.from("merhaba") }]);
    const eocd = zip.length - 22;
    const cenOffset = zip.readUInt32LE(eocd + 16);
    expect(() => inspectZip(patchEocd(zip, { cenOffset: cenOffset - 1 }))).toThrow(/bozuk/);
    const prefixed = Buffer.concat([Buffer.alloc(16, 0x20), zip]);
    expect(() => inspectZip(prefixed)).toThrow(/bozuk/);
  });

  it("gerçek xlsx gerçek açılımla da geçer; dönen boyutlar GERÇEK boyutlardır", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kalemler");
    for (let i = 0; i < 200; i++) ws.addRow([`Kalem ${i}`, i, "adet", "açıklama ğüşıöç"]);
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const declared = inspectZip(buf);
    const real = assertZipWithinLimits(buf);
    expect(real.entries).toBe(declared.entries);
    expect(real.uncompressedBytes).toBe(declared.uncompressedBytes);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as unknown as ArrayBuffer);
    expect(back.getWorksheet("Kalemler")!.actualRowCount).toBe(200);
  });
});

describe("gözden geçirme A1 — EOCD disk alanları ve ExcelJS hücre açılımı", () => {
  function patchEocdField(zip: Buffer, offset: number, value: number): Buffer {
    const out = Buffer.from(zip);
    out.writeUInt16LE(value, out.length - 22 + offset);
    return out;
  }

  it("EOCD disk alanlarından biri 0xFFFF → ZIP64 sayılır ve reddedilir (JSZip farklı dizin okurdu)", () => {
    const zip = buildZip([{ name: "a.xml", data: Buffer.from("merhaba") }]);
    for (const off of [4, 6, 8]) {
      expect(() => inspectZip(patchEocdField(zip, off, 0xffff))).toThrow(/ZIP64/);
    }
  });

  it("çok diskli / bu diskteki kayıt sayısı tutarsız EOCD → bozuk", () => {
    const zip = buildZip([{ name: "a.xml", data: Buffer.from("merhaba") }]);
    expect(() => inspectZip(patchEocdField(zip, 4, 1))).toThrow(/bozuk/);
    expect(() => inspectZip(patchEocdField(zip, 6, 1))).toThrow(/bozuk/);
    expect(() => inspectZip(patchEocdField(zip, 8, 2))).toThrow(/bozuk/);
  });

  const sheet = (inner: string) =>
    Buffer.from(`<?xml version="1.0"?><worksheet><sheetData/>${inner}</worksheet>`);
  const reasonOf = (zip: Buffer): string | undefined => {
    try {
      assertZipWithinLimits(zip);
      return undefined;
    } catch (e) {
      return (e as ZipInspectError).reason;
    }
  };

  it("tek büyük mergeCell aralığı → 'size' ile reddedilir (ExcelJS her hücreye Cell üretirdi)", () => {
    const zip = buildZip([
      { name: "xl/worksheets/sheet1.xml", data: sheet('<mergeCells count="1"><mergeCell ref="A1:Z1048576"/></mergeCells>') },
    ]);
    expect(reasonOf(zip)).toBe("size");
    expect(() => assertXlsxSafe(zip)).toThrow(/çok büyük/);
  });

  it("varlıkla yazılmış aralık ayracı da çözülür; küçük başlık birleşmesi geçer", () => {
    const encoded = buildZip([
      { name: "xl/worksheets/sheet1.xml", data: sheet('<mergeCells><mergeCell ref="A1&#58;Z1048576"/></mergeCells>') },
    ]);
    expect(reasonOf(encoded)).toBe("size");
    const ok = buildZip([
      { name: "xl/worksheets/sheet1.xml", data: sheet('<mergeCells><mergeCell ref="A1:H1"/></mergeCells>') },
    ]);
    expect(reasonOf(ok)).toBeUndefined();
  });

  it("yorum içindeki birleşme sayılmaz, ama yorumdan sonra gelen gerçek birleşme sayılır", () => {
    const zip = buildZip([
      {
        name: "xl/worksheets/sheet1.xml",
        data: sheet('<!-- <mergeCell ref="A1:B2"/> --><mergeCells><mergeCell ref="A1:Z1048576"/></mergeCells>'),
      },
    ]);
    expect(reasonOf(zip)).toBe("size");
  });

  it("birleşme SAYISI tavanı (kesişim denetimi O(n²)) ayrıca uygulanır", () => {
    const merges = Array.from({ length: 5_001 }, (_, i) => `<mergeCell ref="A${i + 1}"/>`).join("");
    const zip = buildZip([{ name: "xl/worksheets/sheet1.xml", data: sheet(`<mergeCells>${merges}</mergeCells>`) }]);
    expect(reasonOf(zip)).toBe("size");
  });

  it("aşırı büyük satır numaralı birleşme (ExcelJS döngüsü ilerleyemez) reddedilir", () => {
    const zip = buildZip([
      { name: "xl/worksheets/sheet1.xml", data: sheet(`<mergeCells><mergeCell ref="A${"9".repeat(20)}"/></mergeCells>`) },
    ]);
    expect(reasonOf(zip)).toBe("size");
  });

  it("tanımlı ad aralığı büyükse reddedilir; yazdırma alanı açılmadığı için sayılmaz", () => {
    const wbXml = (inner: string) => Buffer.from(`<workbook><definedNames>${inner}</definedNames></workbook>`);
    const big = buildZip([
      { name: "xl/workbook.xml", data: wbXml('<definedName name="x">Sheet1!$A$1:$XFD$1048576</definedName>') },
    ]);
    expect(reasonOf(big)).toBe("size");
    const print = buildZip([
      {
        name: "xl/workbook.xml",
        data: wbXml('<definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$Z$50000</definedName>'),
      },
    ]);
    expect(reasonOf(print)).toBeUndefined();
  });

  it("<col max> Excel'in son sütununu aşarsa reddedilir; 16384 geçer", () => {
    const bad = buildZip([{ name: "xl/worksheets/sheet1.xml", data: sheet('<cols><col min="1" max="100000000"/></cols>') }]);
    expect(reasonOf(bad)).toBe("size");
    const ok = buildZip([{ name: "xl/worksheets/sheet1.xml", data: sheet('<cols><col min="1" max="16384"/></cols>') }]);
    expect(reasonOf(ok)).toBeUndefined();
  });

  it("dataValidation kapıda reddedilmez; ExcelJS'e XLSX_LOAD_OPTIONS ile HİÇ ayrıştırılmaz", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kalemler");
    ws.addRow(["Kalem", 1, "adet"]);
    ws.getCell("C1").dataValidation = { type: "list", allowBlank: true, formulae: ['"adet,kg"'] };
    const raw = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(() => assertZipWithinLimits(raw)).not.toThrow();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(raw as unknown as ArrayBuffer, XLSX_LOAD_OPTIONS);
    const dv = back.getWorksheet("Kalemler")!.dataValidations as unknown as { model: Record<string, unknown> };
    expect(Object.keys(dv.model)).toHaveLength(0);
    expect(back.getWorksheet("Kalemler")!.getCell("A1").value).toBe("Kalem");
  });

  it("kaynakta HER xlsx.load çağrısı XLSX_LOAD_OPTIONS taşır", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = path.join(__dirname, "../../src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (p.endsWith(".ts")) {
          for (const m of fs.readFileSync(p, "utf8").matchAll(/xlsx\.load\(([^)]*)\)/g)) {
            if (!m[1]!.includes("XLSX_LOAD_OPTIONS")) offenders.push(path.relative(root, p));
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
