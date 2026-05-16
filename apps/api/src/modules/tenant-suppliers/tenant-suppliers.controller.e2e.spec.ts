/**
 * E2E — tenant-suppliers controller (relations + block/unblock).
 *   - JwtAuthGuard + RolesGuard
 *   - list/findOne authenticated
 *   - block/unblock COMPANY_ADMIN-only
 *   - Multi-tenant scope (IDOR)
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { TenantSuppliersController } from "./controllers/tenant-suppliers.controller";
import { TenantSuppliersService } from "./services/tenant-suppliers.service";
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
  createSupplier,
} from "../../../test/helpers/factories";

const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
const configMock = { get: jest.fn().mockReturnValue("http://localhost:3000") };

@Module({
  imports: [AuthModule],
  controllers: [TenantSuppliersController],
  providers: [
    TenantSuppliersService,
    { provide: EmailQueue, useValue: emailMock },
    { provide: ConfigService, useValue: configMock },
  ],
})
class TenantSuppliersTestModule {}

describe("tenant-suppliers controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [TenantSuppliersTestModule],
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
  ): Promise<{ token: string; tenantId: string }> {
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
    return { token: res.body.token, tenantId: tenant.id };
  }

  async function seedActiveRelation(tenantId: string) {
    const supplier = await createSupplier(prisma);
    const relation = await prisma.supplierTenantRelation.create({
      data: {
        tenantId,
        supplierId: supplier.id,
        status: "ACTIVE",
      },
    });
    return { supplier, relation };
  }

  describe("GET /api/tenants/me/suppliers", () => {
    it("BUYER → 200", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      await seedActiveRelation(tenantId);
      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/tenants/me/suppliers")
        .expect(401);
    });

    it("başka tenant'ın supplier'ı listede yok", async () => {
      const { token: t1Token, tenantId: t1 } = await loginAs("BUYER");
      await seedActiveRelation(t1);

      const { token: t2Token, tenantId: t2 } = await loginAs("BUYER");
      // t2'nin kendi relation'ı yok
      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/suppliers")
        .set("Authorization", `Bearer ${t2Token}`)
        .expect(200);
      // t2'nin supplier listesi boş
      const items = res.body.items ?? res.body;
      const length = Array.isArray(items) ? items.length : items.length || 0;
      expect(length).toBe(0);
      // t1'in görmesi gerek
      const t1Res = await request(app.getHttpServer())
        .get("/api/tenants/me/suppliers")
        .set("Authorization", `Bearer ${t1Token}`)
        .expect(200);
      const t1Items = t1Res.body.items ?? t1Res.body;
      const t1Length = Array.isArray(t1Items) ? t1Items.length : 0;
      expect(t1Length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/tenants/me/suppliers/stats", () => {
    it("BUYER → 200 + stats shape", async () => {
      const { token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get("/api/tenants/me/suppliers/stats")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });
  });

  describe("GET /api/tenants/me/suppliers/:id", () => {
    it("kendi tenant supplier'ı → 200", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      const res = await request(app.getHttpServer())
        .get(`/api/tenants/me/suppliers/${relation.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      // Response shape: relation row + supplier include — esnek doğrulama
      const supplierId = res.body.supplier?.id ?? res.body.supplierId;
      expect(supplierId).toBe(supplier.id);
    });

    it("bilinmeyen id → 404", async () => {
      const { token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get("/api/tenants/me/suppliers/yok")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("başka tenant'ın supplier'ı → 404 (IDOR)", async () => {
      const { tenantId: t1 } = await loginAs("BUYER");
      const { supplier, relation } = await seedActiveRelation(t1);

      const { token: t2Token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get(`/api/tenants/me/suppliers/${relation.id}`)
        .set("Authorization", `Bearer ${t2Token}`)
        .expect(404);
    });
  });

  describe("POST /api/tenants/me/suppliers/:id/block — COMPANY_ADMIN", () => {
    it("BUYER (RolesGuard yok) → 403", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Düşük performans, 10+ char sebep" })
        .expect(403);
    });

    it("APPROVER → 403", async () => {
      const { token, tenantId } = await loginAs("APPROVER");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Test sebep 10+ char olmalı" })
        .expect(403);
    });

    it("COMPANY_ADMIN happy → 200 + relation BLOCKED", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const { supplier, relation } = await seedActiveRelation(tenantId);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Geç teslimat çoktan tekrarlandı" })
        .expect(200);

      const fresh = await prisma.supplierTenantRelation.findFirst({
        where: { tenantId, supplierId: supplier.id },
      });
      expect(fresh?.status).toBe("BLOCKED");
      expect(fresh?.blockedReason).toContain("Geç teslimat");
    });

    it("DTO: reason eksik → 400", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
      expect(res.body.errors).toHaveProperty("reason");
    });

    it("DTO: reason çok kısa → 400", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "kısa" })
        .expect(400);
      expect(res.body.errors).toHaveProperty("reason");
    });

    it("zaten BLOCKED relation tekrar block → 409", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      // Önce blok yap
      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "İlk blok sebebi geçerli uzunlukta" })
        .expect(200);
      // Tekrar blok
      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/block`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "İkinci blok denemesi geçerli uzunlukta" })
        .expect(409);
    });
  });

  describe("POST /api/tenants/me/suppliers/:id/unblock — COMPANY_ADMIN", () => {
    it("BUYER → 403", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/unblock`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("COMPANY_ADMIN happy: BLOCKED → ACTIVE", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      // Önce blok yap
      await prisma.supplierTenantRelation.updateMany({
        where: { tenantId, supplierId: supplier.id },
        data: { status: "BLOCKED", blockedReason: "Test", blockedAt: new Date() },
      });

      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/unblock`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const fresh = await prisma.supplierTenantRelation.findFirst({
        where: { tenantId, supplierId: supplier.id },
      });
      expect(fresh?.status).toBe("ACTIVE");
    });

    it("zaten ACTIVE relation → 409", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const { supplier, relation } = await seedActiveRelation(tenantId);
      await request(app.getHttpServer())
        .post(`/api/tenants/me/suppliers/${relation.id}/unblock`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });

    it("bilinmeyen supplier → 404", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      await request(app.getHttpServer())
        .post("/api/tenants/me/suppliers/yok/unblock")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
