import { Prisma } from "@prisma/client";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem } from "./factories";
import { CompanyDashboardService } from "../../src/modules/company-dashboard/company-dashboard.service";
import {
  DELIVERY_TIME_MAX_DAYS,
  expectedDeliveryFromTimes,
} from "../../src/common/company/delivery-time";
import { AUTH_COMPANY_SELECT } from "../../src/common/company/auth-company-select";

/**
 * Denetim 2026-08-28 Parça 12 Dalga A — sözleşme testleri.
 *
 * Kapsam: kimlik yolunun daraltılmış Company select'i (#12), teslim SÜRESİ →
 * tahmini teslim tarihi türetimi (#10), pano tasarrufunun tek-baza bağlanması
 * (#9). RLS bağlam boşlukları (#3/#4/#5) burada test EDİLEMEZ — etkileri ancak
 * RLS açıkken + kısıtlı rolle görünür; onlar `prisma-rls-wiring.spec.ts`
 * kapsamına girer.
 */
describe("Denetim P12 Dalga A", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("#12 — AUTH_COMPANY_SELECT", () => {
    it("kimlik kapısının okuduğu 7 alanı kapsar, vitrin/KYC bloğunu ÇEKMEZ", () => {
      // Kapının gerçekten kullandığı alanlar (company-jwt.strategy.validate +
      // realtime handshake). Biri select'ten düşerse kapı sessizce bozulur.
      for (const k of [
        "isActive",
        "isBlocked",
        "ownerUserId",
        "tier",
        "membershipEndAt",
        "companyVerificationStatus",
        "country",
      ]) {
        expect(AUTH_COMPANY_SELECT).toHaveProperty(k, true);
      }
      // Regresyon kapısı: select büyürse (biri `include: true`'ya dönerse ya da
      // vitrin alanı eklenirse) TOAST okuması geri gelir — 76 kolonun tamamını
      // her istekte çeken hâle dönmeyi engelle.
      expect(Object.keys(AUTH_COMPANY_SELECT).length).toBeLessThanOrEqual(10);
      for (const forbidden of [
        "aboutText",
        "photos",
        "certificateImages",
        "logoUrl",
        "coverUrl",
      ]) {
        expect(AUTH_COMPANY_SELECT).not.toHaveProperty(forbidden);
      }
    });

    it("Prisma bu select'i kabul eder ve yalnız seçilen alanları döndürür", async () => {
      const { company } = await makeCompanyWithUser(prisma);
      const row = await prisma.company.findUniqueOrThrow({
        where: { id: company.id },
        select: AUTH_COMPANY_SELECT,
      });
      expect(Object.keys(row).sort()).toEqual(
        Object.keys(AUTH_COMPANY_SELECT).sort(),
      );
    });
  });

  describe("#10 — teslim süresi → tahmini teslim tarihi", () => {
    it("bandın ÜST sınırını, en geç kalemi esas alarak uygular", () => {
      const from = new Date("2026-03-01T00:00:00.000Z");
      const d = expectedDeliveryFromTimes(from, ["W1_2", "W5_8", "STOKTAN"]);
      // en geç band W5_8 = 56 gün
      expect(d?.toISOString().slice(0, 10)).toBe("2026-04-26");
    });

    it("M3_PLUS için null döner — üst sınırı olmayan banda tarih UYDURMAZ", () => {
      const from = new Date("2026-03-01T00:00:00.000Z");
      expect(expectedDeliveryFromTimes(from, ["W1_2", "M3_PLUS"])).toBeNull();
      expect(DELIVERY_TIME_MAX_DAYS.M3_PLUS).toBeNull();
    });

    it("süresi olmayan kalem varsa null — kısmi bilgiden ERKEN tarih üretmez", () => {
      const from = new Date("2026-03-01T00:00:00.000Z");
      expect(expectedDeliveryFromTimes(from, ["W3_4", null])).toBeNull();
      expect(expectedDeliveryFromTimes(from, [])).toBeNull();
    });

    it("tüm bantlar artan sıralı (merdiven bozulursa alarm yanlış zamanlanır)", () => {
      const order = ["STOKTAN", "W1_2", "W3_4", "W5_8", "M2_3"] as const;
      const days = order.map((k) => DELIVERY_TIME_MAX_DAYS[k]!);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      expect(new Set(days).size).toBe(days.length);
    });
  });

  describe("#9 — pano tasarrufu tek-baza bağlı", () => {
    const makeDashboard = () =>
      new CompanyDashboardService(
        prisma as never,
        { getRateOnDate: jest.fn().mockResolvedValue(40) } as never,
      );

    /** Kazandırılmış ALIM ilanı + tek kalem + kazanan teklif kurar. */
    async function scenario(opts: {
      bidStatus: "WON" | "AWARDED_PARTIAL";
      bidCurrency: string;
      snapshot: number | null;
      awardedAt: Date | null;
      awardedQuantity?: number;
    }) {
      const buyer = await makeCompanyWithUser(prisma);
      const seller = await makeCompanyWithUser(prisma);
      const listing = await makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        type: "ALIM",
        status: "AWARDED",
        primaryCurrency: "TRY",
        awardedAt: opts.awardedAt,
      });
      const item = await makeItem(prisma, listing.id, {
        quantity: new Prisma.Decimal(10),
        targetPrice: new Prisma.Decimal(100),
        ...(opts.awardedQuantity != null
          ? { awardedQuantity: new Prisma.Decimal(opts.awardedQuantity) }
          : {}),
      });
      const bid = await prisma.listingBid.create({
        data: {
          listingId: listing.id,
          bidderCompanyId: seller.company.id,
          createdById: seller.user.id,
          amount: new Prisma.Decimal(800),
          currency: opts.bidCurrency as never,
          status: opts.bidStatus as never,
          exchangeRateSnapshot:
            opts.snapshot != null ? new Prisma.Decimal(opts.snapshot) : null,
        },
      });
      await prisma.listingBidItem.create({
        data: {
          bidId: bid.id,
          itemId: item.id,
          unitPrice: new Prisma.Decimal(80),
        },
      });
      return buyer;
    }

    it("AWARDED_PARTIAL teklifleri de sayar (kalem-bazlı kazandırma panoda görünür)", async () => {
      const buyer = await scenario({
        bidStatus: "AWARDED_PARTIAL",
        bidCurrency: "TRY",
        snapshot: null,
        awardedAt: new Date(),
      });
      const res = await makeDashboard().satinalmaTasarruf({
        companyId: buyer.company.id,
      } as never);
      // hedef 100 − kazanan 80 = 20/adet × 10 adet
      expect(res.year.totalSavings).toBeCloseTo(200, 5);
      expect(res.year.totalVolume).toBeCloseTo(800, 5);
    });

    it("kur DAMGASI yoksa satırı hesaba KATMAZ (fail-closed — uydurma kura düşmez)", async () => {
      const buyer = await scenario({
        bidStatus: "WON",
        bidCurrency: "USD",
        snapshot: null, // damga yok
        awardedAt: new Date(),
      });
      const res = await makeDashboard().satinalmaTasarruf({
        companyId: buyer.company.id,
      } as never);
      // Eski davranış getRateOnDate=40 ile 800*40 hacim uydururdu.
      expect(res.year.totalVolume).toBe(0);
      expect(res.year.totalSavings).toBe(0);
    });

    it("awardedQuantity varsa onu çarpar (tam quantity'yi değil)", async () => {
      const buyer = await scenario({
        bidStatus: "WON",
        bidCurrency: "TRY",
        snapshot: null,
        awardedAt: new Date(),
        awardedQuantity: 4,
      });
      const res = await makeDashboard().satinalmaTasarruf({
        companyId: buyer.company.id,
      } as never);
      expect(res.year.totalSavings).toBeCloseTo(80, 5); // 20 × 4
      expect(res.year.totalVolume).toBeCloseTo(320, 5); // 80 × 4
    });

    it("aralık awardedAt'e uygulanır — updatedAt ileri itilse bile eski kazandırma dışarıda kalır", async () => {
      const buyer = await scenario({
        bidStatus: "WON",
        bidCurrency: "TRY",
        snapshot: null,
        awardedAt: new Date("2020-06-01T00:00:00.000Z"), // yıl aralığının dışı
      });
      // updatedAt bugün (kayıt az önce yazıldı) — eski kod bunu İÇERİ alırdı.
      const res = await makeDashboard().satinalmaTasarruf({
        companyId: buyer.company.id,
      } as never);
      expect(res.year.totalVolume).toBe(0);
    });
  });
});
