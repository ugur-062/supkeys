/**
 * E2E — tenant-orders controller. HTTP layer:
 *   - JwtAuthGuard + PermissionsGuard
 *   - RBAC: BUYER vs APPROVER vs COMPANY_ADMIN (order:complete/cancel)
 *   - List filter (status/search/sort), findOne 404/403, complete/cancel state machine
 *   - DTO validation (HTTP errors shape)
 */
import type { INestApplication, Type } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { TenantOrdersController } from "./controllers/tenant-orders.controller";
import { TenantOrdersService } from "./services/tenant-orders.service";
import { EmailQueue } from "../email/email.queue";
import { OrderPdfService } from "../order-pdf/order-pdf.service";
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
  createSupplierUser,
  createTender,
  createBid,
  createOrder,
} from "../../../test/helpers/factories";

// Tenant-orders'ı minimal mount eden test modülü — EmailQueue + OrderPdfService
// mock'la (BullMQ + Puppeteer test ortamında istemiyoruz).
const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
const orderPdfMock = {
  generateOrderPdf: jest.fn().mockResolvedValue({
    buffer: Buffer.from("pdf"),
    filename: "test.pdf",
  }),
};
const configMock = { get: jest.fn().mockReturnValue("http://localhost:3000") };

@Module({
  imports: [AuthModule],
  controllers: [TenantOrdersController],
  providers: [
    TenantOrdersService,
    { provide: EmailQueue, useValue: emailMock },
    { provide: OrderPdfService, useValue: orderPdfMock },
    { provide: ConfigService, useValue: configMock },
  ],
})
class TenantOrdersTestModule {}

describe("tenant-orders controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [TenantOrdersTestModule],
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
  ): Promise<{ token: string; tenantId: string; userId: string }> {
    const tenant = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
      : await createTenant(prisma);
    if (!tenant) throw new Error("tenant lookup fail");
    const user = await createUser(prisma, tenant.id, {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`,
      role,
    });
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: user.plaintextPassword })
      .expect(200);
    return { token: res.body.token, tenantId: tenant.id, userId: user.id };
  }

  async function seedOrder(
    tenantId: string,
    userId: string,
    status: any = "PENDING",
  ) {
    const supplier = await createSupplier(prisma);
    const sUser = await createSupplierUser(prisma, supplier.id);
    const tender = await createTender(prisma, tenantId, userId, {
      status: "AWARDED",
    });
    const bid = await createBid(prisma, tender.id, supplier.id, sUser.id, {
      status: "AWARDED_FULL",
    });
    return createOrder(
      prisma,
      { tenantId, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
      { status, totalAmount: 500 },
    );
  }

  describe("GET /api/tenants/me/orders — list + RBAC", () => {
    it("BUYER token → 200 + items", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      await seedOrder(tenantId, userId);

      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/orders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(1);
    });

    it("APPROVER token (order:view default'ta var) → 200", async () => {
      const { token, tenantId, userId } = await loginAs("APPROVER");
      await seedOrder(tenantId, userId);

      await request(app.getHttpServer())
        .get("/api/tenants/me/orders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/tenants/me/orders")
        .expect(401);
    });

    it("status=PENDING filter → sadece PENDING", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      await seedOrder(tenantId, userId, "PENDING");
      await seedOrder(tenantId, userId, "COMPLETED");

      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/orders")
        .query({ status: "PENDING" })
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].status).toBe("PENDING");
    });
  });

  describe("GET /api/tenants/me/orders/:id — IDOR + 404", () => {
    it("kendi siparişi → 200", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId);
      const res = await request(app.getHttpServer())
        .get(`/api/tenants/me/orders/${order.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.id).toBe(order.id);
    });

    it("bilinmeyen orderId → 404", async () => {
      const { token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get("/api/tenants/me/orders/yok")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("başka tenant'ın sipariş → 403 (IDOR koruması)", async () => {
      const { tenantId: t1, userId: u1 } = await loginAs("BUYER");
      const order = await seedOrder(t1, u1);

      const { token: intruderToken } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .get(`/api/tenants/me/orders/${order.id}`)
        .set("Authorization", `Bearer ${intruderToken}`)
        .expect(403);
    });
  });

  describe("POST /api/tenants/me/orders/:id/complete", () => {
    it("BUYER + IN_DELIVERY → 201", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "IN_DELIVERY");

      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/complete`)
        .set("Authorization", `Bearer ${token}`)
        .send({ completedNote: "Teslim alındı" })
        .expect(201);
      expect(res.body.status).toBe("COMPLETED");
    });

    it("APPROVER (order:complete yok) → 403", async () => {
      const { token: ownerToken, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "IN_DELIVERY");

      // Aynı tenant'tan APPROVER
      const approver = await createUser(prisma, tenantId, {
        email: `appr-${Date.now()}@test.local`,
        role: "APPROVER",
      });
      const loginRes = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: approver.email, password: approver.plaintextPassword })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/complete`)
        .set("Authorization", `Bearer ${loginRes.body.token}`)
        .send({})
        .expect(403);
      // ownerToken unused — sadece order create için
      void ownerToken;
    });

    it("PENDING state'ten complete → 409", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "PENDING");

      await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/complete`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(409);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .post("/api/tenants/me/orders/x/complete")
        .send({})
        .expect(401);
    });
  });

  describe("POST /api/tenants/me/orders/:id/cancel", () => {
    it("BUYER + PENDING + reason → 201", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "PENDING");

      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Tedarikçi süreyi geçirdi — iptal" })
        .expect(201);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("DTO validation: reason eksik → 400", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "PENDING");

      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
      expect(res.body.errors).toHaveProperty("reason");
    });

    it("DTO validation: reason çok kısa → 400", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "PENDING");

      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "kısa" })
        .expect(400);
      expect(res.body.errors).toHaveProperty("reason");
    });

    it("BUYER + ACCEPTED + reason → 201", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "ACCEPTED");

      const res = await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "İhtiyaç değişti, iptal ediyoruz" })
        .expect(201);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("COMPLETED state'ten cancel → 409", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "COMPLETED");

      await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Geç iptal denemesi (10+ char)" })
        .expect(409);
    });

    it("REJECTED state'ten cancel → 409", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      const order = await seedOrder(tenantId, userId, "REJECTED");

      await request(app.getHttpServer())
        .post(`/api/tenants/me/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Reddedildikten sonra iptal denemesi" })
        .expect(409);
    });
  });

  describe("GET /api/tenants/me/orders/stats", () => {
    it("BUYER → 200 + stats shape (accepted/rejected dahil)", async () => {
      const { token, tenantId, userId } = await loginAs("BUYER");
      await seedOrder(tenantId, userId, "PENDING");
      await seedOrder(tenantId, userId, "ACCEPTED");
      await seedOrder(tenantId, userId, "COMPLETED");
      await seedOrder(tenantId, userId, "REJECTED");

      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/orders/stats")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({
        total: 4,
        pending: 1,
        accepted: 1,
        inDelivery: 0,
        completed: 1,
        rejected: 1,
        cancelled: 0,
      });
    });
  });
});
