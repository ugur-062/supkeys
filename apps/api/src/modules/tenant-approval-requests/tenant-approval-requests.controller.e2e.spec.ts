/**
 * E2E — tenant-approval-requests controller.
 *   - JwtAuthGuard + PermissionsGuard
 *   - RBAC: approval:view (list/get) vs approval:approve (approve/reject)
 *   - list filter + getOne 404/403 + approve/reject/cancel state machine
 *   - DTO validation (reject note >= 10 char)
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2, EventEmitterModule } from "@nestjs/event-emitter";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { TenantApprovalRequestsController } from "./controllers/tenant-approval-requests.controller";
import { TenantApprovalRequestsService } from "./services/tenant-approval-requests.service";
import { ApprovalReminderService } from "./services/approval-reminder.service";
import { EmailQueue } from "../email/email.queue";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import {
  createTenant,
  createUser,
  createTender,
  createApprovalRequest,
} from "../../../test/helpers/factories";

const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
const configMock = { get: jest.fn().mockReturnValue("http://localhost:3000") };

@Module({
  imports: [AuthModule, EventEmitterModule.forRoot()],
  controllers: [TenantApprovalRequestsController],
  providers: [
    TenantApprovalRequestsService,
    ApprovalReminderService,
    { provide: EmailQueue, useValue: emailMock },
    { provide: ConfigService, useValue: configMock },
  ],
})
class TenantApprovalRequestsTestModule {}

describe("tenant-approval-requests controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [TenantApprovalRequestsTestModule],
      enableThrottler: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailMock.enqueue.mockClear();
  });

  async function loginAs(
    role: "COMPANY_ADMIN" | "BUYER" | "APPROVER",
    tenantId?: string,
  ): Promise<{ token: string; tenantId: string; userId: string; email: string }> {
    const tenant = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
      : await createTenant(prisma);
    if (!tenant) throw new Error("tenant lookup fail");
    const email = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`;
    const user = await createUser(prisma, tenant.id, { email, role });
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: user.plaintextPassword })
      .expect(200);
    return { token: res.body.token, tenantId: tenant.id, userId: user.id, email };
  }

  async function seedPendingApproval(tenantId: string, initiatorId: string, approverId: string) {
    const tender = await createTender(prisma, tenantId, initiatorId, {
      status: "IN_APPROVAL",
    });
    const { requestId } = await createApprovalRequest(prisma, {
      tenantId,
      createdById: initiatorId,
      approverUserId: approverId,
      tenderId: tender.id,
    });
    return { tenderId: tender.id, requestId };
  }

  describe("GET /api/tenants/me/approval-requests — list + RBAC", () => {
    it("APPROVER (approval:view default) → 200", async () => {
      const { token, tenantId, userId } = await loginAs("APPROVER");
      await seedPendingApproval(tenantId, userId, userId);
      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/approval-requests")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("BUYER (approval:view yok) → 403", async () => {
      const { token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get("/api/tenants/me/approval-requests")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/tenants/me/approval-requests")
        .expect(401);
    });
  });

  describe("GET /api/tenants/me/approval-requests/pending-count", () => {
    it("approver kendi pending step'lerini sayar", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      await seedPendingApproval(tenantId, userId, userId);
      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/approval-requests/pending-count")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.count).toBe(1);
    });
  });

  describe("GET /api/tenants/me/approval-requests/:id", () => {
    it("getOne → detail döner", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const { requestId, tenderId } = await seedPendingApproval(
        tenantId,
        userId,
        userId,
      );
      const res = await request(app.getHttpServer())
        .get(`/api/tenants/me/approval-requests/${requestId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.id).toBe(requestId);
      expect(res.body.tender.id).toBe(tenderId);
    });

    it("bilinmeyen id → 404", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      await request(app.getHttpServer())
        .get("/api/tenants/me/approval-requests/yok")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("başka tenant approval → 403 (IDOR)", async () => {
      const { tenantId: t1, userId: u1 } = await loginAs("COMPANY_ADMIN");
      const { requestId } = await seedPendingApproval(t1, u1, u1);
      const { token: intruderToken } = await loginAs("COMPANY_ADMIN");
      await request(app.getHttpServer())
        .get(`/api/tenants/me/approval-requests/${requestId}`)
        .set("Authorization", `Bearer ${intruderToken}`)
        .expect(403);
    });
  });

  describe("POST /:id/approve — approval:approve permission", () => {
    it("APPROVER atanan step → 201 + DB'de status APPROVED (son step)", async () => {
      const { token, tenantId, userId } = await loginAs("APPROVER");
      const { requestId } = await seedPendingApproval(tenantId, userId, userId);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${token}`)
        .send({ note: "Onaylandı" })
        .expect(201);

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.status).toBe("APPROVED");
    });

    it("BUYER (approval:approve yok) → 403", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      // BUYER permission: COMPANY_ADMIN approver oluştur
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, userId, approver.id);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(403);
    });

    it("başka user'a atanan step (self-approve yok) → 403", async () => {
      const { tenantId, userId: initiatorId } = await loginAs("BUYER");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, initiatorId, approver.id);

      // Aynı tenant'tan farklı APPROVER (atanmamış)
      const otherApprover = await createUser(prisma, tenantId, {
        email: `app2-${Date.now()}@test.local`,
        role: "APPROVER",
      });
      const otherLogin = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: otherApprover.email, password: otherApprover.plaintextPassword })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${otherLogin.body.token}`)
        .send({})
        .expect(403);
    });
  });

  describe("POST /:id/reject — DTO + state", () => {
    it("happy: note >= 10 char + APPROVER → 201", async () => {
      const { token, tenantId, userId } = await loginAs("APPROVER");
      const { requestId } = await seedPendingApproval(tenantId, userId, userId);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/reject`)
        .set("Authorization", `Bearer ${token}`)
        .send({ note: "Kapsam yetersiz, revize gerekli" })
        .expect(201);

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.status).toBe("REJECTED");
    });

    it("note < 10 char → 400 (servis validation)", async () => {
      const { token, tenantId, userId } = await loginAs("APPROVER");
      const { requestId } = await seedPendingApproval(tenantId, userId, userId);
      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/reject`)
        .set("Authorization", `Bearer ${token}`)
        .send({ note: "Az" })
        .expect(400);
    });

    it("BUYER → 403", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, userId, approver.id);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/reject`)
        .set("Authorization", `Bearer ${token}`)
        .send({ note: "Yetkisiz reddetme denemesi (>10 char)" })
        .expect(403);
    });
  });

  describe("POST /:id/cancel — initiator only (approval:view permission gerek)", () => {
    it("BUYER (approval:view yok) → 403 RBAC", async () => {
      // BUYER default permission'unda approval:view yok — initiator olsa
      // bile cancel endpoint'ine erişemez. PermissionsGuard servis seviyesi
      // initiator check'ine ulaşmadan engeller.
      const { token, tenantId, userId } = await loginAs("BUYER");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, userId, approver.id);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "İhale kapsamı değişti" })
        .expect(403);
    });

    it("COMPANY_ADMIN initiator kendi sürecini iptal eder → 201", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, userId, approver.id);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "İhale kapsamı değişti" })
        .expect(201);

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.status).toBe("CANCELLED");
    });

    it("COMPANY_ADMIN başkasının iptal edebilir → 201", async () => {
      // Initiator BUYER, başka kullanıcı COMPANY_ADMIN
      const { tenantId, userId: initiatorId } = await loginAs("BUYER");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, initiatorId, approver.id);

      // Aynı tenant'tan farklı COMPANY_ADMIN
      const { token: adminToken } = await loginAs("COMPANY_ADMIN", tenantId);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/cancel`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Müdahale" })
        .expect(201);
    });

    it("APPROVER (initiator değil) → 403 servis seviyesi", async () => {
      // APPROVER'da approval:view default'unda var, RBAC geçer.
      // Servis: "initiator değilse + COMPANY_ADMIN değilse iptal edemezsin" → 403
      const { tenantId, userId: initiatorId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { requestId } = await seedPendingApproval(tenantId, initiatorId, approver.id);

      // Aynı tenant'tan farklı APPROVER (initiator değil + COMPANY_ADMIN değil)
      const otherApprover = await createUser(prisma, tenantId, {
        email: `app2-${Date.now()}@test.local`,
        role: "APPROVER",
      });
      const otherLogin = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({
          email: otherApprover.email,
          password: otherApprover.plaintextPassword,
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-requests/${requestId}/cancel`)
        .set("Authorization", `Bearer ${otherLogin.body.token}`)
        .send({ reason: "Yetkisiz iptal" })
        .expect(403);
    });
  });
});
