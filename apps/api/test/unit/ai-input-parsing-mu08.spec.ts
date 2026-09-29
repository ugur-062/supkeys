import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { parseSeparatedNumber } from "../../src/modules/ai/ai-text";
import { parseModelNumber as parseBidNumber, sanitizeRows } from "../../src/modules/ai/bid-price-extract/bid-price-extract.service";
import { parseModelNumber as parseIntentNumber, sanitizeIntent } from "../../src/modules/ai/search-intent/search-intent.service";
import { searchIntentSystemPrompt } from "../../src/modules/ai/search-intent/search-intent.prompts";
import { SeoEnrichDto } from "../../src/modules/ai/seo-enrich/seo-enrich.controller";
import { resolveAiUploadMime } from "../../src/modules/ai/tender-extract/tender-extract.service";

/**
 * Derin denetim 2026-09-29 MU-08 — AI girdi/çıktı ayrıştırma.
 *  S014: "1,500.50" (EN) hep TR sayılıp 1.5005 okunuyordu (1000x düşük fiyat).
 *  S015: arama niyetinde EN binlik "1,500" / "10,000" ondalık okunuyordu.
 *  X05: SeoEnrichDto servisin kırpma sınırlarını doğrulama olarak uyguluyordu.
 *  S016: yükleme MIME ön elemesi Windows CSV / codec'siz HEIC'i reddediyordu.
 */

describe("parseSeparatedNumber", () => {
  it("iki ayraç birlikte: sondaki ondalık", () => {
    expect(parseSeparatedNumber("1,500.50")).toBe(1500.5);
    expect(parseSeparatedNumber("1.500,50")).toBe(1500.5);
    expect(parseSeparatedNumber("1,234,567.89")).toBe(1234567.89);
    expect(parseSeparatedNumber("1.234.567,89")).toBe(1234567.89);
  });

  it("tekrarlı 3'lü gruplar binlik; bozuk gruplar null", () => {
    expect(parseSeparatedNumber("1,500,000")).toBe(1500000);
    expect(parseSeparatedNumber("1.500.000")).toBe(1500000);
    expect(parseSeparatedNumber("1,5,0")).toBeNull();
    expect(parseSeparatedNumber("1.500.50,1.2")).toBeNull();
  });

  it("tek ayraç + 3 hane: bayrağa göre binlik, yoksa ondalık; sıfırla başlayan hep ondalık", () => {
    expect(parseSeparatedNumber("1,500")).toBe(1.5);
    expect(parseSeparatedNumber("1,500", { commaThousands: true })).toBe(1500);
    expect(parseSeparatedNumber("1.500")).toBe(1.5);
    expect(parseSeparatedNumber("1.500", { dotThousands: true })).toBe(1500);
    expect(parseSeparatedNumber("0,125", { commaThousands: true })).toBe(0.125);
    expect(parseSeparatedNumber("12,5", { commaThousands: true })).toBe(12.5);
  });

  it("sembol/birim atılır, işaret korunur, rakamsız null", () => {
    expect(parseSeparatedNumber("$1,500.50 USD")).toBe(1500.5);
    expect(parseSeparatedNumber("185,50 ₺")).toBe(185.5);
    expect(parseSeparatedNumber("-5")).toBe(-5);
    expect(parseSeparatedNumber("abc")).toBeNull();
    expect(parseSeparatedNumber("")).toBeNull();
  });
});

describe("bid-price-extract parseModelNumber (S014)", () => {
  it("EN proforma biçimi 1000x düşük okunmaz", () => {
    expect(parseBidNumber("1,500.50")).toBe(1500.5);
    expect(parseBidNumber("1,500,000")).toBe(1500000);
  });

  it("sözleşme korunur: tek nokta ondalık, TR virgül ondalık", () => {
    expect(parseBidNumber("1.875")).toBe(1.875);
    expect(parseBidNumber("1.500,50")).toBe(1500.5);
    expect(parseBidNumber("12,5")).toBe(12.5);
    expect(parseBidNumber("1,500")).toBe(1.5);
    expect(parseBidNumber("1,500", "tr")).toBe(1.5);
    expect(parseBidNumber("1,500", "de")).toBe(1.5);
  });

  it("belge dili virgülü binlik kullanıyorsa '1,500' binlik", () => {
    expect(parseBidNumber("1,500", "en")).toBe(1500);
    expect(parseBidNumber("1,500", "EN")).toBe(1500);
    expect(parseBidNumber("1,500", "zh")).toBe(1500);
    expect(parseBidNumber("0,125", "en")).toBe(0.125);
  });

  it("sanitizeRows belge dilini sayılara uygular", () => {
    const rows = sanitizeRows([{ text: "Valve", unitPrice: "1,500.50", quantity: "1,200", totalPrice: "1,800,600" }], "en");
    expect(rows[0]).toMatchObject({ unitPrice: 1500.5, quantity: 1200, totalPrice: 1800600 });
    expect(sanitizeRows([{ text: "Vana", quantity: "1,200" }], "tr")[0]!.quantity).toBe(1.2);
  });
});

describe("search-intent parseModelNumber (S015)", () => {
  it("EN: virgül binlik — '$1,500' fiyat tavanı ve '10,000' adet 1000x küçülmez", () => {
    expect(parseIntentNumber("1,500", 1e12, "en")).toBe(1500);
    expect(parseIntentNumber("10,000", 1e9, "en")).toBe(10000);
    expect(parseIntentNumber("1,500.50", 1e12, "en")).toBe(1500.5);
    expect(parseIntentNumber("1.5", 1e12, "en")).toBe(1.5);
  });

  it("TR/RU: nokta binlik, virgül ondalık (eski davranış)", () => {
    expect(parseIntentNumber("1.500", 1e12, "tr")).toBe(1500);
    expect(parseIntentNumber("1,5", 1e12, "tr")).toBe(1.5);
    expect(parseIntentNumber("1.500,50", 1e12, "ru")).toBe(1500.5);
    expect(parseIntentNumber("1,500,000", 1e12, "tr")).toBe(1500000);
    expect(parseIntentNumber("12 adet", 1e9, "tr")).toBe(12);
    expect(parseIntentNumber("-5", 1e9, "tr")).toBeNull();
  });

  it("sanitizeIntent dili sayılara geçirir", () => {
    const s = sanitizeIntent({ query: "m6 bolts", priceMax: "1,500", quantity: "10,000" }, "10,000 pcs M6 bolts under $1,500", "en");
    expect(s.priceMax).toBe(1500);
    expect(s.quantity).toBe(10000);
  });

  it("istem binlik ayracı yasaklar", () => {
    const prompt = searchIntentSystemPrompt("en", ["USD"]);
    expect(prompt).toMatch(/"\$1,500" → "1500"/);
    expect(prompt).toMatch(/"10,000 pcs" → "10000"/);
  });
});

describe("SeoEnrichDto (X05)", () => {
  const base = { kind: "listing", name: "Kablo alımı" };
  const errs = async (extra: Record<string, unknown>) =>
    (await validate(plainToInstance(SeoEnrichDto, { ...base, ...extra }))).map((e) => e.property);

  it("uzun olgu, 41+ olgu ve 45 karakterlik etiket 400 almaz (kırpma serviste)", async () => {
    expect(await errs({ facts: ["x".repeat(2300)] })).toEqual([]);
    expect(await errs({ facts: Array.from({ length: 120 }, (_, i) => `kalem ${i}`) })).toEqual([]);
    expect(await errs({ keywords: ["y".repeat(45)] })).toEqual([]);
  });

  it("güvenlik tavanı ve tür denetimi sürer", async () => {
    expect(await errs({ facts: Array.from({ length: 501 }, () => "a") })).toEqual(["facts"]);
    expect(await errs({ facts: ["z".repeat(5001)] })).toEqual(["facts"]);
    expect(await errs({ keywords: [42] })).toEqual(["keywords"]);
  });
});

describe("resolveAiUploadMime (S016)", () => {
  it("izinli tip olduğu gibi", () => {
    expect(resolveAiUploadMime("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolveAiUploadMime("a.csv", "text/csv")).toBe("text/csv");
  });

  it("Windows Excel'in CSV tipi .csv ile kabul, .xls ile red", () => {
    expect(resolveAiUploadMime("kalemler.csv", "application/vnd.ms-excel")).toBe("text/csv");
    expect(resolveAiUploadMime("kalemler.CSV", "application/vnd.ms-excel")).toBe("text/csv");
    expect(resolveAiUploadMime("eski.xls", "application/vnd.ms-excel")).toBeNull();
  });

  it("boş / octet-stream tip uzantıdan kanonik tipe", () => {
    expect(resolveAiUploadMime("IMG_0001.HEIC", "")).toBe("image/heic");
    expect(resolveAiUploadMime("foto.heif", "application/octet-stream")).toBe("image/heif");
    expect(resolveAiUploadMime("liste.xlsx", "")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(resolveAiUploadMime("belge.exe", "")).toBeNull();
    expect(resolveAiUploadMime("adsiz", "")).toBeNull();
  });

  it("izinsiz açık tip reddedilir", () => {
    expect(resolveAiUploadMime("a.html", "text/html")).toBeNull();
    expect(resolveAiUploadMime("a.csv", "text/html")).toBeNull();
  });
});
