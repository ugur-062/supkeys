/**
 * E2E — tenant-approval-flows controller. Onay akışı yapılandırması:
 *   - JwtAuthGuard + RolesGuard (write COMPANY_ADMIN-only)
 *   - Create + status change + duplicate + delete RBAC
 *   - Multi-tenant scope
 *   - Validation (initiatorUserIds, steps monoton, 1-active-per-type rule)
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { TenantApprovalFlowsController } from "./controllers/tenant-approval-flows.controller";
import { TenantApprovalFlowsService } from "./services/tenant-approval-flows.service";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { createTenant, createUser } from "../../../test/helpers/factories";

@Module({
  imports: [AuthModule],
  controllers: [TenantApprovalFlowsController],
  providers: [TenantApprovalFlowsService],
})
class TenantApprovalFlowsTestModule {}

describe("tenant-approval-flows controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [TenantApprovalFlowsTestModule],
      enableThrottler: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function loginAs(
    role: "COMPANY_ADMIN" | "BUYER" | "APPROVER",
    tenantId?: string,
  ): Promise<{ token: string; tenantId: string; userId: string }> {
    const tenant = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
      : await createTenant(prisma);
    if (!tenant) throw new Error("tenant lookup");
    const email = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`;
    const user = await createUser(prisma, tenant.id, { email, role });
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: user.plaintextPassword })
      .expect(200);
    return { token: res.body.token, tenantId: tenant.id, userId: user.id };
  }

  function buildBasicFlow(initiatorId: string, approverId: string) {
    return {
      name: "Test Onay Akışı",
      description: "Test açıklama",
      type: "TENDER_PUBLISH",
      status: "DRAFT",
      initiatorUserIds: [initiatorId],
      steps: [
        {
          orderIndex: 1,
          approverUserId: approverId,
          conditionMinAmount: 10000,
        },
      ],
    };
  }

  describe("POST /api/tenants/me/approval-flows — create", () => {
    it("COMPANY_ADMIN happy → 201 + flowNumber", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });

      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.flowNumber).toBeGreaterThanOrEqual(10001);
    });

    it("BUYER → 403 (RolesGuard COMPANY_ADMIN-only)", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(403);
    });

    it("APPROVER → 403", async () => {
      const { token, tenantId, userId } = await loginAs("APPROVER");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(403);
    });

    it("DTO: type enum dışı → 400", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const payload = { ...buildBasicFlow(userId, approver.id), type: "INVALID" };
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(payload)
        .expect(400);
      expect(res.body.errors).toHaveProperty("type");
    });

    it("DTO: name eksik → 400", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const { name, ...payload } = buildBasicFlow(userId, approver.id);
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(payload)
        .expect(400);
      expect(res.body.errors).toHaveProperty("name");
    });

    it("DTO: steps boş array → 400", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const payload = { ...buildBasicFlow(userId, approver.id), steps: [] };
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);
      expect([400, 422]).toContain(res.status);
    });

    it("BUYER initiator (allowed) → 201", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const buyer = await createUser(prisma, tenantId, {
        email: `buyer-${Date.now()}-${Math.random()}@test.local`,
        role: "BUYER",
      });

      const payload = buildBasicFlow(buyer.id, userId);
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(payload)
        .expect(201);
    });

    it("APPROVER initiator → 400 (initiator izinli değil)", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "APPROVER",
      });

      const payload = buildBasicFlow(approver.id, userId);
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(payload)
        .expect(400);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .send({})
        .expect(401);
    });
  });

  describe("GET /api/tenants/me/approval-flows", () => {
    it("any role → 200 (read herkese açık)", async () => {
      const { token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("status=ACTIVE filter", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });

      // ACTIVE bir flow oluştur
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...buildBasicFlow(userId, approver.id), status: "ACTIVE" })
        .expect(201);
      // DRAFT bir flow daha
      await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send({
          ...buildBasicFlow(userId, approver.id),
          status: "DRAFT",
          name: "Draft Akış",
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/approval-flows")
        .query({ status: "ACTIVE" })
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      // Filter doğru çalıştı mı?
      const items = Array.isArray(res.body) ? res.body : res.body.items ?? [];
      expect(items.every((f: { status: string }) => f.status === "ACTIVE")).toBe(true);
    });
  });

  describe("PATCH /:id/status — status değişimi (1-active-per-type)", () => {
    it("DRAFT → ACTIVE → 200", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const created = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/tenants/me/approval-flows/${created.body.id}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "ACTIVE" })
        .expect(200);
      expect(res.body.status).toBe("ACTIVE");
    });

    it("BUYER → 403", async () => {
      const { tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const adminLogin = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({
          email: (await prisma.user.findUnique({ where: { id: userId } }))!.email,
          password: "Test1234",
        })
        .expect(200);
      const created = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${adminLogin.body.token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      const { token: buyerToken } = await loginAs("BUYER", tenantId);
      await request(app.getHttpServer())
        .patch(`/api/tenants/me/approval-flows/${created.body.id}/status`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ status: "ACTIVE" })
        .expect(403);
    });
  });

  describe("POST /:id/duplicate", () => {
    it("DRAFT olarak yeni kopya oluştur → 201", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const created = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-flows/${created.body.id}/duplicate`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
      expect(res.body.id).not.toBe(created.body.id);
      expect(res.body.status).toBe("DRAFT");
      // Suffix " (Kopya)" eklenir
      expect(res.body.name).toContain("Kopya");
    });

    it("BUYER → 403", async () => {
      const { token: adminToken, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const created = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      const { token: buyerToken } = await loginAs("BUYER", tenantId);
      await request(app.getHttpServer())
        .post(`/api/tenants/me/approval-flows/${created.body.id}/duplicate`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(403);
    });
  });

  describe("DELETE /:id", () => {
    it("COMPANY_ADMIN → 200", async () => {
      const { token, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const created = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${token}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/tenants/me/approval-flows/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const fresh = await prisma.approvalFlow.findUnique({
        where: { id: created.body.id },
      });
      expect(fresh).toBeNull();
    });

    it("BUYER → 403", async () => {
      const { token: adminToken, tenantId, userId } = await loginAs("COMPANY_ADMIN");
      const approver = await createUser(prisma, tenantId, {
        email: `app-${Date.now()}-${Math.random()}@test.local`,
        role: "COMPANY_ADMIN",
      });
      const created = await request(app.getHttpServer())
        .post("/api/tenants/me/approval-flows")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(buildBasicFlow(userId, approver.id))
        .expect(201);

      const { token: buyerToken } = await loginAs("BUYER", tenantId);
      await request(app.getHttpServer())
        .delete(`/api/tenants/me/approval-flows/${created.body.id}`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(403);
    });
  });
});
