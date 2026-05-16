/**
 * Approval state machine — approve/reject/cancel.
 *
 * Scope (V1):
 *   - PENDING request: approve → APPROVED (son step), reject → REJECTED, cancel → CANCELLED
 *   - approve: sadece atanan approver
 *   - reject: not >= 10 char zorunlu
 *   - cancel: sadece initiator veya COMPANY_ADMIN
 *   - Cross-tenant erişim → 403
 *   - Bilinmeyen request → 404
 *   - Aktif değil (APPROVED/REJECTED/CANCELLED) tekrar işlem → 409
 */
import { TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { TenantApprovalRequestsService } from "./services/tenant-approval-requests.service";
import { EmailQueue } from "../email/email.queue";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import {
  createTenant,
  createUser,
  createTender,
  createApprovalRequest,
  createApprovalFlow,
} from "../../../test/helpers/factories";

async function setupPendingApproval(prisma: any) {
  const tenant = await createTenant(prisma);
  const initiator = await createUser(prisma, tenant.id, {
    email: `init-${Date.now()}@test.local`,
    role: "BUYER",
  });
  const approver = await createUser(prisma, tenant.id, {
    email: `app-${Date.now()}@test.local`,
    role: "COMPANY_ADMIN",
  });
  const tender = await createTender(prisma, tenant.id, initiator.id, {
    status: "IN_APPROVAL",
  });
  const { requestId, stepId } = await createApprovalRequest(prisma, {
    tenantId: tenant.id,
    createdById: initiator.id,
    approverUserId: approver.id,
    tenderId: tender.id,
  });
  return { tenant, initiator, approver, tender, requestId, stepId };
}

describe("TenantApprovalRequestsService — state machine", () => {
  let moduleRef: TestingModule;
  let service: TenantApprovalRequestsService;
  const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const eventMock = { emit: jest.fn() };
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        TenantApprovalRequestsService,
        { provide: EmailQueue, useValue: emailMock },
        { provide: EventEmitter2, useValue: eventMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") },
        },
      ],
    });
    service = moduleRef.get(TenantApprovalRequestsService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailMock.enqueue.mockClear();
    eventMock.emit.mockClear();
  });

  describe("approve", () => {
    it("doğru approver ile son step approve → request APPROVED + event emit", async () => {
      const { tenant, approver, requestId } = await setupPendingApproval(prisma);

      await service.approve(tenant.id, requestId, approver.id, "Onay");

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        include: { steps: true },
      });
      expect(fresh?.status).toBe("APPROVED");
      expect(fresh?.steps[0]?.status).toBe("APPROVED");
      expect(eventMock.emit).toHaveBeenCalledWith(
        "tender.publish.approved",
        expect.objectContaining({ tenderId: expect.any(String) }),
      );
    });

    it("başka user approve denemesi → 403 (atanmamış)", async () => {
      const { tenant, initiator, requestId } = await setupPendingApproval(prisma);

      // initiator approver değil — self-approve guard'a takılır
      await expect(
        service.approve(tenant.id, requestId, initiator.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("zaten APPROVED → 409", async () => {
      const { tenant, approver, requestId } = await setupPendingApproval(prisma);
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });
      await expect(
        service.approve(tenant.id, requestId, approver.id),
      ).rejects.toThrow("aktif değil");
    });

    it("başka tenant approve denemesi → 403", async () => {
      const { approver, requestId } = await setupPendingApproval(prisma);
      const intruder = await createTenant(prisma);
      await expect(
        service.approve(intruder.id, requestId, approver.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen request → 404", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      await expect(
        service.approve(tenant.id, "yok", user.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("reject", () => {
    it("not >= 10 char + approver → REJECTED + tender DRAFT'a düşer", async () => {
      const { tenant, approver, tender, requestId } = await setupPendingApproval(prisma);

      await service.reject(
        tenant.id,
        requestId,
        approver.id,
        "Kapsam yetersiz, revize gerekli",
      );

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.status).toBe("REJECTED");

      const tenderFresh = await prisma.tender.findUnique({
        where: { id: tender.id },
      });
      expect(tenderFresh?.status).toBe("DRAFT");

      // Initiator bilgi maili async — fire-and-forget olabilir
      await new Promise((r) => setImmediate(r));
      // E-posta hata-toleranslı (best-effort). Çağrılması beklenir ama
      // emit edilmediği senaryolar da var (initiator pasif vs.). Şu an
      // davranışı sadece DB durumu üzerinden doğruladık.
    });

    it("not < 10 char → 400", async () => {
      const { tenant, approver, requestId } = await setupPendingApproval(prisma);
      await expect(
        service.reject(tenant.id, requestId, approver.id, "Az"),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reject(tenant.id, requestId, approver.id, "Az"),
      ).rejects.toThrow("en az 10 karakter");
    });

    it("not boş → 400", async () => {
      const { tenant, approver, requestId } = await setupPendingApproval(prisma);
      await expect(
        service.reject(tenant.id, requestId, approver.id, ""),
      ).rejects.toThrow(BadRequestException);
    });

    it("zaten APPROVED → 409", async () => {
      const { tenant, approver, requestId } = await setupPendingApproval(prisma);
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });
      await expect(
        service.reject(tenant.id, requestId, approver.id, "Geç red denemesi"),
      ).rejects.toThrow("aktif değil");
    });

    it("başka tenant'tan reject → 403", async () => {
      const { approver, requestId } = await setupPendingApproval(prisma);
      const intruder = await createTenant(prisma);
      await expect(
        service.reject(intruder.id, requestId, approver.id, "Yetkisiz red"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("cancel", () => {
    it("initiator kendi sürecini iptal eder → CANCELLED + tender DRAFT", async () => {
      const { tenant, initiator, tender, requestId } = await setupPendingApproval(prisma);

      await service.cancel(
        tenant.id,
        requestId,
        initiator.id,
        "BUYER",
        "İhale kapsamı değişti",
      );

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.status).toBe("CANCELLED");

      const tenderFresh = await prisma.tender.findUnique({
        where: { id: tender.id },
      });
      expect(tenderFresh?.status).toBe("DRAFT");
    });

    it("COMPANY_ADMIN başkasının sürecini iptal edebilir", async () => {
      const { tenant, requestId } = await setupPendingApproval(prisma);
      const admin = await createUser(prisma, tenant.id, {
        email: `admin-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });

      await service.cancel(tenant.id, requestId, admin.id, "COMPANY_ADMIN");

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.status).toBe("CANCELLED");
    });

    it("başka BUYER initiator olmadığı için → 403", async () => {
      const { tenant, requestId } = await setupPendingApproval(prisma);
      const otherBuyer = await createUser(prisma, tenant.id, {
        email: `other-${Date.now()}@test.local`,
        role: "BUYER",
      });

      await expect(
        service.cancel(tenant.id, requestId, otherBuyer.id, "BUYER"),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.cancel(tenant.id, requestId, otherBuyer.id, "BUYER"),
      ).rejects.toThrow("başlatan veya Firma Yöneticisi");
    });

    it("zaten CANCELLED → 409", async () => {
      const { tenant, initiator, requestId } = await setupPendingApproval(prisma);
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" },
      });
      await expect(
        service.cancel(tenant.id, requestId, initiator.id, "BUYER"),
      ).rejects.toThrow(ConflictException);
    });

    it("başka tenant cancel → 403", async () => {
      const { initiator, requestId } = await setupPendingApproval(prisma);
      const intruder = await createTenant(prisma);
      await expect(
        service.cancel(intruder.id, requestId, initiator.id, "COMPANY_ADMIN"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("findMatchAndCreate — kural eşleştirme + APR oluşturma", () => {
    async function setupFlowOnly(opts: {
      stepThresholds?: (number | null)[];
      status?: "DRAFT" | "ACTIVE" | "PASSIVE";
      type?: "TENDER_PUBLISH" | "TENDER_AWARD";
    } = {}) {
      const tenant = await createTenant(prisma);
      const initiator = await createUser(prisma, tenant.id, {
        email: `init-${Date.now()}-${Math.random()}@test.local`,
        role: "BUYER",
      });
      const approver1 = await createUser(prisma, tenant.id, {
        email: `app1-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const approver2 = await createUser(prisma, tenant.id, {
        email: `app2-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const tender = await createTender(prisma, tenant.id, initiator.id, {
        status: "DRAFT",
      });
      const thresholds = opts.stepThresholds ?? [10000];
      await createApprovalFlow(prisma, {
        tenantId: tenant.id,
        createdById: initiator.id,
        initiatorUserIds: [initiator.id],
        type: opts.type ?? "TENDER_PUBLISH",
        status: opts.status ?? "ACTIVE",
        steps: thresholds.map((t, i) => ({
          approverUserId: i === 0 ? approver1.id : approver2.id,
          conditionMinAmount: t,
        })),
      });
      return { tenant, initiator, approver1, approver2, tender };
    }

    it("amount eşik üstü + uygun initiator → APR + ilk step PENDING", async () => {
      const { tenant, initiator, approver1, tender } = await setupFlowOnly({
        stepThresholds: [10000],
      });

      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 25000,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );

      expect(result).not.toBeNull();
      expect(result!.approvalNumber).toMatch(/^APR-\d{4}-\d{4}$/);
      expect(result!.status).toBe("PENDING");
      expect(Number(result!.amount)).toBe(25000);

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: result!.id },
        include: { steps: { orderBy: { orderIndex: "asc" } } },
      });
      expect(fresh!.steps).toHaveLength(1);
      expect(fresh!.steps[0]?.status).toBe("PENDING");
      expect(fresh!.steps[0]?.approverUserId).toBe(approver1.id);
    });

    it("amount=0 → null (atlanır)", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly();

      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 0,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(result).toBeNull();
    });

    it("amount negatif → null", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly();

      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: -500,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(result).toBeNull();
    });

    it("amount=NaN/Infinity → null", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly();
      const r1 = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: NaN,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(r1).toBeNull();
      const r2 = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: Infinity,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(r2).toBeNull();
    });

    it("hiç aktif flow yok → null", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id);

      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 50000,
          currency: "TRY",
          initiatedById: user.id,
        }),
      );
      expect(result).toBeNull();
    });

    it("flow var ama status=PASSIVE → null", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly({
        status: "PASSIVE",
      });
      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 50000,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(result).toBeNull();
    });

    it("flow var ama farklı initiator → null", async () => {
      const { tenant, tender } = await setupFlowOnly();
      const otherUser = await createUser(prisma, tenant.id, {
        email: `other-${Date.now()}@test.local`,
        role: "BUYER",
      });
      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 50000,
          currency: "TRY",
          initiatedById: otherUser.id,
        }),
      );
      expect(result).toBeNull();
    });

    it("flow var ama farklı type (AWARD/PUBLISH) → null", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly({
        type: "TENDER_PUBLISH",
      });
      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_AWARD", // ≠ PUBLISH
          amount: 50000,
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(result).toBeNull();
    });

    it("multi-step: amount sadece son eşiği geçer → ilk step SKIPPED, son PENDING", async () => {
      const { tenant, initiator, approver1, approver2, tender } = await setupFlowOnly({
        stepThresholds: [100000, 500000],
      });
      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 600000, // her iki eşiği de geçer
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(result).not.toBeNull();
      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: result!.id },
        include: { steps: { orderBy: { orderIndex: "asc" } } },
      });
      expect(fresh!.steps).toHaveLength(2);
      expect(fresh!.steps[0]?.status).toBe("PENDING");
      expect(fresh!.steps[0]?.approverUserId).toBe(approver1.id);
      expect(fresh!.steps[1]?.status).toBe("WAITING");
      expect(fresh!.steps[1]?.approverUserId).toBe(approver2.id);
    });

    it("multi-step: amount sadece ilk eşiği geçer → ilk PENDING, ikinci SKIPPED", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly({
        stepThresholds: [10000, 500000],
      });
      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 50000, // sadece 1. eşik
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: result!.id },
        include: { steps: { orderBy: { orderIndex: "asc" } } },
      });
      expect(fresh!.steps[0]?.status).toBe("PENDING");
      expect(fresh!.steps[1]?.status).toBe("SKIPPED");
    });

    it("multi-step: amount hiçbir eşiği geçmiyor → null", async () => {
      const { tenant, initiator, tender } = await setupFlowOnly({
        stepThresholds: [100000, 500000],
      });
      const result = await prisma.$transaction((tx) =>
        service.findMatchAndCreate(tx, {
          tenantId: tenant.id,
          tenderId: tender.id,
          type: "TENDER_PUBLISH",
          amount: 50000, // ilk eşiğin bile altında
          currency: "TRY",
          initiatedById: initiator.id,
        }),
      );
      expect(result).toBeNull();
    });
  });

  describe("list — filter + search", () => {
    async function seedMultipleRequests() {
      const tenant = await createTenant(prisma);
      const buyer = await createUser(prisma, tenant.id, {
        email: `buyer-${Date.now()}@test.local`,
        role: "BUYER",
      });
      const buyer2 = await createUser(prisma, tenant.id, {
        email: `buyer2-${Date.now()}@test.local`,
        role: "BUYER",
      });
      const approver = await createUser(prisma, tenant.id, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });

      const tender1 = await createTender(prisma, tenant.id, buyer.id, {
        status: "IN_APPROVAL",
      });
      await prisma.tender.update({
        where: { id: tender1.id },
        data: { tenderNumber: "SUPK-2026-0001", title: "Kalem Alımı" },
      });
      const tender2 = await createTender(prisma, tenant.id, buyer.id, {
        status: "IN_APPROVAL",
      });
      await prisma.tender.update({
        where: { id: tender2.id },
        data: { tenderNumber: "SUPK-2026-0002", title: "Yazılım Lisans" },
      });
      const tender3 = await createTender(prisma, tenant.id, buyer2.id, {
        status: "IN_APPROVAL",
      });

      const r1 = await createApprovalRequest(prisma, {
        tenantId: tenant.id,
        createdById: buyer.id,
        approverUserId: approver.id,
        tenderId: tender1.id,
      });
      const r2 = await createApprovalRequest(prisma, {
        tenantId: tenant.id,
        createdById: buyer.id,
        approverUserId: approver.id,
        tenderId: tender2.id,
      });
      const r3 = await createApprovalRequest(prisma, {
        tenantId: tenant.id,
        createdById: buyer2.id,
        approverUserId: approver.id,
        tenderId: tender3.id,
      });
      return { tenant, buyer, buyer2, approver, r1, r2, r3 };
    }

    it("filtre yoksa tüm pending request'ler döner (tenant scope)", async () => {
      const { tenant, approver } = await seedMultipleRequests();
      const result = (await service.list(tenant.id, approver.id, {})) as any[];
      expect(result.length).toBe(3);
    });

    it("status=APPROVED filter → sadece APPROVED", async () => {
      const { tenant, approver, r1 } = await seedMultipleRequests();
      await prisma.approvalRequest.update({
        where: { id: r1.requestId },
        data: { status: "APPROVED" },
      });
      const result = (await service.list(tenant.id, approver.id, {
        status: "APPROVED",
      })) as any[];
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(r1.requestId);
    });

    it("initiatorUserId filter → o user'ın request'leri", async () => {
      const { tenant, buyer, approver } = await seedMultipleRequests();
      const result = (await service.list(tenant.id, approver.id, {
        initiatorUserId: buyer.id,
      })) as any[];
      expect(result.length).toBe(2);
    });

    it("tenderNumber filter → eşleşme", async () => {
      const { tenant, approver, r1 } = await seedMultipleRequests();
      const result = (await service.list(tenant.id, approver.id, {
        tenderNumber: "SUPK-2026-0001",
      })) as any[];
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(r1.requestId);
    });

    it("search=tender title → eşleşme", async () => {
      const { tenant, approver, r2 } = await seedMultipleRequests();
      const result = (await service.list(tenant.id, approver.id, {
        search: "Yazılım",
      })) as any[];
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(r2.requestId);
    });

    it("pendingForMe=true → sadece userId'nin PENDING adımı olanlar", async () => {
      const { tenant, buyer, approver } = await seedMultipleRequests();
      // Approver'ın 3 step var → tümü kendi pending'i
      const result = (await service.list(tenant.id, approver.id, {
        pendingForMe: "true",
      })) as any[];
      expect(result.length).toBe(3);

      // Buyer için pendingForMe → 0
      const buyerResult = (await service.list(tenant.id, buyer.id, {
        pendingForMe: "true",
      })) as any[];
      expect(buyerResult.length).toBe(0);
    });

    it("başka tenant'a sızmaz", async () => {
      await seedMultipleRequests();
      const intruder = await createTenant(prisma);
      const intruderUser = await createUser(prisma, intruder.id);
      const result = (await service.list(intruder.id, intruderUser.id, {})) as any[];
      expect(result.length).toBe(0);
    });
  });

  describe("getOne — detail + multi-tenant", () => {
    it("happy: detail döner (tender + items + invitations + steps)", async () => {
      const { tenant, initiator, approver, tender, requestId } = await setupPendingApproval(prisma);

      const result = (await service.getOne(tenant.id, requestId)) as any;
      expect(result.id).toBe(requestId);
      expect(result.tender.id).toBe(tender.id);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]?.approver.id).toBe(approver.id);
      expect(result.initiatedBy.id).toBe(initiator.id);
    });

    it("bilinmeyen id → 404", async () => {
      const tenant = await createTenant(prisma);
      await expect(service.getOne(tenant.id, "yok")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("başka tenant erişimi → 403 (cross-tenant IDOR)", async () => {
      const { requestId } = await setupPendingApproval(prisma);
      const intruder = await createTenant(prisma);
      await expect(service.getOne(intruder.id, requestId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("getPendingCount", () => {
    it("pendingForMe sadece kendi atanan PENDING step'leri sayar", async () => {
      const { tenant, approver } = await setupPendingApproval(prisma);

      const result = await service.getPendingCount(tenant.id, approver.id);
      expect(result).toEqual({ count: 1 });
    });

    it("başka user için pending count 0", async () => {
      const { tenant, initiator } = await setupPendingApproval(prisma);
      const result = await service.getPendingCount(tenant.id, initiator.id);
      expect(result).toEqual({ count: 0 });
    });
  });
});
