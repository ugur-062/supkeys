import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import heicConvert from "heic-convert";
import {
  detectAiInputMime,
  HEIC_DECODE_QUEUE_TIMEOUT_MS,
  heifMaxDeclaredPixels,
  MAX_HEIC_PIXELS,
  routeExtractInput,
} from "../../src/modules/ai/tender-extract/ai-extract-router";

jest.mock("heic-convert", () => ({ __esModule: true, default: jest.fn() }));
const heicConvertMock = heicConvert as unknown as jest.Mock;

/**
 * AI girdi yönlendiricisi — içerik imzası (derin denetim 2026-09-29 Y-04) ve
 * görsel çözme kapıları (X15, S016).
 *
 * Y-04: file-type@16'nın ASF ayrıştırıcısı boyutu 0 olan alt başlıkta konumu
 * geri sarıp mikro-görev kuyruğunda sonsuza dek dönüyordu; ASF GUID'iyle
 * başlayan 100 baytlık dosya tek süreçli API'yi kilitliyordu. Tür tespiti
 * artık bağımlılıksız (detectAiInputMime).
 */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ASF_GUID = [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c];

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

function fullBox(type: string, payload: Buffer): Buffer {
  return box(type, Buffer.concat([Buffer.alloc(4), payload]));
}

function ispe(width: number, height: number): Buffer {
  const wh = Buffer.alloc(8);
  wh.writeUInt32BE(width, 0);
  wh.writeUInt32BE(height, 4);
  return fullBox("ispe", wh);
}

/** ftyp + meta(iprp(ipco(ispe…))) + küçük mdat — libheif'in boyutu okuduğu yapı. */
function heif(brand: string, sizes: [number, number][]): Buffer {
  const ftyp = box("ftyp", Buffer.concat([Buffer.from(brand, "latin1"), Buffer.alloc(4), Buffer.from("mif1heic", "latin1")]));
  const ipco = box("ipco", Buffer.concat(sizes.map(([w, h]) => ispe(w, h))));
  const meta = fullBox("meta", box("iprp", ipco));
  return Buffer.concat([ftyp, meta, box("mdat", Buffer.alloc(64, 7))]);
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function versionedBox(type: string, version: number, payload: Buffer): Buffer {
  return box(type, Buffer.concat([Buffer.from([version, 0, 0, 0]), payload]));
}

/** grid öğe verisi: rows-1, cols-1, output_width/height (wide → 32 bit). */
function gridData(rows: number, cols: number, width: number, height: number, wide = true): Buffer {
  const dims = wide ? Buffer.concat([u32(width), u32(height)]) : Buffer.concat([u16(width), u16(height)]);
  return Buffer.concat([Buffer.from([0, wide ? 1 : 0, rows - 1, cols - 1]), dims]);
}

/** iovl öğe verisi: 4×u16 dolgu + output_width/height (wide → 32 bit). */
function iovlData(width: number, height: number, wide = true): Buffer {
  const dims = wide ? Buffer.concat([u32(width), u32(height)]) : Buffer.concat([u16(width), u16(height)]);
  return Buffer.concat([Buffer.from([0, wide ? 1 : 0]), Buffer.alloc(8), dims, Buffer.alloc(8)]);
}

/**
 * Birincil öğesi türetilmiş (grid/iovl) olan HEIF: ispe'ler küçük, tuval
 * boyutu öğe verisinde. method 1 → veri idat'ta; method 0 → dosya sonundaki
 * mdat'ta (mutlak ofset). `omitIloc` / `method: 2` bozuk yapı senaryoları.
 */
function derivedHeif(opts: {
  itemType: "grid" | "iovl";
  data: Buffer;
  ispes: [number, number][];
  method?: 0 | 1 | 2;
  omitIloc?: boolean;
  extentLength?: number;
}): Buffer {
  const method = opts.method ?? 1;
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("heic", "latin1"), Buffer.alloc(4), Buffer.from("mif1heic", "latin1")]));
  const infe = (id: number, type: string) =>
    versionedBox("infe", 2, Buffer.concat([u16(id), u16(0), Buffer.from(type, "latin1"), Buffer.from([0])]));
  const iinf = versionedBox("iinf", 0, Buffer.concat([u16(2), infe(1, opts.itemType), infe(2, "hvc1")]));
  const ipco = box("ipco", Buffer.concat(opts.ispes.map(([w, h]) => ispe(w, h))));
  const idat = method === 1 ? box("idat", opts.data) : Buffer.alloc(0);
  const buildMeta = (dataOffset: number) => {
    // iloc v1: offset/length/base 4 bayt, index 0; iki öğe (grid + tek döşeme).
    const entry = (id: number, m: number, offset: number, length: number) =>
      Buffer.concat([u16(id), u16(m), u16(0), u32(0), u16(1), u32(offset), u32(length)]);
    const iloc = versionedBox(
      "iloc",
      1,
      Buffer.concat([
        Buffer.from([0x44, 0x40]),
        u16(2),
        entry(1, method, dataOffset, opts.extentLength ?? opts.data.length),
        entry(2, 0, 0, 16),
      ]),
    );
    const parts = [
      versionedBox("pitm", 0, u16(1)),
      iinf,
      ...(opts.omitIloc ? [] : [iloc]),
      box("iprp", ipco),
      idat,
    ];
    return versionedBox("meta", 0, Buffer.concat(parts));
  };
  if (method === 1 || method === 2) {
    return Buffer.concat([ftyp, buildMeta(0), box("mdat", Buffer.alloc(64, 7))]);
  }
  const probe = buildMeta(0);
  const dataOffset = ftyp.length + probe.length + 8;
  return Buffer.concat([ftyp, buildMeta(dataOffset), box("mdat", Buffer.concat([opts.data, Buffer.alloc(64, 7)]))]);
}

async function expectBadRequest(p: Promise<unknown>, i18nKey: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BadRequestException);
  expect((err as BadRequestException).getResponse()).toMatchObject({ i18nKey });
}

describe("detectAiInputMime", () => {
  it("file-type bağımlılığını kullanmaz (ASF sonsuz döngü CVE'si)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/modules/ai/tender-extract/ai-extract-router.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']file-type["']/);
    expect(src).not.toMatch(/import\(\s*["']file-type["']/);
  });

  it("ASF GUID'iyle başlayan sıfır dolu dosya takılmadan reddedilir", async () => {
    const asf = Buffer.alloc(100);
    Buffer.from(ASF_GUID).copy(asf, 0);
    expect(detectAiInputMime(asf)).toBeNull();
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/x.pdf", buffer: asf }], 10),
      "api.ai.desteklenmeyenDosyaTuruPdfFotografJpg",
    );
  });

  it("kabul edilen türleri imzadan tanır", async () => {
    expect(detectAiInputMime(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectAiInputMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("image/jpeg");
    expect(
      detectAiInputMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])),
    ).toBe("image/png");
    expect(detectAiInputMime(Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(detectAiInputMime(heif("heic", [[10, 10]]))).toBe("image/heic");
    expect(detectAiInputMime(heif("heix", [[10, 10]]))).toBe("image/heic");
    expect(detectAiInputMime(heif("mif1", [[10, 10]]))).toBe("image/heif");

    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Kalemler").addRow(["Ürün", "Miktar"]);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    expect(detectAiInputMime(xlsx)).toBe(XLSX_MIME);
  });

  it("desteklenmeyen/benzer imzalar null döner", () => {
    expect(detectAiInputMime(Buffer.alloc(0))).toBeNull();
    expect(detectAiInputMime(Buffer.from("RIFF\x10\x00\x00\x00AVI LIST", "latin1"))).toBeNull();
    expect(detectAiInputMime(heif("msf1", [[10, 10]]))).toBeNull(); // HEIF sekansı
    expect(detectAiInputMime(heif("isom", [[10, 10]]))).toBeNull(); // mp4
    // "xl/" girdisi olmayan zip (docx vb.) tablo sayılmaz.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    const name = Buffer.from("word/document.xml");
    local.writeUInt16LE(name.length, 26);
    expect(detectAiInputMime(Buffer.concat([local, name, Buffer.alloc(40)]))).toBeNull();
    expect(detectAiInputMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBeNull();
    expect(detectAiInputMime(Buffer.from("a,b\n1,2\n"))).toBeNull();
  });
});

describe("heifMaxDeclaredPixels", () => {
  it("meta içindeki en büyük ispe alanını döner", () => {
    expect(heifMaxDeclaredPixels(heif("heic", [[512, 512], [4032, 3024], [96, 96]]))).toBe(4032 * 3024);
    expect(heifMaxDeclaredPixels(heif("heic", [[20000, 20000]]))).toBe(400_000_000);
  });

  it("meta/ispe yoksa ya da kutu yapısı bozuksa null (fail-closed)", () => {
    expect(heifMaxDeclaredPixels(heif("heic", []))).toBeNull();
    const ftyp = box("ftyp", Buffer.from("heic\0\0\0\0", "latin1"));
    expect(heifMaxDeclaredPixels(Buffer.concat([ftyp, box("mdat", ispe(20000, 20000))]))).toBeNull();
    const bad = Buffer.concat([ftyp, Buffer.from([0, 0, 0, 4]), Buffer.from("meta")]);
    expect(heifMaxDeclaredPixels(bad)).toBeNull();
  });
});

describe("heifMaxDeclaredPixels — grid/iovl tuvali (X15, gözden geçirme)", () => {
  it("ispe küçük ama grid tanımı 20000×20000 → tuval alanı döner (idat)", () => {
    const buf = derivedHeif({ itemType: "grid", data: gridData(40, 40, 20000, 20000), ispes: [[1000, 1000], [512, 512]] });
    expect(heifMaxDeclaredPixels(buf)).toBe(400_000_000);
  });

  it("16 bitlik grid tanımı dosya ofsetinden (mdat) okunur", () => {
    const buf = derivedHeif({ itemType: "grid", data: gridData(6, 8, 4032, 3024, false), ispes: [[4032, 3024], [512, 512]], method: 0 });
    expect(heifMaxDeclaredPixels(buf)).toBe(4032 * 3024);
    // ispe tuvalden büyükse ispe esas (en büyük değer).
    const small = derivedHeif({ itemType: "grid", data: gridData(1, 1, 100, 100, false), ispes: [[4032, 3024]], method: 0 });
    expect(heifMaxDeclaredPixels(small)).toBe(4032 * 3024);
  });

  it("iovl tuval boyutu da sayılır", () => {
    const buf = derivedHeif({ itemType: "iovl", data: iovlData(30000, 30000), ispes: [[800, 600]] });
    expect(heifMaxDeclaredPixels(buf)).toBe(900_000_000);
    const narrow = derivedHeif({ itemType: "iovl", data: iovlData(3000, 2000, false), ispes: [[800, 600]] });
    expect(heifMaxDeclaredPixels(narrow)).toBe(6_000_000);
  });

  it("grid verisi okunamıyorsa null (fail-closed)", () => {
    const base = { itemType: "grid" as const, data: gridData(40, 40, 20000, 20000), ispes: [[1000, 1000]] as [number, number][] };
    expect(heifMaxDeclaredPixels(derivedHeif({ ...base, omitIloc: true }))).toBeNull();
    expect(heifMaxDeclaredPixels(derivedHeif({ ...base, method: 2 }))).toBeNull();
    // Kesik tanım (32 bit bayrak ama 6 bayt veri).
    expect(heifMaxDeclaredPixels(derivedHeif({ ...base, data: gridData(40, 40, 20000, 20000).subarray(0, 6) }))).toBeNull();
    // Kapsam idat dışına taşıyor.
    expect(heifMaxDeclaredPixels(derivedHeif({ ...base, extentLength: 4096 }))).toBeNull();
  });

  it("sıfır genişlikli iloc kapsamlarıyla CPU tüketilemez", () => {
    const ftyp = box("ftyp", Buffer.from("heic\0\0\0\0", "latin1"));
    const infe = versionedBox("infe", 2, Buffer.concat([u16(1), u16(0), Buffer.from("grid", "latin1"), Buffer.from([0])]));
    const iinf = versionedBox("iinf", 0, Buffer.concat([u16(1), infe]));
    // iloc v1, tüm alan genişlikleri 0; 65535 öğe × 65535 kapsam beyanı.
    const entries = Buffer.concat(
      Array.from({ length: 2000 }, (_, i) => Buffer.concat([u16(i + 2), u16(0), u16(0), u16(0xffff)])),
    );
    const iloc = versionedBox("iloc", 1, Buffer.concat([Buffer.from([0, 0]), u16(0xffff), entries]));
    const meta = versionedBox("meta", 0, Buffer.concat([iinf, iloc, box("iprp", box("ipco", ispe(10, 10)))]));
    const started = Date.now();
    expect(heifMaxDeclaredPixels(Buffer.concat([ftyp, meta]))).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("routeExtractInput — görsel çözme kapıları", () => {
  beforeEach(() => heicConvertMock.mockReset());

  it("devasa boyut beyan eden HEIC çözülmeden 400 alır (X15)", async () => {
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: heif("heic", [[20000, 20000]]) }], 10),
      "api.ai.gorselCozunurluguCokYuksek",
    );
    expect(heicConvertMock).not.toHaveBeenCalled();
  });

  it("küçük ispe + 20000×20000 grid tanımlı HEIC çözülmeden 400 alır (X15)", async () => {
    const buf = derivedHeif({ itemType: "grid", data: gridData(40, 40, 20000, 20000), ispes: [[1000, 1000], [512, 512]] });
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: buf }], 10),
      "api.ai.gorselCozunurluguCokYuksek",
    );
    expect(heicConvertMock).not.toHaveBeenCalled();
  });

  it("grid tanımı okunamayan HEIC çözülmeden 400 alır", async () => {
    const buf = derivedHeif({ itemType: "grid", data: gridData(40, 40, 20000, 20000), ispes: [[1000, 1000]], omitIloc: true });
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: buf }], 10),
      "api.ai.gorselOkunamadiDosyaBozukOlabilir",
    );
    expect(heicConvertMock).not.toHaveBeenCalled();
  });

  it("makul grid'li HEIC (iPhone 12 MP) çözmeye geçer", async () => {
    heicConvertMock.mockRejectedValue(new Error("HEIF processing error"));
    const buf = derivedHeif({ itemType: "grid", data: gridData(6, 8, 4032, 3024, false), ispes: [[4032, 3024], [512, 512]] });
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: buf }], 10),
      "api.ai.gorselOkunamadiDosyaBozukOlabilir",
    );
    expect(heicConvertMock).toHaveBeenCalledTimes(1);
  });

  it("HEIC tavanı 512 MB konteynere göre 25 MP (R-2)", () => {
    expect(MAX_HEIC_PIXELS).toBe(25_000_000);
  });

  it("varsayılan 24 MP iPhone grid'li HEIC (5712×4284) çözmeye geçer (R-2)", async () => {
    heicConvertMock.mockRejectedValue(new Error("HEIF processing error"));
    const buf = derivedHeif({ itemType: "grid", data: gridData(9, 12, 5712, 4284, false), ispes: [[5712, 4284], [512, 512]] });
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: buf }], 10),
      "api.ai.gorselOkunamadiDosyaBozukOlabilir",
    );
    expect(heicConvertMock).toHaveBeenCalledTimes(1);
  });

  it("48 MP \"HEIF Max\" grid'li HEIC (8064×6048) çözülmeden 400 alır (R-2)", async () => {
    const buf = derivedHeif({ itemType: "grid", data: gridData(12, 16, 8064, 6048, false), ispes: [[8064, 6048], [512, 512]] });
    const err = await routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: buf }], 10).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BadRequestException);
    const res = (err as BadRequestException).getResponse() as { i18nKey: string; message: string };
    expect(res.i18nKey).toBe("api.ai.gorselCozunurluguCokYuksek");
    expect(res.message).toContain("25");
    expect(heicConvertMock).not.toHaveBeenCalled();
  });

  it("ispe'siz HEIC çözülmeden 400 alır", async () => {
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: heif("mif1", []) }], 10),
      "api.ai.gorselOkunamadiDosyaBozukOlabilir",
    );
    expect(heicConvertMock).not.toHaveBeenCalled();
  });

  it("HEIC çözme hatası 500 değil 400 döner (S016)", async () => {
    heicConvertMock.mockRejectedValue(new Error("HEIF processing error"));
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: heif("heic", [[4032, 3024]]) }], 10),
      "api.ai.gorselOkunamadiDosyaBozukOlabilir",
    );
    expect(heicConvertMock).toHaveBeenCalledTimes(1);
  });

  it("kesik JPEG 500 değil 400 döner (S016)", async () => {
    const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.jpg", buffer: broken }], 10),
      "api.ai.gorselOkunamadiDosyaBozukOlabilir",
    );
  });

  it("60 MP'yi aşan JPEG çözünürlük mesajıyla 400 döner (S016)", async () => {
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#fff" } })
      .jpeg({ quality: 50 })
      .toBuffer();
    // SOF0 başlığındaki boyutu 10000×10000 yap — sharp başlıktan reddeder.
    const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sof).toBeGreaterThan(0);
    jpeg.writeUInt16BE(10000, sof + 5);
    jpeg.writeUInt16BE(10000, sof + 7);
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.jpg", buffer: jpeg }], 10),
      "api.ai.gorselCozunurluguCokYuksek",
    );
  });

  it("geçerli PNG vision yoluna küçültülmüş JPEG olarak gider", async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#abc" } })
      .png()
      .toBuffer();
    const routed = await routeExtractInput([{ key: "ai-extract/c/a.png", buffer: png }], 10);
    expect(routed.route).toBe("image_vision");
    expect(routed.parts).toHaveLength(1);
    expect(routed.parts![0]!.mimeType).toBe("image/jpeg");
  });
});

/** Dışarıdan çözülebilen söz — çözme süresini testte elle yönetmek için. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function settle(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

describe("routeExtractInput — süreç genelinde tek HEIC çözme (R-2)", () => {
  const heicFile = () => [{ key: "ai-extract/c/a.heic", buffer: heif("heic", [[4032, 3024]]) }];

  beforeEach(() => heicConvertMock.mockReset());
  afterEach(() => jest.useRealTimers());

  it("eşzamanlı ikinci istek birincinin çözmesi bitene kadar sırada bekler", async () => {
    const first = deferred<ArrayBuffer>();
    const second = deferred<ArrayBuffer>();
    heicConvertMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    const a = settle(routeExtractInput(heicFile(), 10));
    const b = settle(routeExtractInput(heicFile(), 10));
    await flushMicrotasks();
    expect(heicConvertMock).toHaveBeenCalledTimes(1);

    first.reject(new Error("HEIF processing error"));
    const errA = await a;
    expect(errA).toBeInstanceOf(BadRequestException);
    await flushMicrotasks();
    // Yuva hatada da serbest kalır ve sıradakine devredilir.
    expect(heicConvertMock).toHaveBeenCalledTimes(2);

    second.reject(new Error("HEIF processing error"));
    expect(await b).toBeInstanceOf(BadRequestException);

    // Yuva sızmadı: sonraki istek beklemeden çözmeye girer.
    heicConvertMock.mockRejectedValueOnce(new Error("HEIF processing error"));
    expect(await settle(routeExtractInput(heicFile(), 10))).toBeInstanceOf(BadRequestException);
    expect(heicConvertMock).toHaveBeenCalledTimes(3);
  });

  it("sırada uzun bekleyen istek 429 alır, çözmeye girmez; yuva sızmaz", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    const first = deferred<ArrayBuffer>();
    heicConvertMock.mockImplementationOnce(() => first.promise);

    const a = settle(routeExtractInput(heicFile(), 10));
    const b = settle(routeExtractInput(heicFile(), 10));
    await flushMicrotasks();
    expect(heicConvertMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(HEIC_DECODE_QUEUE_TIMEOUT_MS);
    const errB = await b;
    // 5xx değil: web her 5xx'i genel toast'a çevirir, Sentry filtresi raporlar.
    expect(errB).toBeInstanceOf(HttpException);
    expect((errB as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((errB as HttpException).getResponse()).toMatchObject({
      i18nKey: "api.ai.gorselIslemeYogunBirazSonraDeneyin",
      code: "HEIC_DECODE_BUSY",
    });
    expect(heicConvertMock).toHaveBeenCalledTimes(1);

    first.reject(new Error("HEIF processing error"));
    expect(await a).toBeInstanceOf(BadRequestException);

    // Zaman aşımına uğrayan bekleyen sıradan çıkarıldı: yuva boşaldı.
    heicConvertMock.mockRejectedValueOnce(new Error("HEIF processing error"));
    expect(await settle(routeExtractInput(heicFile(), 10))).toBeInstanceOf(BadRequestException);
    expect(heicConvertMock).toHaveBeenCalledTimes(2);
  });

  it("piksel tavanını aşan HEIC sıraya hiç girmez (yuva doluyken de hemen 400)", async () => {
    const first = deferred<ArrayBuffer>();
    heicConvertMock.mockImplementationOnce(() => first.promise);
    const a = settle(routeExtractInput(heicFile(), 10));
    await flushMicrotasks();

    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/b.heic", buffer: heif("heic", [[8064, 6048]]) }], 10),
      "api.ai.gorselCozunurluguCokYuksek",
    );
    expect(heicConvertMock).toHaveBeenCalledTimes(1);

    first.reject(new Error("HEIF processing error"));
    expect(await a).toBeInstanceOf(BadRequestException);
  });
});

describe("routeExtractInput — CSV ayraci (derin denetim MU-08 S016)", () => {
  it("TR Excel'in ';' ayracli CSV'si ondalik virgulden bolunmez", async () => {
    const csv = "Kalem;Miktar;Birim\nKablo NYA 2,5 mm2;120,5;metre\nPriz;40;adet\n";
    const out = await routeExtractInput([{ key: "ai-extract/c/u-kalemler.csv", buffer: Buffer.from(csv, "utf8") }], 10);
    expect(out.route).toBe("text");
    expect(out.documentText).toContain("| Kablo NYA 2,5 mm2 | 120,5 | metre |");
    expect(out.documentText).toContain("| Priz | 40 | adet |");
  });

  it("MU-19 S029: CSV hucreleri ham metin kalir (binlik/tarih ExcelJS'te donusmez)", async () => {
    const csv = "Kalem;Miktar;Termin\nSac;1.500;05-09-2026\n";
    const out = await routeExtractInput([{ key: "ai-extract/c/u-k.csv", buffer: Buffer.from(csv, "utf8") }], 10);
    expect(out.documentText).toContain("| Sac | 1.500 | 05-09-2026 |");
  });

  it("',' ayracli CSV eskisi gibi okunur", async () => {
    const csv = "Item,Qty,Unit\nCable NYA 2.5 mm2,120.5,m\n";
    const out = await routeExtractInput([{ key: "ai-extract/c/u-items.csv", buffer: Buffer.from(csv, "utf8") }], 10);
    expect(out.documentText).toContain("| Cable NYA 2.5 mm2 | 120.5 | m |");
  });
});
