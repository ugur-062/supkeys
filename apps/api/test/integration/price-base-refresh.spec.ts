/**
 * ÜRÜN FİYAT TABANI TAZELEMESİ (2026-09-27, "kurla çevir") — sözleşme:
 * kur işi ürünlerin TRY karşılığını (`priceAmountBase`) güncel kurla yeniden
 * yazar; teklifle fiyatta NULL'lar; `updatedAt` İLERLEMEZ (ham SQL — sitemap
 * lastmod ve çeviri kapsam denetimi sahte "değişti" görmesin).
 */
import "reflect-metadata";
import type { PrismaBypassService, PrismaService } from "../../src/common/prisma/prisma.service";
import { ExchangeRateService } from "../../src/modules/currency/services/exchange-rate.service";
import type { TcmbService } from "../../src/modules/currency/services/tcmb.service";
import { resetFxRates, setFxRates, fxRate } from "../../src/common/currency/fx-rates";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const service = () =>
  new ExchangeRateService(
    prisma as unknown as PrismaService,
    {} as TcmbService,
    prisma as unknown as PrismaBypassService,
  );

async function item(companyId: string, userId: string, over: Record<string, unknown>) {
  return prisma.companyItem.create({
    data: { companyId, createdById: userId, name: `Ürün ${Math.random()}`, unit: "adet", ...over },
  });
}

describe("ExchangeRateService.refreshProductPriceBases", () => {
  beforeEach(async () => {
    await truncateAll();
    resetFxRates();
  });
  afterAll(() => resetFxRates());

  it("güncel kurla yeniden yazar, teklifle fiyatı NULL'lar, updatedAt'e dokunmaz", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const eur = await item(company.id, user.id, { priceMode: "FIXED", priceAmount: 450, priceCurrency: "EUR", priceAmountBase: 1 });
    const tiered = await item(company.id, user.id, {
      priceMode: "TIERED",
      priceTiers: [{ minQty: 1, unitPrice: 30 }, { minQty: 100, unitPrice: 20 }],
      priceCurrency: "USD",
    });
    const tryItem = await item(company.id, user.id, { priceMode: "FIXED", priceAmount: 490, priceCurrency: "TRY", priceAmountBase: 490 });
    const onReq = await item(company.id, user.id, { priceMode: "ON_REQUEST", priceAmountBase: 999 });
    const before = await prisma.companyItem.findUniqueOrThrow({ where: { id: eur.id }, select: { updatedAt: true } });

    setFxRates({ EUR: 50, USD: 40 });
    expect(fxRate("EUR")).toBe(50);
    const changed = await service().refreshProductPriceBases();
    // Değişmeyen (TRY 490) yazılmaz.
    expect(changed).toBe(3);

    const rows = await prisma.companyItem.findMany({
      where: { id: { in: [eur.id, tiered.id, tryItem.id, onReq.id] } },
      select: { id: true, priceAmountBase: true, updatedAt: true },
    });
    const base = (id: string) => {
      const v = rows.find((r) => r.id === id)!.priceAmountBase;
      return v == null ? null : Number(v);
    };
    expect(base(eur.id)).toBe(22_500);
    expect(base(tiered.id)).toBe(800); // en düşük kademe 20 USD × 40
    expect(base(tryItem.id)).toBe(490);
    expect(base(onReq.id)).toBeNull();
    expect(rows.find((r) => r.id === eur.id)!.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    // İdempotent: aynı kurla ikinci koşum hiçbir şey yazmaz.
    expect(await service().refreshProductPriceBases()).toBe(0);
  });
});
