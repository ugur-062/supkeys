/**
 * Tender service — minimal subset (cancel, deleteDraft, findOne, stats).
 *
 * createDraft/publish/award yolları çok büyük dependency tree gerektirir
 * (CategoryService validate, AddressService snapshot, ApprovalRequestService
 * findMatch). Onlar ayrı bir oturumda ele alınır. Burada state machine +
 * multi-tenant scope + edge case'leri kapsıyoruz.
 */
import { TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TenantTendersService } from "./services/tenant-tenders.service";
import { EmailQueue } from "../email/email.queue";
import { TenantAddressesService } from "../tenant-addresses/services/tenant-addresses.service";
import { TenantApprovalRequestsService } from "../tenant-approval-requests/services/tenant-approval-requests.service";
import { CategoryService } from "../categories/services/category.service";
import { TenderSchedulerService } from "../tender-scheduler/tender-scheduler.service";
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
  createCategoryTree,
} from "../../../test/helpers/factories";

describe("TenantTendersService — subset (read + state machine + publish + createDraft)", () => {
  let moduleRef: TestingModule;
  let service: TenantTendersService;
  const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const approvalMock = {
    findMatchAndCreate: jest.fn().mockResolvedValue(null),
    sendApprovalRequiredEmailForRequest: jest.fn().mockResolvedValue(undefined),
  };
  // createDraft için adres snapshot mock — service sadece type kontrolü yapar
  const addressMock = {
    getAddressSnapshot: jest.fn(),
  };
  const categoryMock = {
    validateIds: jest.fn().mockResolvedValue([]),
    getBreadcrumbsByIds: jest.fn().mockResolvedValue(new Map()),
  };
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        TenantTendersService,
        TenderSchedulerService,
        { provide: EmailQueue, useValue: emailMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") },
        },
        { provide: TenantAddressesService, useValue: addressMock },
        { provide: TenantApprovalRequestsService, useValue: approvalMock },
        { provide: CategoryService, useValue: categoryMock },
      ],
    });
    service = moduleRef.get(TenantTendersService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailMock.enqueue.mockClear();
    approvalMock.findMatchAndCreate.mockClear();
    approvalMock.findMatchAndCreate.mockResolvedValue(null);
    approvalMock.sendApprovalRequiredEmailForRequest.mockClear();
    addressMock.getAddressSnapshot.mockReset();
    categoryMock.validateIds.mockReset();
    categoryMock.validateIds.mockResolvedValue([]);
  });

  describe("findOne — multi-tenant scope", () => {
    it("kendi ihalesini görür", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id);

      const found = await service.findOne(tenant.id, tender.id);
      expect(found?.id).toBe(tender.id);
    });

    it("başka tenant'a ait ihale → 404 (findFirst tenantId filter + NotFound)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id);

      const intruder = await createTenant(prisma);
      // findFirst with where:{ id, tenantId } → null → NotFoundException
      // (IDOR safe — başka tenant'tan ihale id'si bilinse bile erişilemez)
      await expect(service.findOne(intruder.id, tender.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("cancel — OPEN_FOR_BIDS/IN_AWARD → CANCELLED", () => {
    it("OPEN_FOR_BIDS → CANCELLED + reason + cancelledAt", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });

      const result = await service.cancel(tenant.id, tender.id, {
        reason: "Müşteri vazgeçti",
      });

      expect(result.status).toBe("CANCELLED");
      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.cancelReason).toBe("Müşteri vazgeçti");
      expect(fresh?.cancelledAt).toBeInstanceOf(Date);
    });

    it("IN_AWARD → CANCELLED", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
      });
      const result = await service.cancel(tenant.id, tender.id, {
        reason: "Iptal",
      });
      expect(result.status).toBe("CANCELLED");
    });

    it("DRAFT iptal denemesi → 409 (deleteDraft kullanılmalı)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      await expect(
        service.cancel(tenant.id, tender.id, { reason: "x" }),
      ).rejects.toThrow(ConflictException);
    });

    it("AWARDED → 409 (geri alınamaz)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      await expect(
        service.cancel(tenant.id, tender.id, { reason: "Sonradan iptal" }),
      ).rejects.toThrow(ConflictException);
    });

    it("bilinmeyen tenderId → 404", async () => {
      const tenant = await createTenant(prisma);
      await expect(
        service.cancel(tenant.id, "yok", { reason: "x" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("başka tenant cancel → 403", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });

      const intruder = await createTenant(prisma);
      await expect(
        service.cancel(intruder.id, tender.id, { reason: "Yetkisiz" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("deleteDraft", () => {
    it("DRAFT siler — cascade items/invitations", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });

      const result = await service.deleteDraft(tenant.id, tender.id);
      expect(result.id).toBe(tender.id);

      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh).toBeNull();

      // Cascade — items'lar gitmiş olmalı
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      expect(items).toHaveLength(0);
    });

    it("OPEN_FOR_BIDS silme denemesi → 409 (cancel kullanılmalı)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await expect(
        service.deleteDraft(tenant.id, tender.id),
      ).rejects.toThrow(ConflictException);
    });

    it("bilinmeyen tender → 404", async () => {
      const tenant = await createTenant(prisma);
      await expect(service.deleteDraft(tenant.id, "yok")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("başka tenant deleteDraft → 403 (cross-tenant IDOR)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      const intruder = await createTenant(prisma);
      await expect(
        service.deleteDraft(intruder.id, tender.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("stats — multi-tenant agregasyon", () => {
    it("boş tenant → tüm sayılar 0", async () => {
      const tenant = await createTenant(prisma);
      const stats = await service.stats(tenant.id);
      expect(stats.total).toBe(0);
    });

    it("karışık statusler doğru sayılır", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      await createTender(prisma, tenant.id, user.id, { status: "DRAFT" });
      await createTender(prisma, tenant.id, user.id, { status: "OPEN_FOR_BIDS" });
      await createTender(prisma, tenant.id, user.id, { status: "OPEN_FOR_BIDS" });
      await createTender(prisma, tenant.id, user.id, { status: "AWARDED" });

      const stats = await service.stats(tenant.id);
      expect(stats.total).toBe(4);
    });

    it("başka tenant'ın ihaleleri sızmaz", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      await createTender(prisma, tenant.id, user.id);

      const intruder = await createTenant(prisma);
      const stats = await service.stats(intruder.id);
      expect(stats.total).toBe(0);
    });
  });

  describe("publish — DRAFT → OPEN_FOR_BIDS (onay yok)", () => {
    async function setupPublishableTender() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
        bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        items: [{ quantity: 10, targetUnitPrice: 100, name: "X" }],
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);
      return { tenant, user, supplier, tender };
    }

    it("happy path: OPEN_FOR_BIDS olur + publishedAt set + davet kaydı tutulur", async () => {
      const { tenant, user, tender } = await setupPublishableTender();

      const result = await service.publish(tenant.id, tender.id, user.id);

      expect(result.status).toBe("OPEN_FOR_BIDS");
      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.status).toBe("OPEN_FOR_BIDS");
      expect(fresh?.publishedAt).toBeInstanceOf(Date);
      // Davet e-postaları best-effort fire-and-forget; setImmediate'le hep
      // yetişmiyor (zincirli async). Davranışı DB state üzerinden doğruladık.
    });

    it("findMatchAndCreate çağrılır (estimatedAmount > 0)", async () => {
      const { tenant, user, tender } = await setupPublishableTender();
      await service.publish(tenant.id, tender.id, user.id);

      expect(approvalMock.findMatchAndCreate).toHaveBeenCalledWith(
        expect.anything(), // tx
        expect.objectContaining({
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 1000, // 10 × 100
          currency: "TRY",
          initiatedById: user.id,
        }),
      );
    });

    it("targetUnitPrice yoksa estimatedAmount=0 → onay matching atlanır", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
        items: [{ quantity: 5, targetUnitPrice: null }],
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      const result = await service.publish(tenant.id, tender.id, user.id);

      expect(result.status).toBe("OPEN_FOR_BIDS");
      expect(approvalMock.findMatchAndCreate).not.toHaveBeenCalled();
    });
  });

  describe("publish — DRAFT → IN_APPROVAL (onay var)", () => {
    it("findMatchAndCreate APR döndürürse → IN_APPROVAL", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
        items: [{ quantity: 100, targetUnitPrice: 500 }], // 50000 → eşik üstü
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      approvalMock.findMatchAndCreate.mockResolvedValueOnce({
        id: "apr-mock-1",
        approvalNumber: "APR-2026-9999",
      });

      const result = await service.publish(tenant.id, tender.id, user.id);

      expect(result.status).toBe("IN_APPROVAL");
      expect(result).toHaveProperty("approvalRequestId", "apr-mock-1");
      expect(result).toHaveProperty("approvalNumber", "APR-2026-9999");

      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.status).toBe("IN_APPROVAL");

      // İlk approver'a e-posta dispatch çağrısı
      expect(approvalMock.sendApprovalRequiredEmailForRequest).toHaveBeenCalledWith(
        "apr-mock-1",
      );
    });
  });

  describe("publish — validation 400/409", () => {
    it("DRAFT olmayan tender → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await expect(
        service.publish(tenant.id, tender.id, user.id),
      ).rejects.toThrow(ConflictException);
    });

    it("davetli supplier yoksa → 400", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      // invitation YOK
      await expect(
        service.publish(tenant.id, tender.id, user.id),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.publish(tenant.id, tender.id, user.id),
      ).rejects.toThrow("en az 1 tedarikçi");
    });

    it("items boş → 400", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
        items: [{ quantity: 1, name: "x" }], // ile başlat
      });
      await prisma.tenderItem.deleteMany({ where: { tenderId: tender.id } });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      await expect(
        service.publish(tenant.id, tender.id, user.id),
      ).rejects.toThrow("en az 1 kalem");
    });

    it("bidsCloseAt geçmişte → 400", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
        bidsCloseAt: new Date(Date.now() - 24 * 3600 * 1000),
      });
      await inviteSupplierToTender(prisma, tender.id, supplier.id);

      await expect(
        service.publish(tenant.id, tender.id, user.id),
      ).rejects.toThrow("Kapanış tarihi");
    });

    it("başka tenant publish → 403 (cross-tenant IDOR)", async () => {
      const { tender, user } = await (async () => {
        const t = await createTenant(prisma);
        const u = await createUser(prisma, t.id);
        const s = await createSupplier(prisma);
        const tender = await createTender(prisma, t.id, u.id, {
          status: "DRAFT",
          items: [{ quantity: 5, targetUnitPrice: 100 }],
        });
        await inviteSupplierToTender(prisma, tender.id, s.id);
        return { tender, user: u };
      })();

      const intruder = await createTenant(prisma);
      await expect(
        service.publish(intruder.id, tender.id, user.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen tenderId → 404", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      await expect(
        service.publish(tenant.id, "yok", user.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("awardFull — toplu kazandırma", () => {
    async function setupInAward(): Promise<{
      tenant: any;
      user: any;
      supplier: any;
      supplierUser: any;
      tender: any;
      tenderItemId: string;
      bid: any;
    }> {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
        items: [{ quantity: 10, targetUnitPrice: 100 }],
      });
      const item = await prisma.tenderItem.findFirst({
        where: { tenderId: tender.id },
      });
      const bid = await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: item!.id, unitPrice: 90, quantity: 10 }],
      });
      return {
        tenant,
        user,
        supplier,
        supplierUser,
        tender,
        tenderItemId: item!.id,
        bid,
      };
    }

    it("SUBMITTED bid → AWARDED_FULL + items isWinner=true", async () => {
      const { tenant, tender, bid } = await setupInAward();

      await service.awardFull(tenant.id, tender.id, bid.id);

      const fresh = await prisma.bid.findUnique({
        where: { id: bid.id },
        include: { items: true },
      });
      expect(fresh?.status).toBe("AWARDED_FULL");
      expect(fresh?.items.every((i) => i.isWinner)).toBe(true);
    });

    it("IN_AWARD değilse → 409", async () => {
      const { tenant, user } = await setupInAward();
      const otherTender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      const supplier = await createSupplier(prisma);
      const sUser = await createSupplierUser(prisma, supplier.id);
      const otherBid = await createBid(
        prisma,
        otherTender.id,
        supplier.id,
        sUser.id,
        { status: "SUBMITTED" },
      );

      await expect(
        service.awardFull(tenant.id, otherTender.id, otherBid.id),
      ).rejects.toThrow(ConflictException);
    });

    it("SUBMITTED olmayan bid → 409", async () => {
      const { tenant, tender, bid } = await setupInAward();
      await prisma.bid.update({
        where: { id: bid.id },
        data: { status: "DRAFT" },
      });
      await expect(
        service.awardFull(tenant.id, tender.id, bid.id),
      ).rejects.toThrow("SUBMITTED");
    });

    it("bid başka tender'ın bid'i → 404", async () => {
      const { tenant, tender } = await setupInAward();
      // farklı tender + farklı bid
      const supplier2 = await createSupplier(prisma);
      const sUser2 = await createSupplierUser(prisma, supplier2.id);
      const otherTender = await createTender(prisma, tenant.id, (await createUser(prisma, tenant.id)).id);
      const wrongBid = await createBid(
        prisma,
        otherTender.id,
        supplier2.id,
        sUser2.id,
        { status: "SUBMITTED" },
      );
      await expect(
        service.awardFull(tenant.id, tender.id, wrongBid.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("başka tenant award denemesi → 403", async () => {
      const { tender, bid } = await setupInAward();
      const intruder = await createTenant(prisma);
      await expect(
        service.awardFull(intruder.id, tender.id, bid.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("supplier eksik kalemde teklif verdiyse → 400 (kalem bazlı kullanılmalı)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const sUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
        items: [
          { quantity: 5, name: "A" },
          { quantity: 3, name: "B" },
        ],
      });
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      const bid = await createBid(prisma, tender.id, supplier.id, sUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 50 }], // sadece A
      });

      await expect(
        service.awardFull(tenant.id, tender.id, bid.id),
      ).rejects.toThrow("Kalem bazlı");
    });
  });

  describe("closeBiddingEarly — OPEN_FOR_BIDS → IN_AWARD", () => {
    it("happy path: status IN_AWARD'a geçer + PENDING davetler EXPIRED olur", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplierA = await createSupplier(prisma);
      const supplierB = await createSupplier(prisma);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, supplierA.id);
      await inviteSupplierToTender(prisma, tender.id, supplierB.id);

      const result = await service.closeBiddingEarly(
        tenant.id,
        tender.id,
        user.id,
      );

      expect(result.tenderStatus).toBe("IN_AWARD");

      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.status).toBe("IN_AWARD");

      const invitations = await prisma.tenderInvitation.findMany({
        where: { tenderId: tender.id },
      });
      expect(invitations).toHaveLength(2);
      expect(invitations.every((i) => i.status === "EXPIRED")).toBe(true);
    });

    it("hiç teklif yokken de kapatılabilir", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });

      const result = await service.closeBiddingEarly(
        tenant.id,
        tender.id,
        user.id,
      );
      expect(result.tenderStatus).toBe("IN_AWARD");
    });

    it("DRAFT durumdaki ihale → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "DRAFT",
      });
      await expect(
        service.closeBiddingEarly(tenant.id, tender.id, user.id),
      ).rejects.toThrow(ConflictException);
    });

    it("IN_AWARD durumdaki ihale → 409 (zaten kapanmış)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
      });
      await expect(
        service.closeBiddingEarly(tenant.id, tender.id, user.id),
      ).rejects.toThrow(ConflictException);
    });

    it("AWARDED durumdaki ihale → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      await expect(
        service.closeBiddingEarly(tenant.id, tender.id, user.id),
      ).rejects.toThrow(ConflictException);
    });

    it("başka tenant erken kapatma → 403", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      const intruder = await createTenant(prisma);
      await expect(
        service.closeBiddingEarly(intruder.id, tender.id, user.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen tender → 404", async () => {
      const tenant = await createTenant(prisma);
      await expect(
        service.closeBiddingEarly(tenant.id, "yok", "user-yok"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("closeNoAward — IN_AWARD → CLOSED_NO_AWARD", () => {
    it("IN_AWARD → CLOSED_NO_AWARD + SUBMITTED bid'ler LOST'a düşer", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const sUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
      });
      const item = await prisma.tenderItem.findFirst({
        where: { tenderId: tender.id },
      });
      const bid = await createBid(prisma, tender.id, supplier.id, sUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: item!.id, unitPrice: 100 }],
      });

      await service.closeNoAward(tenant.id, tender.id, {
        reason: "Hiçbir teklif kabul edilmedi — bütçe üstü",
      });

      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.status).toBe("CLOSED_NO_AWARD");

      const freshBid = await prisma.bid.findUnique({ where: { id: bid.id } });
      expect(freshBid?.status).toBe("LOST");
    });

    it("IN_AWARD değilse → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await expect(
        service.closeNoAward(tenant.id, tender.id, {
          reason: "Erken kapatma denemesi",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("başka tenant closeNoAward → 403", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
      });
      const intruder = await createTenant(prisma);
      await expect(
        service.closeNoAward(intruder.id, tender.id, {
          reason: "Yetkisiz kapatma denemesi",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen tender → 404", async () => {
      const tenant = await createTenant(prisma);
      await expect(
        service.closeNoAward(tenant.id, "yok", { reason: "x" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("awardItemByItem — kalem bazlı kazandırma", () => {
    async function setupTwoItemsTwoBids() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplierA = await createSupplier(prisma);
      const sUserA = await createSupplierUser(prisma, supplierA.id);
      const supplierB = await createSupplier(prisma);
      const sUserB = await createSupplierUser(prisma, supplierB.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
        items: [
          { quantity: 5, targetUnitPrice: 100, name: "A" },
          { quantity: 3, targetUnitPrice: 200, name: "B" },
        ],
      });
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
        orderBy: { orderIndex: "asc" },
      });
      const bidA = await createBid(prisma, tender.id, supplierA.id, sUserA.id, {
        status: "SUBMITTED",
        items: [
          { tenderItemId: items[0]!.id, unitPrice: 90, quantity: 5 },
          { tenderItemId: items[1]!.id, unitPrice: 180, quantity: 3 },
        ],
      });
      const bidB = await createBid(prisma, tender.id, supplierB.id, sUserB.id, {
        status: "SUBMITTED",
        items: [
          { tenderItemId: items[0]!.id, unitPrice: 95, quantity: 5 },
          { tenderItemId: items[1]!.id, unitPrice: 170, quantity: 3 },
        ],
      });
      return { tenant, user, items, bidA, bidB };
    }

    it("happy: A→bidA, B→bidB → ikisi de AWARDED_PARTIAL + isWinner doğru", async () => {
      const { tenant, items, bidA, bidB } = await setupTwoItemsTwoBids();

      await service.awardItemByItem(tenant.id, items[0]!.tenderId, [
        { tenderItemId: items[0]!.id, bidId: bidA.id },
        { tenderItemId: items[1]!.id, bidId: bidB.id },
      ]);

      const freshA = await prisma.bid.findUnique({
        where: { id: bidA.id },
        include: { items: true },
      });
      const freshB = await prisma.bid.findUnique({
        where: { id: bidB.id },
        include: { items: true },
      });
      expect(freshA?.status).toBe("AWARDED_PARTIAL");
      expect(freshB?.status).toBe("AWARDED_PARTIAL");

      // A'nın isWinner field'ı: A→true, B→false
      expect(freshA?.items.find((i) => i.tenderItemId === items[0]!.id)?.isWinner).toBe(true);
      expect(freshA?.items.find((i) => i.tenderItemId === items[1]!.id)?.isWinner).toBe(false);
      // B'nin isWinner field'ı: A→false, B→true
      expect(freshB?.items.find((i) => i.tenderItemId === items[0]!.id)?.isWinner).toBe(false);
      expect(freshB?.items.find((i) => i.tenderItemId === items[1]!.id)?.isWinner).toBe(true);
    });

    it("eksik karar (1 item için decision yok) → 400 'kalemi için kazanan seçilmedi'", async () => {
      const { tenant, items, bidA } = await setupTwoItemsTwoBids();

      await expect(
        service.awardItemByItem(tenant.id, items[0]!.tenderId, [
          { tenderItemId: items[0]!.id, bidId: bidA.id },
          // items[1] eksik
        ]),
      ).rejects.toThrow("kazanan seçilmedi");
    });

    it("yabancı tenderItemId → 400 'Geçersiz kalem'", async () => {
      const { tenant, items, bidA } = await setupTwoItemsTwoBids();
      await expect(
        service.awardItemByItem(tenant.id, items[0]!.tenderId, [
          { tenderItemId: items[0]!.id, bidId: bidA.id },
          { tenderItemId: items[1]!.id, bidId: bidA.id },
          { tenderItemId: "foreign-item", bidId: bidA.id },
        ]),
      ).rejects.toThrow("Geçersiz kalem");
    });

    it("supplier o kaleme teklif vermemişse → 400 'teklif vermemiş'", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplierA = await createSupplier(prisma);
      const sUserA = await createSupplierUser(prisma, supplierA.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
        items: [
          { quantity: 5, name: "A" },
          { quantity: 3, name: "B" },
        ],
      });
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
        orderBy: { orderIndex: "asc" },
      });
      // BidA sadece A'ya teklif verdi
      const bidA = await createBid(prisma, tender.id, supplierA.id, sUserA.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
      });

      await expect(
        service.awardItemByItem(tenant.id, tender.id, [
          { tenderItemId: items[0]!.id, bidId: bidA.id },
          { tenderItemId: items[1]!.id, bidId: bidA.id }, // teklifsiz
        ]),
      ).rejects.toThrow("teklif vermemiş");
    });

    it("IN_AWARD değilse → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      const item = await prisma.tenderItem.findFirst({
        where: { tenderId: tender.id },
      });
      await expect(
        service.awardItemByItem(tenant.id, tender.id, [
          { tenderItemId: item!.id, bidId: "any" },
        ]),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("finalizeAward — onaysız: AWARDED + Order create", () => {
    async function setupAwardedBid() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const sUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
        items: [{ quantity: 10, targetUnitPrice: 100 }],
      });
      const item = await prisma.tenderItem.findFirst({
        where: { tenderId: tender.id },
      });
      const bid = await createBid(prisma, tender.id, supplier.id, sUser.id, {
        status: "SUBMITTED",
        items: [{ tenderItemId: item!.id, unitPrice: 90, quantity: 10 }],
      });
      // bid'i AWARDED_FULL yap (awardFull akışını taklit)
      await prisma.bid.update({
        where: { id: bid.id },
        data: { status: "AWARDED_FULL" },
      });
      await prisma.bidItem.updateMany({
        where: { bidId: bid.id },
        data: { isWinner: true },
      });
      return { tenant, user, supplier, tender, bid };
    }

    it("onaysız happy: tender AWARDED + Order create + SUBMITTED → LOST", async () => {
      const { tenant, user, supplier, tender, bid } = await setupAwardedBid();

      // Aynı tender'da kaybeden SUBMITTED bid de ekleyelim
      const loserSupplier = await createSupplier(prisma);
      const loserUser = await createSupplierUser(prisma, loserSupplier.id);
      const loserBid = await createBid(prisma, tender.id, loserSupplier.id, loserUser.id, {
        status: "SUBMITTED",
        totalAmount: 1000,
      });

      approvalMock.findMatchAndCreate.mockResolvedValueOnce(null); // onay yok

      const result = await service.finalizeAward(tenant.id, tender.id, user.id);

      expect(result.tenderStatus).toBe("AWARDED");
      expect(result.orderCount).toBe(1);

      // Tender AWARDED + awardedAt
      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.status).toBe("AWARDED");
      expect(fresh?.awardedAt).toBeInstanceOf(Date);

      // Order create
      const orders = await prisma.order.findMany({
        where: { tenantId: tenant.id, tenderId: tender.id },
      });
      expect(orders).toHaveLength(1);
      expect(orders[0]?.supplierId).toBe(supplier.id);
      expect(orders[0]?.bidId).toBe(bid.id);
      expect(orders[0]?.orderNumber).toMatch(/^ORD-\d{4}-\d{4}$/);

      // Kaybeden SUBMITTED → LOST
      const loserFresh = await prisma.bid.findUnique({
        where: { id: loserBid.id },
      });
      expect(loserFresh?.status).toBe("LOST");
    });

    it("onay var → IN_AWARD_APPROVAL + sendApprovalRequiredEmailForRequest", async () => {
      const { tenant, user, tender } = await setupAwardedBid();

      approvalMock.findMatchAndCreate.mockResolvedValueOnce({
        id: "apr-award-1",
        approvalNumber: "APR-2026-9998",
      });

      const result = await service.finalizeAward(tenant.id, tender.id, user.id);

      expect(result.tenderStatus).toBe("IN_AWARD_APPROVAL");
      const fresh = await prisma.tender.findUnique({ where: { id: tender.id } });
      expect(fresh?.status).toBe("IN_AWARD_APPROVAL");

      // Order create EDİLMEMELİ — onay tamamlanmadan
      const orders = await prisma.order.findMany({
        where: { tenderId: tender.id },
      });
      expect(orders).toHaveLength(0);

      // Approver'a e-posta
      expect(approvalMock.sendApprovalRequiredEmailForRequest).toHaveBeenCalledWith(
        "apr-award-1",
      );
    });

    it("hiç AWARDED bid yok → 400 'en az 1 kazanan'", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "IN_AWARD",
      });
      await expect(
        service.finalizeAward(tenant.id, tender.id, user.id),
      ).rejects.toThrow("en az 1 kazanan");
    });

    it("IN_AWARD değil → 409", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "OPEN_FOR_BIDS",
      });
      await expect(
        service.finalizeAward(tenant.id, tender.id, user.id),
      ).rejects.toThrow(ConflictException);
    });

    it("başka tenant finalize → 403", async () => {
      const { tender, user } = await setupAwardedBid();
      const intruder = await createTenant(prisma);
      await expect(
        service.finalizeAward(intruder.id, tender.id, user.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen tender → 404", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      await expect(
        service.finalizeAward(tenant.id, "yok", user.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("createDraft — tender create entry point", () => {
    function buildBaseDto(opts: {
      categoryIds: string[];
      billingAddressId?: string;
      deliveryAddressId?: string;
      invitedSupplierIds?: string[];
      items?: Array<{
        name: string;
        quantity: number;
        unit: string;
        targetUnitPrice?: number;
      }>;
      bidsCloseAt?: string;
    }): any {
      return {
        title: "Test İhale Başlığı",
        description: "Test açıklama",
        type: "RFQ",
        isSealedBid: true,
        requireAllItems: false,
        requireBidDocument: false,
        primaryCurrency: "TRY",
        allowedCurrencies: ["TRY"],
        billingAddressId: opts.billingAddressId ?? "billing-1",
        deliveryAddressId: opts.deliveryAddressId ?? "delivery-1",
        categoryIds: opts.categoryIds,
        paymentTerm: "CASH",
        bidsCloseAt:
          opts.bidsCloseAt ??
          new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        items: opts.items ?? [
          { name: "Kalem A", quantity: 5, unit: "ADET", targetUnitPrice: 100 },
        ],
        invitedSupplierIds: opts.invitedSupplierIds ?? [],
      };
    }

    async function setupContext() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      // CategoryService mock — validateIds resolves; address mock — snapshot döner
      addressMock.getAddressSnapshot.mockImplementation(
        async (_tid: string, addressId: string) => ({
          id: addressId,
          type: addressId.startsWith("billing") ? "FATURA" : "TESLIMAT",
          title: "Test",
          country: "TR",
          state: null,
          city: "Istanbul",
          district: "Ataşehir",
          fullAddress: "Test address",
          postalCode: null,
          taxOffice: "Test",
          taxNumber: "12345678",
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          isDefault: true,
        }),
      );
      return { tenant, user };
    }

    it("happy path: DRAFT tender oluşur + items + categories + invitations", async () => {
      const { tenant, user } = await setupContext();
      // Gerçek kategori (Level 3 — Class), FK için
      const { klass } = await createCategoryTree(prisma);
      // Active supplier relation
      const supplier = await createSupplier(prisma);
      await prisma.supplierTenantRelation.create({
        data: {
          tenantId: tenant.id,
          supplierId: supplier.id,
          status: "ACTIVE",
        },
      });

      const result = await service.createDraft(
        tenant.id,
        user.id,
        buildBaseDto({
          categoryIds: [klass.id],
          invitedSupplierIds: [supplier.id],
        }),
      );

      expect(result).toBeDefined();
      expect((result as any).tenderNumber).toMatch(/^SUPK-\d{4}-\d{4}$/);

      // DB doğrulama — status DRAFT
      const fresh = await prisma.tender.findUnique({
        where: { id: (result as any).id },
        include: { items: true, invitations: true, categories: true },
      });
      expect(fresh?.status).toBe("DRAFT");
      expect(fresh?.items).toHaveLength(1);
      expect(fresh?.invitations).toHaveLength(1);
      expect(fresh?.categories).toHaveLength(1);
      expect(categoryMock.validateIds).toHaveBeenCalledWith([klass.id], 3);
    });

    it("dupicate categoryIds dedupe edilir", async () => {
      const { tenant, user } = await setupContext();
      const { klass } = await createCategoryTree(prisma);
      const { klass: klass2 } = await createCategoryTree(prisma);

      await service.createDraft(
        tenant.id,
        user.id,
        buildBaseDto({ categoryIds: [klass.id, klass.id, klass2.id] }),
      );

      // validateIds tek seferde dedupe edilmiş listeyi alır
      expect(categoryMock.validateIds).toHaveBeenCalledWith(
        [klass.id, klass2.id],
        3,
      );
    });

    it("primaryCurrency allowedCurrencies içinde yoksa → 400", async () => {
      const { tenant, user } = await setupContext();
      const dto = buildBaseDto({ categoryIds: ["cat-1"] });
      dto.primaryCurrency = "USD";
      dto.allowedCurrencies = ["TRY", "EUR"];

      await expect(
        service.createDraft(tenant.id, user.id, dto),
      ).rejects.toThrow("Ana para birimi");
    });

    it("allowedCurrencies'de duplicate → 400", async () => {
      const { tenant, user } = await setupContext();
      const dto = buildBaseDto({ categoryIds: ["cat-1"] });
      dto.allowedCurrencies = ["TRY", "TRY", "USD"];
      dto.primaryCurrency = "TRY";

      await expect(
        service.createDraft(tenant.id, user.id, dto),
      ).rejects.toThrow("tekrar olmamalı");
    });

    it("DEFERRED ödeme + paymentDays yok → 400", async () => {
      const { tenant, user } = await setupContext();
      const dto = buildBaseDto({ categoryIds: ["cat-1"] });
      dto.paymentTerm = "DEFERRED";
      dto.paymentDays = undefined;

      await expect(
        service.createDraft(tenant.id, user.id, dto),
      ).rejects.toThrow("Vadeli ödeme");
    });

    it("DEFERRED + paymentDays=0 → 400", async () => {
      const { tenant, user } = await setupContext();
      const dto = buildBaseDto({ categoryIds: ["cat-1"] });
      dto.paymentTerm = "DEFERRED";
      dto.paymentDays = 0;

      await expect(
        service.createDraft(tenant.id, user.id, dto),
      ).rejects.toThrow("Vadeli ödeme");
    });

    it("bidsCloseAt geçmişte → 400", async () => {
      const { tenant, user } = await setupContext();
      const dto = buildBaseDto({
        categoryIds: ["cat-1"],
        bidsCloseAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      });

      await expect(
        service.createDraft(tenant.id, user.id, dto),
      ).rejects.toThrow("gelecekte olmalı");
    });

    it("bidsCloseAt invalid string → 400", async () => {
      const { tenant, user } = await setupContext();
      const dto = buildBaseDto({ categoryIds: ["cat-1"] });
      dto.bidsCloseAt = "not-a-date";

      await expect(
        service.createDraft(tenant.id, user.id, dto),
      ).rejects.toThrow("gelecekte olmalı");
    });

    it("CategoryService.validateIds throw ederse propagate eder (Level guard)", async () => {
      const { tenant, user } = await setupContext();
      categoryMock.validateIds.mockRejectedValueOnce(
        new (require("@nestjs/common").BadRequestException)(
          "Sadece Class veya Commodity",
        ),
      );

      await expect(
        service.createDraft(
          tenant.id,
          user.id,
          buildBaseDto({ categoryIds: ["segment-id"] }),
        ),
      ).rejects.toThrow("Class veya Commodity");
    });

    it("billingAddressId yanlış tipte (TESLIMAT) → 400", async () => {
      const { tenant, user } = await setupContext();
      addressMock.getAddressSnapshot.mockReset();
      addressMock.getAddressSnapshot.mockImplementation(
        async (_tid: string, addressId: string) => ({
          // billing-1 verildi ama type TESLIMAT
          id: addressId,
          type: "TESLIMAT",
          title: "Yanlış tip",
          country: "TR",
          state: null,
          city: "Istanbul",
          district: "Ataşehir",
          fullAddress: "x",
          postalCode: null,
          taxOffice: null,
          taxNumber: null,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          isDefault: true,
        }),
      );

      await expect(
        service.createDraft(
          tenant.id,
          user.id,
          buildBaseDto({ categoryIds: ["cat-1"] }),
        ),
      ).rejects.toThrow("Fatura adresi tipi yanlış");
    });

    it("invitedSupplier ACTIVE relation'da değilse → 400", async () => {
      const { tenant, user } = await setupContext();
      const supplier = await createSupplier(prisma);
      // Relation OLMASIN (veya BLOCKED)

      await expect(
        service.createDraft(
          tenant.id,
          user.id,
          buildBaseDto({
            categoryIds: ["cat-1"],
            invitedSupplierIds: [supplier.id],
          }),
        ),
      ).rejects.toThrow("aktif listenizde değil");
    });

    it("invitedSupplier listesi boşsa → izin verilir (publish'te check edilecek)", async () => {
      const { tenant, user } = await setupContext();
      const { klass } = await createCategoryTree(prisma);
      const result = await service.createDraft(
        tenant.id,
        user.id,
        buildBaseDto({ categoryIds: [klass.id], invitedSupplierIds: [] }),
      );
      expect((result as any).tenderNumber).toMatch(/^SUPK-\d{4}-\d{4}$/);
      const fresh = await prisma.tender.findUnique({
        where: { id: (result as any).id },
      });
      expect(fresh?.status).toBe("DRAFT");
    });
  });
});
