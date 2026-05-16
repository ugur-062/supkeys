/**
 * Cross-token isolation E2E — JWT type field güvenliği.
 *
 * Sistem 3 ayrı JWT type yayar: "tenant", "admin", "supplier".
 * Her guard kendi type'ına izin verir; aksi → 401 "Geçersiz token tipi".
 *
 * Bu sürtüşmenin testi V1'de manuel yapılmıştı; burada otomatize edildi.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AuthModule } from "../src/modules/auth/auth.module";
import { AdminAuthModule } from "../src/modules/admin-auth/admin-auth.module";
import { SupplierAuthModule } from "../src/modules/supplier-auth/supplier-auth.module";
import { buildTestApp } from "./helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "./helpers/db";
import {
  createTenant,
  createUser,
  createPlatformAdmin,
  createSupplier,
  createSupplierUser,
} from "./helpers/factories";

describe("Cross-token isolation (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    // 3 modülü beraber mount et — aynı uygulamada hepsi var
    app = await buildTestApp({
      imports: [AuthModule, AdminAuthModule, SupplierAuthModule],
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

  async function loginTenant() {
    const tenant = await createTenant(prisma);
    const user = await createUser(prisma, tenant.id);
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: user.email, password: user.plaintextPassword })
      .expect(200);
    return res.body.token as string;
  }

  async function loginAdmin() {
    const admin = await createPlatformAdmin(prisma);
    const res = await request(app.getHttpServer())
      .post("/api/admin/auth/login")
      .send({ email: admin.email, password: admin.plaintextPassword })
      .expect(200);
    return res.body.token as string;
  }

  async function loginSupplier() {
    const supplier = await createSupplier(prisma);
    const user = await createSupplierUser(prisma, supplier.id);
    const res = await request(app.getHttpServer())
      .post("/api/supplier-auth/login")
      .send({ email: user.email, password: user.plaintextPassword })
      .expect(200);
    return res.body.token as string;
  }

  describe("tenant token", () => {
    it("/api/auth/me → 200 (kendi alanı)", async () => {
      const token = await loginTenant();
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("/api/admin/auth/me → 401 (admin token bekleniyor)", async () => {
      const token = await loginTenant();
      await request(app.getHttpServer())
        .get("/api/admin/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });

    it("/api/supplier-auth/me → 401 (supplier token bekleniyor)", async () => {
      const token = await loginTenant();
      await request(app.getHttpServer())
        .get("/api/supplier-auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });
  });

  describe("admin token", () => {
    it("/api/admin/auth/me → 200", async () => {
      const token = await loginAdmin();
      await request(app.getHttpServer())
        .get("/api/admin/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("/api/auth/me → 401 (tenant token bekleniyor)", async () => {
      const token = await loginAdmin();
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });

    it("/api/supplier-auth/me → 401", async () => {
      const token = await loginAdmin();
      await request(app.getHttpServer())
        .get("/api/supplier-auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });
  });

  describe("supplier token", () => {
    it("/api/supplier-auth/me → 200", async () => {
      const token = await loginSupplier();
      await request(app.getHttpServer())
        .get("/api/supplier-auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("/api/auth/me → 401", async () => {
      const token = await loginSupplier();
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });

    it("/api/admin/auth/me → 401", async () => {
      const token = await loginSupplier();
      await request(app.getHttpServer())
        .get("/api/admin/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });
  });

  describe("malformed / token tampering", () => {
    it("Bearer header yok → 401", async () => {
      await request(app.getHttpServer()).get("/api/auth/me").expect(401);
    });

    it("garbage token → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", "Bearer xxx.yyy.zzz")
        .expect(401);
    });

    it("expired token (manuel imzayla) → 401", async () => {
      // Bilerek geçersiz imzalı bir JWT — header dolu olsa da reddedilmeli
      const fakeToken = [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", // header
        "eyJzdWIiOiJ4IiwiaWF0IjoxLCJleHAiOjF9", // expired payload
        "wrong-signature",
      ].join(".");
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${fakeToken}`)
        .expect(401);
    });
  });
});
