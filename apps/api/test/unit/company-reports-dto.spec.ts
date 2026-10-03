import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  BidComparisonDto,
  GeneralReportDto,
  ReportListingOptionsQueryDto,
  SavingsReportDto,
} from "../../src/modules/company-reports/dto/report-input.dto";

/**
 * Derin denetim LU-17 (S035): rapor gövdeleri TS interface'iydi, global
 * ValidationPipe hiçbir şey doğrulamıyordu → `{"listingId":123}` TypeError,
 * geçersiz tarih/enum Prisma hatası olarak 500 dönüyordu.
 */
async function errorsOf(
  cls: new () => object,
  body: unknown,
): Promise<string[]> {
  const errs = await validate(plainToInstance(cls, body) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errs.map((e) => e.property);
}

// Web istemcisinin gönderdiği biçim (`appDayRangeIso` → toISOString).
const range = {
  rangeStart: "2026-09-01T00:00:00.000Z",
  rangeEnd: "2026-09-30T20:59:59.999Z",
};

describe("GeneralReportDto", () => {
  it("web istemcisinin SINGLE ve RANGE gövdeleri geçerli (type: ALIM dahil)", async () => {
    expect(
      await errorsOf(GeneralReportDto, { type: "ALIM", mode: "SINGLE", listingId: "ROT-000042" }),
    ).toEqual([]);
    expect(
      await errorsOf(GeneralReportDto, {
        type: "ALIM",
        mode: "RANGE",
        ...range,
        format: "RFQ",
        status: "AWARDED",
        currency: "EUR",
      }),
    ).toEqual([]);
  });

  it("geçersiz mod, tarih, usul, durum ve birim reddedilir", async () => {
    expect(await errorsOf(GeneralReportDto, { mode: "ALL" })).toContain("mode");
    expect(
      await errorsOf(GeneralReportDto, { mode: "RANGE", rangeStart: "abc", rangeEnd: "x" }),
    ).toEqual(expect.arrayContaining(["rangeStart", "rangeEnd"]));
    expect(await errorsOf(GeneralReportDto, { mode: "RANGE", ...range, status: "FOO" })).toContain(
      "status",
    );
    expect(await errorsOf(GeneralReportDto, { mode: "RANGE", ...range, format: "DUTCH" })).toContain(
      "format",
    );
    expect(await errorsOf(GeneralReportDto, { mode: "RANGE", ...range, currency: "XYZ" })).toContain(
      "currency",
    );
  });

  it("sayı listingId ve fazladan alan reddedilir", async () => {
    expect(await errorsOf(GeneralReportDto, { mode: "SINGLE", listingId: 123 })).toContain(
      "listingId",
    );
    expect(await errorsOf(GeneralReportDto, { mode: "SINGLE", listingId: "x", foo: 1 })).toContain(
      "foo",
    );
  });
});

describe("SavingsReportDto", () => {
  it("geçerli gövde; eksik/bozuk tarih reddedilir", async () => {
    expect(await errorsOf(SavingsReportDto, { type: "ALIM", ...range })).toEqual([]);
    expect(await errorsOf(SavingsReportDto, { rangeStart: "abc" })).toEqual(
      expect.arrayContaining(["rangeStart", "rangeEnd"]),
    );
  });
});

describe("BidComparisonDto", () => {
  const base = { type: "ALIM", listingId: "ROT-000042", criteria: "BOTH" };

  it("geçerli gövde", async () => {
    expect(
      await errorsOf(BidComparisonDto, {
        ...base,
        includeNonBidders: true,
        showBidCurrencies: false,
        includeRoundHistory: true,
      }),
    ).toEqual([]);
  });

  it("sayı/eksik listingId, bilinmeyen kriter ve boolean olmayan bayrak reddedilir", async () => {
    expect(await errorsOf(BidComparisonDto, { ...base, listingId: 123 })).toContain("listingId");
    const { listingId: _omit, ...rest } = base;
    expect(await errorsOf(BidComparisonDto, rest)).toContain("listingId");
    expect(await errorsOf(BidComparisonDto, { ...base, criteria: "ALL" })).toContain("criteria");
    expect(await errorsOf(BidComparisonDto, { ...base, includeNonBidders: "yes" })).toContain(
      "includeNonBidders",
    );
  });
});

/** Talep seçicisi sorgusu (arayüz testi webB-1:NEW-1). */
describe("ReportListingOptionsQueryDto", () => {
  it("web istemcisinin sorgusu geçerli; excludeDrafts '1' → true, q kırpılır", async () => {
    expect(
      await errorsOf(ReportListingOptionsQueryDto, {
        q: "  ROT-000023 ",
        selected: "ROT-000023",
        excludeDrafts: "1",
      }),
    ).toEqual([]);
    expect(await errorsOf(ReportListingOptionsQueryDto, {})).toEqual([]);
    const dto = plainToInstance(ReportListingOptionsQueryDto, {
      q: "  çelik ",
      excludeDrafts: "1",
    });
    expect(dto.q).toBe("çelik");
    expect(dto.excludeDrafts).toBe(true);
  });

  it("aşırı uzun arama/seçim ve bilinmeyen parametre reddedilir", async () => {
    expect(await errorsOf(ReportListingOptionsQueryDto, { q: "x".repeat(121) })).toContain("q");
    expect(
      await errorsOf(ReportListingOptionsQueryDto, { selected: "x".repeat(65) }),
    ).toContain("selected");
    expect(await errorsOf(ReportListingOptionsQueryDto, { take: "5000" })).toContain("take");
  });
});
