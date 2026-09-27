/**
 * YENİ PARA BİRİMLERİ UÇTAN UCA (2026-09-27) — sözleşme: TCMB'nin verdiği 12
 * yeni birim (AZN, SEK, …, CAD) talep ve teklif DTO'larından geçer ve servis
 * tarafından saklanır. Eskiden `CurrencyDto`/`BidCurrencyDto` elle yazılmış
 * 9'luk listeydi: web formu AZN sunarken talep yayını 400 alıyordu.
 * DTO doğrulaması global ValidationPipe ile aynı seçeneklerle koşar.
 */
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateListingDto } from "../../src/modules/company-listings/dto/create-listing.dto";
import { PlaceBidDto } from "../../src/modules/company-listings/dto/place-bid.dto";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

function validated<T extends object>(cls: new () => T, body: Record<string, unknown>): T {
  const inst = plainToInstance(cls, body);
  const errors = validateSync(inst as object, { whitelist: true, forbidNonWhitelisted: true });
  expect(errors.map((e) => `${e.property}: ${JSON.stringify(e.constraints ?? e.children)}`)).toEqual([]);
  return inst;
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("yeni para birimleri — talep ve teklif", () => {
  it("Azerbaycanlı alıcı AZN talep açar (DTO + servis), tedarikçi AZN teklif verir (kur damgalı)", async () => {
    const { service, ...mocks } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "AZ" });

    const dto = validated(CreateListingDto, {
      type: "ALIM",
      format: "RFQ",
      visibility: "CONNECTIONS",
      title: "Paslanmaz boru alımı",
      closesAt: FUTURE.toISOString(),
      primaryCurrency: "AZN",
      allowedCurrencies: ["AZN", "USD"],
      items: [{ name: "Paslanmaz boru DN50", quantity: 10, unit: "adet" }],
    });
    const created = await service.create(owner.auth, dto as never);
    const stored = await prisma.listing.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.primaryCurrency).toBe("AZN");
    expect(stored.allowedCurrencies).toEqual(["AZN", "USD"]);

    // Teklif: AÇIK talepte AZN; kur damgası TCMB stub'ından (1 AZN = 24,4 TRY).
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      primaryCurrency: "AZN",
      allowedCurrencies: ["AZN"],
    } as never);
    const item = await makeItem(prisma, listing.id, { name: "Paslanmaz boru DN50", quantity: 10 } as never);
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    mocks.exchangeRates.getFreshRate.mockImplementation(async (c: string) => (c === "AZN" ? 24.4 : 34));

    const bidDto = validated(PlaceBidDto, {
      currency: "AZN",
      validityDays: 30,
      deliveryTime: "W1_2",
      items: [{ itemId: item.id, unitPrice: 150 }],
    });
    await service.placeBid(bidder.auth, listing.id, bidDto as never);

    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(bid.status).toBe("SUBMITTED");
    expect(bid.currency).toBe("AZN");
    expect(bid.amount.toString()).toBe("1500");
    expect(Number(bid.exchangeRateSnapshot)).toBe(24.4);
  });

  it("listede olmayan birim (KZT) DTO'da reddedilir", () => {
    const listingErrors = validateSync(
      plainToInstance(CreateListingDto, { primaryCurrency: "KZT" }) as object,
    ).filter((e) => e.property === "primaryCurrency");
    expect(listingErrors.length).toBeGreaterThan(0);
    const bidErrors = validateSync(plainToInstance(PlaceBidDto, { currency: "KZT" }) as object).filter(
      (e) => e.property === "currency",
    );
    expect(bidErrors.length).toBeGreaterThan(0);
  });
});
