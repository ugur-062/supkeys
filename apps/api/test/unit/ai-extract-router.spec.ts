import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import heicConvert from "heic-convert";
import {
  detectAiInputMime,
  heifMaxDeclaredPixels,
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

describe("routeExtractInput — görsel çözme kapıları", () => {
  beforeEach(() => heicConvertMock.mockReset());

  it("devasa boyut beyan eden HEIC çözülmeden 400 alır (X15)", async () => {
    await expectBadRequest(
      routeExtractInput([{ key: "ai-extract/c/a.heic", buffer: heif("heic", [[20000, 20000]]) }], 10),
      "api.ai.gorselCozunurluguCokYuksek",
    );
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
