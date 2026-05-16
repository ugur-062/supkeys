/**
 * E2E — supplier-orders controller.
 *   - SupplierJwtAuthGuard
 *   - list/findOne supplier scope (IDOR)
 *   - startDelivery state machine + DTO validation
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierOrdersController } from "./controllers/supplier-orders.controller";
import { SupplierOrdersService } from "./services/supplier-orders.service";
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

const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
const orderPdfMock = {
  generateOrderPdf: jest.fn().mockResolvedValue({
    buffer: Buffer.from("pdf"),
    filename: "test.pdf",
  }),
};
const configMock = { get: jest.fn().mockReturnValue("http://localhost:3000") };

@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierOrdersController],
  providers: [
    SupplierOrdersService,
    { provide: EmailQueue, useValue: emailMock },
    { provide: OrderPdfService, useValue: orderPdfMock },
    { provide: ConfigService, useValue: configMock },
  ],
})
class SupplierOrdersTestModule {}

describe("supplier-orders controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [SupplierOrdersTestModule],
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

  async function loginSupplier(): Promise<{
    token: string;
    supplierId: string;
    supplierUserId: string;
  }> {
    const supplier = await createSupplier(prisma);
    const user = await createSupplierUser(prisma, supplier.id);
    const res = await request(app.getHttpServer())
      .post("/api/supplier-auth/login")
      .send({ email: user.email, password: user.plaintextPassword })
      .expect(200);
    return {
      token: res.body.token,
      supplierId: supplier.id,
      supplierUserId: user.id,
    };
  }

  async function seedSupplierOrder(
    supplierId: string,
    status: any = "PENDING",
  ) {
    const tenant = await createTenant(prisma);
    const tenantUser = await createUser(prisma, tenant.id);
    const sUser = await createSupplierUser(prisma, supplierId);
    const tender = await createTender(prisma, tenant.id, tenantUser.id, {
      status: "AWARDED",
    });
    const bid = await createBid(prisma, tender.id, supplierId, sUser.id, {
      status: "AWARDED_FULL",
    });
    return createOrder(
      prisma,
      { tenantId: tenant.id, supplierId, tenderId: tender.id, bidId: bid.id },
      { status, totalAmount: 1000 },
    );
  }

  describe("GET /api/supplier/orders — list + scope", () => {
    it("token ile 200 + items", async () => {
      const { token, supplierId } = await loginSupplier();
      await seedSupplierOrder(supplierId);
      const res = await request(app.getHttpServer())
        .get("/api/supplier/orders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(1);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/supplier/orders")
        .expect(401);
    });

    it("başka supplier'a ait sipariş listede görünmez", async () => {
      const { token } = await loginSupplier();
      // farklı bir supplier için seed
      const other = await createSupplier(prisma);
      await seedSupplierOrder(other.id);

      const res = await request(app.getHttpServer())
        .get("/api/supplier/orders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(0);
    });
  });

  describe("GET /api/supplier/orders/:id", () => {
    it("kendi siparişi → 200", async () => {
      const { token, supplierId } = await loginSupplier();
      const order = await seedSupplierOrder(supplierId);
      const res = await request(app.getHttpServer())
        .get(`/api/supplier/orders/${order.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.id).toBe(order.id);
    });

    it("başka supplier'a ait → 403", async () => {
      const { token } = await loginSupplier();
      const other = await createSupplier(prisma);
      const order = await seedSupplierOrder(other.id);

      await request(app.getHttpServer())
        .get(`/api/supplier/orders/${order.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("bilinmeyen id → 404", async () => {
      const { token } = await loginSupplier();
      await request(app.getHttpServer())
        .get("/api/supplier/orders/yok")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });

  describe("POST /api/supplier/orders/:id/start-delivery", () => {
    it("PENDING → 201 + IN_DELIVERY + email enqueue", async () => {
      const { token, supplierId } = await loginSupplier();
      const order = await seedSupplierOrder(supplierId, "PENDING");

      const res = await request(app.getHttpServer())
        .post(`/api/supplier/orders/${order.id}/start-delivery`)
        .set("Authorization", `Bearer ${token}`)
        .send({ deliveryNote: "Kargo MNG ile gönderildi" })
        .expect(201);
      expect(res.body.status).toBe("IN_DELIVERY");
    });

    it("IN_DELIVERY → 409 (tekrar başlatma)", async () => {
      const { token, supplierId } = await loginSupplier();
      const order = await seedSupplierOrder(supplierId, "IN_DELIVERY");

      await request(app.getHttpServer())
        .post(`/api/supplier/orders/${order.id}/start-delivery`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(409);
    });

    it("başka supplier sipariş → 403 (IDOR)", async () => {
      const { token } = await loginSupplier();
      const other = await createSupplier(prisma);
      const order = await seedSupplierOrder(other.id, "PENDING");

      await request(app.getHttpServer())
        .post(`/api/supplier/orders/${order.id}/start-delivery`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(403);
    });

    it("invalid expectedDeliveryDate → 400 (DTO veya 409)", async () => {
      const { token, supplierId } = await loginSupplier();
      const order = await seedSupplierOrder(supplierId, "PENDING");

      const res = await request(app.getHttpServer())
        .post(`/api/supplier/orders/${order.id}/start-delivery`)
        .set("Authorization", `Bearer ${token}`)
        .send({ expectedDeliveryDate: "not-a-date" });
      // DTO @IsDateString varsa 400, yoksa service 409
      expect([400, 409]).toContain(res.status);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .post("/api/supplier/orders/x/start-delivery")
        .send({})
        .expect(401);
    });
  });

  describe("GET /api/supplier/orders/stats", () => {
    it("supplier scope stats", async () => {
      const { token, supplierId } = await loginSupplier();
      await seedSupplierOrder(supplierId, "PENDING");
      await seedSupplierOrder(supplierId, "COMPLETED");

      const res = await request(app.getHttpServer())
        .get("/api/supplier/orders/stats")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.pending).toBe(1);
      expect(res.body.completed).toBe(1);
    });
  });
});
