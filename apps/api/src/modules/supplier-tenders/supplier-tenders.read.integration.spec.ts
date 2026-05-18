/**
 * Supplier-tenders read paths — list + findOne + stats.
 *
 * Kapalı zarf güvenlik testleri:
 *   - Tedarikçi sadece davet edildiği tender'ları görür
 *   - DRAFT tender davetli olsa bile 404 (var olmayan gibi davranır)
 *   - Davet yoksa 404 (Forbidden değil — varlığını sızdırma)
 *   - Response'da `invitations` / `bids` / `bidStats` field'ları YOK
 *   - myBid sadece kendi bid'i
 *
 * List filter: ALL / ACTIVE / PAST + search + sort + pagination
 */
import { TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { SupplierTendersService } from "./services/supplier-tenders.service";
import { SupplierTenderFilter } from "./dto/list-tenders.dto";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import {
  createTenant,
  createUser,
  createSupplier,
  createSupplierUser,
  createTender,
  createBid,
  inviteSupplierToTender,
} from "../../../test/helpers/factories";

describe("SupplierTendersService — list + findOne (kapalı zarf)", () => {
  let moduleRef: TestingModule;
  let service: SupplierTendersService;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        SupplierTendersService,
        { provide: ExchangeRateService, useValue: { takeSnapshot: jest.fn() } },
      ],
    });
    service = moduleRef.get(SupplierTendersService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe("list — kapalı zarf + filter", () => {
    async function seedTenders() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);

      const openTender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      const awardedTender = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      const draftTender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      // Başka bir tedarikçinin tender'ı — kapalı zarf testi için
      const otherSupplier = await createSupplier(prisma);
      const otherTender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });

      // Davetler — sadece bu supplier 2 tender'a davetli
      await inviteSupplierToTender(prisma, openTender.id, supplier.id);
      await inviteSupplierToTender(prisma, awardedTender.id, supplier.id);
      // draftTender'a da davetli ama DRAFT olduğu için görmemeli
      await inviteSupplierToTender(prisma, draftTender.id, supplier.id);
      // otherTender'a başka tedarikçi davetli
      await inviteSupplierToTender(prisma, otherTender.id, otherSupplier.id);

      return { tenant, supplier, supplierUser, openTender, awardedTender, draftTender, otherTender };
    }

    it("filter=ALL → sadece davetli + visible status'lar (DRAFT YOK)", async () => {
      const { supplier, openTender, awardedTender, draftTender } = await seedTenders();

      const result = await service.list(supplier.id, {
        filter: SupplierTenderFilter.ALL,
      });

      const ids = result.items.map((t) => t.id);
      expect(ids).toContain(openTender.id);
      expect(ids).toContain(awardedTender.id);
      expect(ids).not.toContain(draftTender.id);
    });

    it("filter=ACTIVE → OPEN_FOR_BIDS + IN_AWARD", async () => {
      const { supplier, openTender, awardedTender } = await seedTenders();
      const result = await service.list(supplier.id, {
        filter: SupplierTenderFilter.ACTIVE,
      });
      const ids = result.items.map((t) => t.id);
      expect(ids).toContain(openTender.id);
      expect(ids).not.toContain(awardedTender.id);
    });

    it("filter=PAST → AWARDED/CANCELLED/CLOSED_NO_AWARD", async () => {
      const { supplier, openTender, awardedTender } = await seedTenders();
      const result = await service.list(supplier.id, {
        filter: SupplierTenderFilter.PAST,
      });
      const ids = result.items.map((t) => t.id);
      expect(ids).toContain(awardedTender.id);
      expect(ids).not.toContain(openTender.id);
    });

    it("davet edilmediği tender görünmez (kapalı zarf — başka supplier'ın tender'ı)", async () => {
      const { supplier, otherTender } = await seedTenders();
      const result = await service.list(supplier.id, {});
      const ids = result.items.map((t) => t.id);
      expect(ids).not.toContain(otherTender.id);
    });

    it("search=tender title → eşleşen kayıt", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tenderUnique = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      // Title'ı bilinen değere update et
      await prisma.tender.update({
        where: { id: tenderUnique.id },
        data: { title: "Özel Konteyner Alımı" },
      });
      await inviteSupplierToTender(prisma, tenderUnique.id, supplier.id);

      const result = await service.list(supplier.id, {
        search: "Konteyner",
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.title).toBe("Özel Konteyner Alımı");
    });

    it("sort=bidsCloseAt:asc → yakın biten önce", async () => {
      const { supplier } = await seedTenders();
      const result = await service.list(supplier.id, {
        filter: SupplierTenderFilter.ALL,
        sort: "bidsCloseAt:asc",
      });
      const dates = result.items.map((t) => new Date(t.bidsCloseAt).getTime());
      const sorted = [...dates].sort((a, b) => a - b);
      expect(dates).toEqual(sorted);
    });

    it("pagination: pageSize=1 → 1 item + total artıyor", async () => {
      const { supplier } = await seedTenders();
      const result = await service.list(supplier.id, {
        filter: SupplierTenderFilter.ALL,
        page: 1,
        pageSize: 1,
      });
      expect(result.items.length).toBe(1);
      // Toplam 2 visible+davetli tender (open + awarded; draft hariç)
      expect(result.pagination.total).toBe(2);
    });

    it("hiç davet yoksa boş liste", async () => {
      const supplier = await createSupplier(prisma);
      const result = await service.list(supplier.id, {});
      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe("findOne — kapalı zarf", () => {
    async function seedFindOneCase() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      return { tenant, user, supplier, supplierUser, tender };
    }

    it("davetli supplier kendi tender'ını görür", async () => {
      const { supplier, tender } = await seedFindOneCase();
      const result = await service.findOne(supplier.id, tender.id);
      expect(result.id).toBe(tender.id);
      expect(result.tenant).toBeDefined();
    });

    it("response'ta `invitations`, `bids`, `bidStats` ASLA yok (kapalı zarf)", async () => {
      const { supplier, tender } = await seedFindOneCase();
      const result = await service.findOne(supplier.id, tender.id) as Record<string, unknown>;
      expect(result).not.toHaveProperty("invitations");
      expect(result).not.toHaveProperty("bids");
      expect(result).not.toHaveProperty("bidStats");
    });

    it("response.items'ta `targetUnitPrice` ASLA yok (kapalı zarf — alıcı hedef fiyatı)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
        // Hedef fiyat ile item — sızmamalı
        items: [
          {
            name: "Test kalem",
            quantity: 10,
            unit: "adet",
            targetUnitPrice: 999,
          },
        ],
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      const result = await service.findOne(supplier.id, tender.id);
      expect(result.items.length).toBeGreaterThan(0);
      for (const it of result.items) {
        expect(it).not.toHaveProperty("targetUnitPrice");
      }
    });

    it("myInvitation + myBid sadece tedarikçinin kendi kaydını içerir", async () => {
      const { supplier, supplierUser, tender } = await seedFindOneCase();

      // Bu supplier için bir DRAFT bid ekle
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
        totalAmount: 500,
      });

      // Başka bir tedarikçi de teklif vermiş olsun
      const otherSupplier = await createSupplier(prisma);
      const otherSupplierUser = await createSupplierUser(prisma, otherSupplier.id);
      await inviteSupplierToTender(prisma, tender.id, otherSupplier.id);
      await createBid(prisma, tender.id, otherSupplier.id, otherSupplierUser.id, {
        status: "SUBMITTED",
        totalAmount: 1000,
      });

      const result = await service.findOne(supplier.id, tender.id);

      // myBid var ve totalAmount=500 (kendi bid'i)
      expect(result.myBid).toBeDefined();
      expect(Number(result.myBid!.totalAmount)).toBe(500);
      expect(result.myBid!.status).toBe("DRAFT");

      // Başka tedarikçinin bid'i sızmadı
      const fullResponse = result as Record<string, unknown>;
      expect(fullResponse).not.toHaveProperty("bids");
    });

    it("davet edilmemiş supplier → 404 (existence sızdırma)", async () => {
      const { tender } = await seedFindOneCase();
      const intruder = await createSupplier(prisma);
      // ForbiddenException değil — existence'ı sızdırmamak için NotFound
      await expect(
        service.findOne(intruder.id, tender.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("DRAFT tender davetli olsa bile → 404", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const draftTender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      // Davetli ama DRAFT
      await inviteSupplierToTender(prisma, draftTender.id, supplier.id);

      await expect(
        service.findOne(supplier.id, draftTender.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("CANCELLED tender davetli supplier görür (PAST status visible)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "CANCELLED",
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      const result = await service.findOne(supplier.id, tender.id);
      expect(result.status).toBe("CANCELLED");
    });

    it("bilinmeyen tender → 404", async () => {
      const supplier = await createSupplier(prisma);
      await expect(service.findOne(supplier.id, "yok")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getMyBid — kapalı zarf", () => {
    it("kendi bid'i varsa döner", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      const bid = await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
        totalAmount: 750,
      });

      const result = await service.getMyBid(supplier.id, tender.id);
      expect(result?.id).toBe(bid.id);
      expect(Number(result?.totalAmount)).toBe(750);
    });

    it("davet edilmemiş supplier → 403", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      const intruder = await createSupplier(prisma);
      await expect(
        service.getMyBid(intruder.id, tender.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bid yok → null", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      const result = await service.getMyBid(supplier.id, tender.id);
      expect(result).toBeNull();
    });
  });

  describe("stats — kendi supplier scope", () => {
    it("agregasyon doğru: davetler + submitted + won + ongoing orders", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);

      // 1 aktif davet
      const t1 = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, t1.id, supplier.id);

      // 1 SUBMITTED bid
      const t2 = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, t2.id, supplier.id);
      await createBid(prisma, t2.id, supplier.id, supplierUser.id, {
        status: "SUBMITTED",
      });

      // 1 AWARDED_FULL
      const t3 = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      await inviteSupplierToTender(prisma, t3.id, supplier.id);
      await createBid(prisma, t3.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });

      const stats = await service.stats(supplier.id);
      expect(stats.activeInvitations).toBeGreaterThanOrEqual(1);
      expect(stats.submittedBids).toBe(1);
      expect(stats.wonTenders).toBe(1);
    });

    it("başka supplier'ın istatistikleri sızmaz", async () => {
      const supplier = await createSupplier(prisma);
      const stats = await service.stats(supplier.id);
      expect(stats).toEqual({
        activeInvitations: 0,
        submittedBids: 0,
        wonTenders: 0,
        ongoingOrders: 0,
      });
    });
  });
});
