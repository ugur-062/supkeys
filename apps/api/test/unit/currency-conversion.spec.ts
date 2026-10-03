import "reflect-metadata";
import { of } from "rxjs";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateListingDto } from "../../src/modules/company-listings/dto/create-listing.dto";
import { PlaceBidDto } from "../../src/modules/company-listings/dto/place-bid.dto";
import { Currency } from "@rothern/db";
import {
  CURRENCY_CODES,
  FOREIGN_CURRENCY_CODES,
  comparableUnitPrice,
  currencyForLocale,
  defaultCurrencyForCountry,
  isCurrencyCode,
  productPriceBase,
} from "@rothern/shared";
import {
  FALLBACK_RATES,
  convertAmount,
  fxRate,
  resetFxRates,
  resolveCompanyCurrency,
  resolveVisitorCurrency,
  setFxRates,
} from "../../src/common/currency/fx-rates";
import {
  priceHistogram,
  productIndexOrderBy,
  productIndexWhere,
  type ProductFacetRow,
} from "../../src/common/company/product-index";
import { listingRateToTry, reportCurrencyOf, tryToCurrency } from "../../src/common/company/report-currency";
import { TcmbService } from "../../src/modules/currency/services/tcmb.service";

/**
 * PARA BİRİMLERİ + KURLA ÇEVİRME (2026-09-27, uluslararası tur).
 *
 * Ürün dizininin fiyat süzgeci/sıralaması/histogramı ortak tabanda (TRY
 * karşılığı, `priceAmountBase`) çalışır; pano ve raporlar firmanın rapor para
 * biriminde. Bu dosya DB'ye dokunmaz.
 */
afterEach(() => resetFxRates());

describe("para birimi listesi — tek kaynak", () => {
  it("shared liste Prisma `Currency` enum'ıyla BİREBİR (yeni birim iki yerde)", () => {
    expect([...CURRENCY_CODES].sort()).toEqual(Object.values(Currency).sort());
  });

  it("TCMB'nin verdiği 12 yeni birim listede; TRY yabancı listede yok", () => {
    for (const c of ["AZN", "SEK", "NOK", "DKK", "BGN", "RON", "KRW", "SAR", "QAR", "KWD", "AUD", "CAD"]) {
      expect(isCurrencyCode(c)).toBe(true);
    }
    expect(FOREIGN_CURRENCY_CODES).not.toContain("TRY");
    expect(isCurrencyCode("KZT")).toBe(false);
  });

  it("her yabancı birimin yedek kuru var (kur tablosu boşken süzgeç çalışsın)", () => {
    for (const c of FOREIGN_CURRENCY_CODES) expect(FALLBACK_RATES[c]).toBeGreaterThan(0);
  });
});

describe("DTO para birimi doğrulaması — shared listeden", () => {
  const errs = <T extends object>(cls: new () => T, body: Record<string, unknown>, field: string) =>
    validateSync(plainToInstance(cls, body) as object).filter((e) => e.property === field);

  it("talep ve teklif DTO'su yeni birimleri kabul eder (eskiden 9'luk elle liste → AZN talep 400)", () => {
    expect(errs(CreateListingDto, { primaryCurrency: "AZN", allowedCurrencies: ["AZN", "KRW"] }, "primaryCurrency")).toHaveLength(0);
    expect(errs(CreateListingDto, { primaryCurrency: "AZN", allowedCurrencies: ["AZN", "KRW"] }, "allowedCurrencies")).toHaveLength(0);
    expect(errs(PlaceBidDto, { currency: "SEK" }, "currency")).toHaveLength(0);
  });

  it("listede olmayan birim reddedilir", () => {
    expect(errs(CreateListingDto, { primaryCurrency: "KZT" }, "primaryCurrency").length).toBeGreaterThan(0);
    expect(errs(PlaceBidDto, { currency: "KZT" }, "currency").length).toBeGreaterThan(0);
  });
});

describe("varsayılan para birimi", () => {
  it("ülkeden: yeni birimler yerel, Bulgaristan euro (2026), TCMB'de olmayan AB üyesi EUR", () => {
    expect(defaultCurrencyForCountry("AZ")).toBe("AZN");
    expect(defaultCurrencyForCountry("SE")).toBe("SEK");
    expect(defaultCurrencyForCountry("NO")).toBe("NOK");
    expect(defaultCurrencyForCountry("DK")).toBe("DKK");
    expect(defaultCurrencyForCountry("RO")).toBe("RON");
    expect(defaultCurrencyForCountry("KR")).toBe("KRW");
    expect(defaultCurrencyForCountry("SA")).toBe("SAR");
    expect(defaultCurrencyForCountry("QA")).toBe("QAR");
    expect(defaultCurrencyForCountry("KW")).toBe("KWD");
    expect(defaultCurrencyForCountry("AU")).toBe("AUD");
    expect(defaultCurrencyForCountry("CA")).toBe("CAD");
    expect(defaultCurrencyForCountry("BG")).toBe("EUR");
    expect(defaultCurrencyForCountry("PL")).toBe("EUR");
    expect(defaultCurrencyForCountry("KZ")).toBe("USD");
  });

  it("oturumsuz ziyaretçide arayüz dilinden: tr TRY · ru RUB · en USD", () => {
    expect(currencyForLocale("tr")).toBe("TRY");
    expect(currencyForLocale("ru")).toBe("RUB");
    expect(currencyForLocale("en")).toBe("USD");
    expect(resolveVisitorCurrency(undefined, "ru")).toBe("RUB");
    expect(resolveVisitorCurrency("EUR", "tr")).toBe("EUR");
    expect(resolveVisitorCurrency("XXX", "tr")).toBe("TRY");
  });

  it("panelde firma ülkesinden; açık seçim önce gelir", () => {
    expect(resolveCompanyCurrency(undefined, "DE")).toBe("EUR");
    expect(resolveCompanyCurrency("USD", "DE")).toBe("USD");
    expect(resolveCompanyCurrency(undefined, "TR")).toBe("TRY");
  });
});

describe("kur tablosu (bellek içi)", () => {
  it("yüklenmeden yedek kur, yüklenince TCMB kuru; TRY hep 1", () => {
    expect(fxRate("TRY")).toBe(1);
    expect(fxRate("EUR")).toBe(FALLBACK_RATES.EUR);
    setFxRates({ EUR: 50, USD: 40 });
    expect(fxRate("EUR")).toBe(50);
    expect(fxRate("GBP")).toBe(FALLBACK_RATES.GBP);
    expect(fxRate("ZZZ")).toBeNull();
  });

  it("çapraz kur TRY üzerinden (kur_from / kur_to)", () => {
    setFxRates({ EUR: 50, USD: 40 });
    expect(convertAmount(100, "EUR", "USD")).toBeCloseTo(125);
    expect(convertAmount(4000, "TRY", "USD")).toBeCloseTo(100);
    expect(convertAmount(10, "EUR", "EUR")).toBe(10);
    expect(convertAmount(10, "EUR", "ZZZ")).toBeNull();
  });
});

describe("ürün fiyat tabanı (priceAmountBase)", () => {
  it("karşılaştırılabilir fiyat kartla aynı: sabitte tutar, kademelide EN DÜŞÜK kademe, teklifle yok", () => {
    expect(comparableUnitPrice({ priceMode: "FIXED", priceAmount: "450", priceTiers: null })).toBe(450);
    expect(
      comparableUnitPrice({
        priceMode: "TIERED",
        priceAmount: null,
        priceTiers: [
          { minQty: 1, unitPrice: 12 },
          { minQty: 100, unitPrice: 9.5 },
        ],
      }),
    ).toBe(9.5);
    expect(comparableUnitPrice({ priceMode: "ON_REQUEST", priceAmount: null, priceTiers: null })).toBeNull();
    expect(comparableUnitPrice({ priceMode: "FIXED", priceAmount: null, priceTiers: null })).toBeNull();
  });

  it("TRY karşılığı kurla; kur bilinmiyorsa null (uydurma kurla sıralamaz)", () => {
    const rate = (c: string) => ({ TRY: 1, EUR: 50 })[c] ?? null;
    expect(productPriceBase({ priceMode: "FIXED", priceAmount: 450, priceTiers: null, priceCurrency: "EUR" }, rate)).toBe(22_500);
    expect(productPriceBase({ priceMode: "FIXED", priceAmount: 490, priceTiers: null, priceCurrency: "TRY" }, rate)).toBe(490);
    expect(productPriceBase({ priceMode: "FIXED", priceAmount: 5, priceTiers: null, priceCurrency: "KWD" }, rate)).toBeNull();
  });
});

describe("ürün dizini — kurla çevrilmiş süzgeç/sıralama/histogram", () => {
  const baseClause = (w: ReturnType<typeof productIndexWhere>) =>
    ((w.AND as Record<string, unknown>[]) ?? []).find((c) => "OR" in c && JSON.stringify(c).includes("priceAmountBase")) as
      | { OR: { priceAmountBase?: { gte?: number; lte?: number } }[] }
      | undefined;

  it("sınırlar seçilen birimden TRY'ye çevrilip `priceAmountBase` ile kıyaslanır (Alman alıcı: 'en çok 500 EUR')", () => {
    setFxRates({ EUR: 50 });
    const w = productIndexWhere({ currency: "EUR", priceMax: 500 });
    expect(baseClause(w)!.OR[0]!.priceAmountBase).toEqual({ lte: 25_000 });
    // 450 EUR (22.500 TRY) içeride, 490 TRY'lik ürün de içeride — ama artık
    // AYNI ölçekte: 490 TRY ≈ 9,8 EUR, "500" EUR sınırıyla doğru kıyaslanır.
  });

  it("para birimi verilmezse TRY (eski davranış)", () => {
    const w = productIndexWhere({ priceMin: 100, priceMax: 900 });
    expect(baseClause(w)!.OR[0]!.priceAmountBase).toEqual({ gte: 100, lte: 900 });
  });

  it("fiyat sırası TRY karşılığından (JPY/KRW ham tutarla en pahalı görünmesin)", () => {
    expect(productIndexOrderBy("price")[0]).toEqual({ priceAmountBase: { sort: "asc", nulls: "last" } });
    expect(productIndexOrderBy("price_desc")[0]).toEqual({ priceAmountBase: { sort: "desc", nulls: "last" } });
  });

  it("her sıralama benzersiz `id` ile biter (skip/take sayfalarında tekrar/kayıp yok)", () => {
    for (const sort of [undefined, "newest", "price", "price_desc"] as const) {
      expect(productIndexOrderBy(sort).at(-1)).toEqual({ id: "asc" });
    }
  });

  it("histogram seçilen birimde (TRY tabanı ÷ kur)", () => {
    setFxRates({ EUR: 50 });
    const row = (base: number): ProductFacetRow => ({
      categoryId: "39121000",
      priceMode: "FIXED",
      priceAmountBase: base,
      company: { city: null, activities: [] },
    });
    const h = priceHistogram([row(5_000), row(50_000), row(500_000)], "EUR")!;
    expect(h.min).toBe(100);
    expect(h.max).toBe(10_000);
  });

  it("arayüz testi O-016: USD'de çubuk sayısı = tıklama süzgecinin sonucu (1'in altı ilk kovaya YIĞILMAZ)", () => {
    setFxRates({ USD: 40 });
    const row = (base: number): ProductFacetRow => ({
      categoryId: "39121000",
      priceMode: "FIXED",
      priceAmountBase: base,
      company: { city: null, activities: [] },
    });
    // 0,1 $ – 250 $ arası; çoğu 1 $'ın altında ya da 1–2 $ bandında.
    const usd = [0.1, 0.2, 0.3, 0.5, 0.8, 0.9, 1, 1.2, 1.5, 1.8, 2, 2.5, 3, 4, 6, 9, 15, 30, 80, 250];
    const rows = usd.map((u) => row(u * 40));
    const h = priceHistogram(rows, "USD")!;
    expect(h.min).toBe(0);
    expect(h.max).toBe(250);
    for (const b of h.buckets) {
      // `productIndexWhere`: gte from·kur, lte to·kur (kapalı aralık, TRY tabanında).
      const listed = rows.filter((r) => r.priceAmountBase! >= b.from * 40 && r.priceAmountBase! <= b.to * 40).length;
      expect(b.count).toBe(listed);
    }
    expect(h.buckets.reduce((a, b) => a + b.count, 0)).toBe(rows.length);
  });
});

describe("rapor para birimi", () => {
  it("Talep Şartları ana birimi önce, yoksa ülkenin birimi", () => {
    expect(reportCurrencyOf({ country: "DE", requestDefaults: null })).toBe("EUR");
    expect(reportCurrencyOf({ country: "DE", requestDefaults: { primaryCurrency: "USD" } })).toBe("USD");
    expect(reportCurrencyOf({ country: "TR", requestDefaults: { primaryCurrency: "bogus" } })).toBe("TRY");
    expect(reportCurrencyOf(null)).toBe("TRY");
  });

  it("TRY karşılığı → rapor birimi; ilan kuru o birimdeki teklifin damgasından", () => {
    setFxRates({ EUR: 50 });
    expect(tryToCurrency(5_000, "EUR")).toBeCloseTo(100);
    expect(listingRateToTry({ primaryCurrency: "TRY", bids: [] })).toBe(1);
    expect(
      listingRateToTry({
        primaryCurrency: "EUR",
        bids: [
          { currency: "USD", exchangeRateSnapshot: "40" },
          { currency: "EUR", exchangeRateSnapshot: "48.5" },
        ],
      }),
    ).toBe(48.5);
    expect(listingRateToTry({ primaryCurrency: "EUR", bids: [{ currency: "EUR", exchangeRateSnapshot: null }] })).toBeNull();
  });
});

describe("TCMB ayrıştırma — birim (Unit) normalizasyonu", () => {
  it("100'lük verilen birimler (JPY, KRW) 1 birime çevrilir; yeni birimler okunur", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="25.09.2026" Date="09/25/2026">
  <Currency CurrencyCode="USD"><Unit>1</Unit><ForexSelling>41.50</ForexSelling></Currency>
  <Currency CurrencyCode="JPY"><Unit>100</Unit><ForexSelling>28.00</ForexSelling></Currency>
  <Currency CurrencyCode="KRW"><Unit>100</Unit><ForexSelling>3.00</ForexSelling></Currency>
  <Currency CurrencyCode="AZN"><Unit>1</Unit><ForexSelling>24.40</ForexSelling></Currency>
  <Currency CurrencyCode="KWD"><Unit>1</Unit><ForexSelling>135.90</ForexSelling></Currency>
  <Currency CurrencyCode="XDR"><Unit>1</Unit><ForexSelling>56.00</ForexSelling></Currency>
</Tarih_Date>`;
    const svc = new TcmbService({ get: () => of({ data: xml }) } as never);
    const r = await svc.fetchTodayRates();
    expect(r!.date).toBe("2026-09-25");
    expect(r!.rates.USD).toBeCloseTo(41.5);
    expect(r!.rates.JPY).toBeCloseTo(0.28);
    expect(r!.rates.KRW).toBeCloseTo(0.03);
    expect(r!.rates.AZN).toBeCloseTo(24.4);
    expect(r!.rates.KWD).toBeCloseTo(135.9);
    // Takip edilmeyen birim (XDR) yazılmaz.
    expect(r!.rates).not.toHaveProperty("XDR");
  });
});
