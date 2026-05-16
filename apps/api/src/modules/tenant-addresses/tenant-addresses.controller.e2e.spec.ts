/**
 * E2E — tenant-addresses controller. Settings CRUD + business rules:
 *   - JwtAuthGuard + RolesGuard (write COMPANY_ADMIN-only)
 *   - FATURA tipi için taxOffice + taxNumber zorunlu
 *   - İlk adres otomatik isDefault + isActive
 *   - Son aktif default'u silme/pasifleştirme → 409
 *   - Multi-tenant scope
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { TenantAddressesController } from "./controllers/tenant-addresses.controller";
import { TenantAddressesService } from "./services/tenant-addresses.service";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { createTenant, createUser } from "../../../test/helpers/factories";

@Module({
  imports: [AuthModule],
  controllers: [TenantAddressesController],
  providers: [TenantAddressesService],
})
class TenantAddressesTestModule {}

describe("tenant-addresses controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [TenantAddressesTestModule],
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

  const validFaturaPayload = {
    type: "FATURA",
    title: "Genel Merkez",
    country: "TR",
    city: "Istanbul",
    district: "Ataşehir",
    fullAddress: "Test mah. 1",
    taxOffice: "Kadıköy",
    taxNumber: "1234567890",
  };

  const validTeslimatPayload = {
    type: "TESLIMAT",
    title: "Depo",
    country: "TR",
    city: "Istanbul",
    district: "Maltepe",
    fullAddress: "Sanayi sitesi 5",
  };

  describe("POST /api/tenants/me/addresses — create", () => {
    it("COMPANY_ADMIN happy + FATURA → 201 + isDefault otomatik true (ilk adres)", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .send(validFaturaPayload)
        .expect(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.isDefault).toBe(true);
      expect(res.body.isActive).toBe(true);
    });

    it("BUYER → 403 (RolesGuard COMPANY_ADMIN-only)", async () => {
      const { token } = await loginAs("BUYER");
      await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .send(validFaturaPayload)
        .expect(403);
    });

    it("APPROVER → 403", async () => {
      const { token } = await loginAs("APPROVER");
      await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .send(validTeslimatPayload)
        .expect(403);
    });

    it("FATURA tipinde taxOffice eksik → 400", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      const { taxOffice, ...payload } = validFaturaPayload;
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);
      expect([400]).toContain(res.status);
    });

    it("DTO: type enum dışı → 400", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validTeslimatPayload, type: "INVALID" })
        .expect(400);
      expect(res.body.errors).toHaveProperty("type");
    });

    it("DTO: title eksik → 400", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      const { title, ...payload } = validTeslimatPayload;
      const res = await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .send(payload)
        .expect(400);
      expect(res.body.errors).toHaveProperty("title");
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .post("/api/tenants/me/addresses")
        .send(validFaturaPayload)
        .expect(401);
    });
  });

  describe("GET /api/tenants/me/addresses — list", () => {
    it("BUYER → 200 (read herkese açık)", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "FATURA",
          title: "X",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          taxOffice: "Test",
          taxNumber: "1234567890",
          isDefault: true,
          isActive: true,
        },
      });
      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/addresses")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.length).toBe(1);
    });

    it("filter type=FATURA → sadece FATURA", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "FATURA",
          title: "F",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          taxOffice: "T",
          taxNumber: "1234567890",
          isDefault: true,
          isActive: true,
        },
      });
      await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "T",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
      const res = await request(app.getHttpServer())
        .get("/api/tenants/me/addresses")
        .query({ type: "FATURA" })
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].type).toBe("FATURA");
    });
  });

  describe("PATCH /api/tenants/me/addresses/:id", () => {
    async function seedAddress(tenantId: string) {
      return prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "X",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
    }

    it("COMPANY_ADMIN title update → 200", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const addr = await seedAddress(tenantId);
      const res = await request(app.getHttpServer())
        .patch(`/api/tenants/me/addresses/${addr.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Yeni Başlık" })
        .expect(200);
      expect(res.body.title).toBe("Yeni Başlık");
    });

    it("BUYER → 403", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      const addr = await seedAddress(tenantId);
      await request(app.getHttpServer())
        .patch(`/api/tenants/me/addresses/${addr.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "X" })
        .expect(403);
    });

    it("bilinmeyen id → 400/404 (geçersiz path veya yok)", async () => {
      const { token } = await loginAs("COMPANY_ADMIN");
      const res = await request(app.getHttpServer())
        .patch("/api/tenants/me/addresses/yok")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "X" });
      // Path param doğrulayıcı 400 veya service NotFound 404
      expect([400, 404]).toContain(res.status);
    });

    it("başka tenant'ın adres → 400/404 (IDOR scope)", async () => {
      const { tenantId: t1 } = await loginAs("COMPANY_ADMIN");
      const addr = await seedAddress(t1);
      const { token: t2Token } = await loginAs("COMPANY_ADMIN");
      const res = await request(app.getHttpServer())
        .patch(`/api/tenants/me/addresses/${addr.id}`)
        .set("Authorization", `Bearer ${t2Token}`)
        .send({ title: "X" });
      expect([400, 404]).toContain(res.status);
    });
  });

  describe("DELETE /api/tenants/me/addresses/:id", () => {
    it("COMPANY_ADMIN + son default → 409 (silmez)", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const addr = await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "Tek default",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
      await request(app.getHttpServer())
        .delete(`/api/tenants/me/addresses/${addr.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });

    it("BUYER → 403", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      const addr = await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "x",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
      await request(app.getHttpServer())
        .delete(`/api/tenants/me/addresses/${addr.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("non-default adres silme → 200", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      // 1. default
      await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "default",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
      // 2. ek adres (non-default)
      const extra = await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "extra",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: false,
          isActive: true,
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/tenants/me/addresses/${extra.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const fresh = await prisma.tenantAddress.findUnique({
        where: { id: extra.id },
      });
      expect(fresh).toBeNull();
    });
  });

  describe("POST /api/tenants/me/addresses/:id/set-default", () => {
    it("COMPANY_ADMIN ek adresi default'a alır → 200", async () => {
      const { token, tenantId } = await loginAs("COMPANY_ADMIN");
      const original = await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "ilk",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
      const newOne = await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "yeni",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: false,
          isActive: true,
        },
      });

      await request(app.getHttpServer())
        .post(`/api/tenants/me/addresses/${newOne.id}/set-default`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const f1 = await prisma.tenantAddress.findUnique({
        where: { id: original.id },
      });
      const f2 = await prisma.tenantAddress.findUnique({
        where: { id: newOne.id },
      });
      expect(f1?.isDefault).toBe(false);
      expect(f2?.isDefault).toBe(true);
    });

    it("BUYER → 403", async () => {
      const { token, tenantId } = await loginAs("BUYER");
      const addr = await prisma.tenantAddress.create({
        data: {
          tenantId,
          type: "TESLIMAT",
          title: "x",
          country: "TR",
          city: "Istanbul",
          district: "Y",
          fullAddress: "Z",
          isDefault: true,
          isActive: true,
        },
      });
      await request(app.getHttpServer())
        .post(`/api/tenants/me/addresses/${addr.id}/set-default`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });
});
