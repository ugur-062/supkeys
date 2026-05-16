/**
 * Bid submit + withdraw — E.5 refactor sonrası state machine:
 *   DRAFT → SUBMITTED (version=1 kalır)
 *   LOST → SUBMITTED (version++ + eliminationReason temizlenir)
 *   SUBMITTED → 409 (revize KALDIRILDI — alıcıyla mesajlaş)
 *   WITHDRAWN/REJECTED/AWARDED_* → 409
 *
 * Davet edilmemiş supplier → 403 (kapalı zarf güvenliği).
 * Tender kapanışı geçmişse / OPEN_FOR_BIDS dışındaysa → 409.
 */
import { TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { SupplierTendersService } from "./services/supplier-tenders.service";
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

const exchangeRateMock = {
  // submitBid içinde takeSnapshot çağrılır; TRY için null doğru davranış
  takeSnapshot: jest.fn().mockResolvedValue(null),
};

async function setupOpenTender(prisma: any) {
  const tenant = await createTenant(prisma);
  const user = await createUser(prisma, tenant.id);
  const supplier = await createSupplier(prisma);
  const supplierUser = await createSupplierUser(prisma, supplier.id);
  const tender = await createTender(prisma, tenant.id, user.id, {
    status: "OPEN_FOR_BIDS",
    bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
  await inviteSupplierToTender(prisma, tender.id, supplier.id);
  return { tenant, user, supplier, supplierUser, tender };
}

describe("SupplierTendersService — bid submit/withdraw", () => {
  let moduleRef: TestingModule;
  let service: SupplierTendersService;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        SupplierTendersService,
        { provide: ExchangeRateService, useValue: exchangeRateMock },
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
    exchangeRateMock.takeSnapshot.mockClear();
  });

  describe("submitBid — DRAFT → SUBMITTED", () => {
    it("happy path: DRAFT bid + items → SUBMITTED + submittedAt + version=1", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const tenderWithItems = await prisma.tender.findUnique({
        where: { id: tender.id },
        include: { items: true },
      });
      const firstItem = tenderWithItems!.items[0];

      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
        items: [{ tenderItemId: firstItem.id, unitPrice: 90 }],
      });

      const result = await service.submitBid(supplier.id, tender.id);

      expect(result.status).toBe("SUBMITTED");
      expect(result.submittedAt).toBeInstanceOf(Date);
      expect(result.version).toBe(1);
    });

    it("LOST bid'i tekrar submit → version 2 + elimination temizlenir", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const tenderWithItems = await prisma.tender.findUnique({
        where: { id: tender.id },
        include: { items: true },
      });
      const firstItem = tenderWithItems!.items[0];

      const bid = await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "LOST",
        version: 1,
        items: [{ tenderItemId: firstItem.id, unitPrice: 80 }],
      });
      await prisma.bid.update({
        where: { id: bid.id },
        data: {
          eliminationReason: "Fiyat hedef üstü",
          eliminatedAt: new Date(),
        },
      });

      const result = await service.submitBid(supplier.id, tender.id);

      expect(result.status).toBe("SUBMITTED");
      expect(result.version).toBe(2);

      // Service response shape eliminationReason'ı select'lemiyor olabilir;
      // davranışı DB'den doğrulayalım.
      const fresh = await prisma.bid.findUnique({ where: { id: bid.id } });
      expect(fresh?.eliminationReason).toBeNull();
      expect(fresh?.eliminatedAt).toBeNull();
    });
  });

  describe("submitBid — state machine 409", () => {
    it("SUBMITTED tekrar submit → 409 (revize kaldırıldı)", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const tenderWithItems = await prisma.tender.findUnique({
        where: { id: tender.id },
        include: { items: true },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: tenderWithItems!.items[0].id, unitPrice: 90 }],
      });

      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        "alıcıyla iletişime geçin",
      );
    });

    it("WITHDRAWN bid → 409", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const tenderWithItems = await prisma.tender.findUnique({
        where: { id: tender.id },
        include: { items: true },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "WITHDRAWN",
        items: [{ tenderItemId: tenderWithItems!.items[0].id, unitPrice: 90 }],
      });
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        ConflictException,
      );
    });

    it("AWARDED_FULL bid → 409", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const tenderWithItems = await prisma.tender.findUnique({
        where: { id: tender.id },
        include: { items: true },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
        items: [{ tenderItemId: tenderWithItems!.items[0].id, unitPrice: 90 }],
      });
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("submitBid — tender state checks", () => {
    it("tender OPEN_FOR_BIDS değilse → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
      });

      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        "teklife açık değil",
      );
    });

    it("kapanış tarihi geçmişse → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
        bidsCloseAt: new Date(Date.now() - 24 * 3600 * 1000),
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
      });

      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        "kapanış tarihi geçmiş",
      );
    });
  });

  describe("submitBid — kapalı zarf + IDOR koruması", () => {
    it("davet edilmemiş supplier submit → 403", async () => {
      const { tender } = await setupOpenTender(prisma);
      const intruder = await createSupplier(prisma);

      await expect(service.submitBid(intruder.id, tender.id)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.submitBid(intruder.id, tender.id)).rejects.toThrow(
        "davetli değilsiniz",
      );
    });

    it("bilinmeyen tender → 404", async () => {
      const supplier = await createSupplier(prisma);
      await expect(service.submitBid(supplier.id, "yok")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("davetli ama bid taslağı yok → 404", async () => {
      const { supplier, tender } = await setupOpenTender(prisma);
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        "Önce bir taslak",
      );
    });
  });

  describe("submitBid — validasyon", () => {
    it("bid item'ları boşsa → 400", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
      });
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        "en az 1 kaleme fiyat",
      );
    });

    it("requireAllItems=true + eksik item → 400", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
        items: [
          { quantity: 1, name: "A" },
          { quantity: 2, name: "B" },
        ],
      });
      // requireAllItems'ı update ile set et (factory'de yok)
      await prisma.tender.update({
        where: { id: tender.id },
        data: { requireAllItems: true },
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 50 }],
      });
      await expect(service.submitBid(supplier.id, tender.id)).rejects.toThrow(
        "tüm kalemlere teklif",
      );
    });
  });

  describe("saveOrUpdateBid — DRAFT create + update", () => {
    it("yeni DRAFT bid oluşturur (upsert create path)", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      const result = await service.saveOrUpdateBid(
        supplierUser.id,
        supplier.id,
        tender.id,
        {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
          notes: "İlk taslak",
        },
      );

      expect(result.status).toBe("DRAFT");
      expect(result.version).toBe(1);
      expect(Number(result.totalAmount)).toBe(900); // 90 * 10

      const fresh = await prisma.bid.findUnique({
        where: { id: result.id },
        include: { items: true },
      });
      expect(fresh?.items).toHaveLength(1);
      expect(Number(fresh?.items[0]?.unitPrice)).toBe(90);
      expect(fresh?.notes).toBe("İlk taslak");
    });

    it("mevcut DRAFT bid'i günceller (upsert update + items full-replace)", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      // İlk save
      await service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
        items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
      });
      // Update (farklı fiyat)
      const updated = await service.saveOrUpdateBid(
        supplierUser.id,
        supplier.id,
        tender.id,
        {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 85 }],
          notes: "İndirim yaptım",
        },
      );

      expect(Number(updated.totalAmount)).toBe(850);
      const fresh = await prisma.bid.findUnique({
        where: { id: updated.id },
        include: { items: true },
      });
      expect(fresh?.items).toHaveLength(1);
      expect(Number(fresh?.items[0]?.unitPrice)).toBe(85);
      expect(fresh?.notes).toBe("İndirim yaptım");
    });

    it("LOST bid'i edit edilebilir (E.5 — yeniden teklif öncesi)", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      // İlk DRAFT
      const first = await service.saveOrUpdateBid(
        supplierUser.id,
        supplier.id,
        tender.id,
        { items: [{ tenderItemId: items[0]!.id, unitPrice: 100 }] },
      );
      // LOST'a düşür (eleme simülasyonu)
      await prisma.bid.update({
        where: { id: first.id },
        data: { status: "LOST" },
      });
      // Yeniden düzenle
      const updated = await service.saveOrUpdateBid(
        supplierUser.id,
        supplier.id,
        tender.id,
        { items: [{ tenderItemId: items[0]!.id, unitPrice: 80 }] },
      );
      expect(updated.status).toBe("LOST"); // status submit'e kadar değişmez
      expect(Number(updated.totalAmount)).toBe(800);
    });

    it("SUBMITTED bid'i edit denemesi → 409", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 100 }],
      });
      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 80 }],
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 80 }],
        }),
      ).rejects.toThrow("alıcıyla iletişime geçin");
    });

    it("WITHDRAWN bid'i edit denemesi → 409", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "WITHDRAWN",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 100 }],
      });
      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 80 }],
        }),
      ).rejects.toThrow("Geri çekilmiş");
    });

    it("AWARDED_FULL bid'i edit denemesi → 409", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 100 }],
      });
      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 80 }],
        }),
      ).rejects.toThrow("sonuçlandı");
    });

    it("davet edilmemiş supplier save → 403 (kapalı zarf)", async () => {
      const { tender } = await setupOpenTender(prisma);
      const intruder = await createSupplier(prisma);
      const intruderUser = await createSupplierUser(prisma, intruder.id);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      await expect(
        service.saveOrUpdateBid(intruderUser.id, intruder.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 50 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("OPEN_FOR_BIDS olmayan tender → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 50 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("kapanış geçmiş → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
        bidsCloseAt: new Date(Date.now() - 1000),
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: items[0]!.id, unitPrice: 50 }],
        }),
      ).rejects.toThrow("kapanış");
    });

    it("yabancı tenderItemId → 400 'Geçersiz kalem'", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);

      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: "yabanci-item-id", unitPrice: 50 }],
        }),
      ).rejects.toThrow("Geçersiz kalem");
    });

    it("aynı tenderItemId 2 kez → 400 'Aynı kalem birden fazla'", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [
            { tenderItemId: items[0]!.id, unitPrice: 50 },
            { tenderItemId: items[0]!.id, unitPrice: 60 },
          ],
        }),
      ).rejects.toThrow("birden fazla");
    });

    it("customQuestion'lı item için cevap yoksa → 400", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      const item = await prisma.tenderItem.findFirst({
        where: { tenderId: tender.id },
      });
      // Item'a soru ekle
      await prisma.tenderItem.update({
        where: { id: item!.id },
        data: { customQuestion: "Garanti süresi nedir?" },
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, tender.id, {
          items: [{ tenderItemId: item!.id, unitPrice: 100 }],
        }),
      ).rejects.toThrow("soru cevabı zorunlu");
    });

    it("bilinmeyen tender → 404", async () => {
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      await expect(
        service.saveOrUpdateBid(supplierUser.id, supplier.id, "yok", {
          items: [{ tenderItemId: "a", unitPrice: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("withdrawBid", () => {
    it("SUBMITTED → WITHDRAWN", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      const tenderWithItems = await prisma.tender.findUnique({
        where: { id: tender.id },
        include: { items: true },
      });
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: tenderWithItems!.items[0].id, unitPrice: 90 }],
      });

      const result = await service.withdrawBid(supplier.id, tender.id);
      expect(result.status).toBe("WITHDRAWN");
      expect(result.withdrawnAt).toBeInstanceOf(Date);
    });

    it("DRAFT bid'i withdraw → 409 (geri çekilecek bir submit yok)", async () => {
      const { supplier, supplierUser, tender } = await setupOpenTender(prisma);
      await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "DRAFT",
      });

      await expect(service.withdrawBid(supplier.id, tender.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
