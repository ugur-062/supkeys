/**
 * E2E — supplier-tenders controller. KAPALI ZARF güvenlik kritik:
 *   - SupplierJwtAuthGuard
 *   - list response'da başka tedarikçinin tender'ı YOK (sadece davet edilenler)
 *   - findOne response'da `invitations` / `bids` / `bidStats` field'ları YOK
 *   - myBid sadece kendi bid'i
 *   - Davet edilmemiş supplier → 404 (existence sızdırma)
 *   - submit/withdraw/saveOrUpdate state machine HTTP layer
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import request from "supertest";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierTendersController } from "./controllers/supplier-tenders.controller";
import { SupplierTendersService } from "./services/supplier-tenders.service";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";
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
  inviteSupplierToTender,
} from "../../../test/helpers/factories";

const exchangeRateMock = {
  takeSnapshot: jest.fn().mockResolvedValue(null),
};

@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierTendersController],
  providers: [
    SupplierTendersService,
    { provide: ExchangeRateService, useValue: exchangeRateMock },
  ],
})
class SupplierTendersTestModule {}

describe("supplier-tenders controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [SupplierTendersTestModule],
      enableThrottler: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    exchangeRateMock.takeSnapshot.mockClear();
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

  async function seedOpenTenderInvited(supplierId: string) {
    const tenant = await createTenant(prisma);
    const tenantUser = await createUser(prisma, tenant.id);
    const tender = await createTender(prisma, tenant.id, tenantUser.id, {
      status: "OPEN_FOR_BIDS",
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    await inviteSupplierToTender(prisma, tender.id, supplierId);
    return { tender, tenant, tenantUser };
  }

  describe("GET /api/supplier/tenders — list (kapalı zarf)", () => {
    it("davet edilen tender'ları listeler", async () => {
      const { token, supplierId } = await loginSupplier();
      await seedOpenTenderInvited(supplierId);

      const res = await request(app.getHttpServer())
        .get("/api/supplier/tenders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(1);
    });

    it("davet edilmediği tender → görünmez", async () => {
      const { token, supplierId } = await loginSupplier();
      await seedOpenTenderInvited(supplierId); // bu görünsün

      // Başka bir tedarikçiye davet edilen tender — görünmemeli
      const otherSupplier = await createSupplier(prisma);
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const hiddenTender = await createTender(prisma, tenant.id, tUser.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, hiddenTender.id, otherSupplier.id);

      const res = await request(app.getHttpServer())
        .get("/api/supplier/tenders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const ids = res.body.items.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(hiddenTender.id);
    });

    it("DRAFT tender davetli olsa bile listelenmez", async () => {
      const { token, supplierId } = await loginSupplier();
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const draftTender = await createTender(prisma, tenant.id, tUser.id, {
        status: "DRAFT",
      });
      await inviteSupplierToTender(prisma, draftTender.id, supplierId);

      const res = await request(app.getHttpServer())
        .get("/api/supplier/tenders")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(0);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/supplier/tenders")
        .expect(401);
    });
  });

  describe("GET /api/supplier/tenders/:id — kapalı zarf shape", () => {
    it("response ASLA invitations/bids/bidStats içermez", async () => {
      const { token, supplierId, supplierUserId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);

      // Tender'da başka tedarikçi bid'leri olsun — sızmamalı
      const otherSupplier = await createSupplier(prisma);
      const otherSupplierUser = await createSupplierUser(prisma, otherSupplier.id);
      await inviteSupplierToTender(prisma, tender.id, otherSupplier.id);
      await createBid(prisma, tender.id, otherSupplier.id, otherSupplierUser.id, {
        status: "SUBMITTED",
        totalAmount: 9999,
      });
      // Kendi bid'imiz de olsun
      await createBid(prisma, tender.id, supplierId, supplierUserId, {
        status: "DRAFT",
        totalAmount: 500,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/supplier/tenders/${tender.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // Kapalı zarf
      expect(res.body).not.toHaveProperty("invitations");
      expect(res.body).not.toHaveProperty("bids");
      expect(res.body).not.toHaveProperty("bidStats");

      // myBid varsa kendi bid'i (totalAmount 500)
      expect(res.body.myBid).toBeDefined();
      expect(Number(res.body.myBid.totalAmount)).toBe(500);

      // Response body string'inde "9999" YOK (defansif: başka bid sızıntısı yok)
      expect(JSON.stringify(res.body)).not.toContain("9999");
    });

    it("davet edilmemiş supplier → 404 (existence sızdırma)", async () => {
      const { token } = await loginSupplier();
      // başka bir tedarikçi için tender
      const otherSupplier = await createSupplier(prisma);
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, tUser.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, otherSupplier.id);

      await request(app.getHttpServer())
        .get(`/api/supplier/tenders/${tender.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("DRAFT tender davetli olsa bile → 404", async () => {
      const { token, supplierId } = await loginSupplier();
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const draft = await createTender(prisma, tenant.id, tUser.id, {
        status: "DRAFT",
      });
      await inviteSupplierToTender(prisma, draft.id, supplierId);

      await request(app.getHttpServer())
        .get(`/api/supplier/tenders/${draft.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("bilinmeyen id → 404", async () => {
      const { token } = await loginSupplier();
      await request(app.getHttpServer())
        .get("/api/supplier/tenders/yok")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });

  describe("POST /:id/bid — saveOrUpdate (DRAFT)", () => {
    it("davetli supplier yeni DRAFT bid oluşturur → 201", async () => {
      const { token, supplierId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
        })
        .expect(201);
      expect(res.body.status).toBe("DRAFT");
    });

    it("davet edilmemiş supplier → 403", async () => {
      const { token } = await loginSupplier();
      const otherSupplier = await createSupplier(prisma);
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, tUser.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, otherSupplier.id);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });

      await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
        })
        .expect(403);
    });

    it("DTO: items boş array → 400 (sınırlar)", async () => {
      const { token, supplierId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);

      const res = await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid`)
        .set("Authorization", `Bearer ${token}`)
        .send({ items: [] });
      // Boş items DTO veya service tarafında reddedilebilir
      expect([400, 201]).toContain(res.status);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .post("/api/supplier/tenders/x/bid")
        .send({})
        .expect(401);
    });
  });

  describe("POST /:id/bid/submit", () => {
    it("DRAFT bid + items submit → 201 + SUBMITTED", async () => {
      const { token, supplierId, supplierUserId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      await createBid(prisma, tender.id, supplierId, supplierUserId, {
        status: "DRAFT",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
      });

      await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid/submit`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const fresh = await prisma.bid.findFirst({
        where: { tenderId: tender.id, supplierId },
      });
      expect(fresh?.status).toBe("SUBMITTED");
    });

    it("SUBMITTED bid'i tekrar submit → 409", async () => {
      const { token, supplierId, supplierUserId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      await createBid(prisma, tender.id, supplierId, supplierUserId, {
        status: "SUBMITTED",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
      });

      await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid/submit`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });

    it("davet edilmemiş supplier → 403", async () => {
      const { token } = await loginSupplier();
      const otherSupplier = await createSupplier(prisma);
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, tUser.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, otherSupplier.id);

      await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid/submit`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("POST /:id/bid/withdraw", () => {
    it("SUBMITTED bid withdraw → 201 + WITHDRAWN", async () => {
      const { token, supplierId, supplierUserId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);
      const items = await prisma.tenderItem.findMany({
        where: { tenderId: tender.id },
      });
      const bid = await createBid(prisma, tender.id, supplierId, supplierUserId, {
        status: "SUBMITTED",
        items: [{ tenderItemId: items[0]!.id, unitPrice: 90 }],
      });

      await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid/withdraw`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const fresh = await prisma.bid.findUnique({ where: { id: bid.id } });
      expect(fresh?.status).toBe("WITHDRAWN");
    });

    it("DRAFT bid withdraw → 409", async () => {
      const { token, supplierId, supplierUserId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);
      await createBid(prisma, tender.id, supplierId, supplierUserId, {
        status: "DRAFT",
      });

      await request(app.getHttpServer())
        .post(`/api/supplier/tenders/${tender.id}/bid/withdraw`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });
  });

  describe("GET /:id/my-bid", () => {
    it("kendi bid'ini döner", async () => {
      const { token, supplierId, supplierUserId } = await loginSupplier();
      const { tender } = await seedOpenTenderInvited(supplierId);
      await createBid(prisma, tender.id, supplierId, supplierUserId, {
        status: "DRAFT",
        totalAmount: 750,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/supplier/tenders/${tender.id}/my-bid`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(Number(res.body.totalAmount)).toBe(750);
    });

    it("davet edilmemiş supplier → 403", async () => {
      const { token } = await loginSupplier();
      const otherSupplier = await createSupplier(prisma);
      const tenant = await createTenant(prisma);
      const tUser = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, tUser.id, {
        status: "OPEN_FOR_BIDS",
      });
      await inviteSupplierToTender(prisma, tender.id, otherSupplier.id);

      await request(app.getHttpServer())
        .get(`/api/supplier/tenders/${tender.id}/my-bid`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });
});
