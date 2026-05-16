/**
 * E2E — POST /api/supplier-auth/login + GET /api/supplier-auth/me.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SupplierAuthModule } from "./supplier-auth.module";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import {
  createSupplier,
  createSupplierUser,
} from "../../../test/helpers/factories";

describe("Supplier auth controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [SupplierAuthModule],
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

  describe("POST /api/supplier-auth/login", () => {
    it("happy → 200 + token + supplierUser + supplier", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);

      const res = await request(app.getHttpServer())
        .post("/api/supplier-auth/login")
        .send({ email: user.email, password: user.plaintextPassword })
        .expect(200);

      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.supplier.companyName).toBe(supplier.companyName);
    });

    it("blocked supplier → 403", async () => {
      const supplier = await createSupplier(prisma, {
        isBlocked: true,
        blockedReason: "Test sebep",
      });
      const user = await createSupplierUser(prisma, supplier.id);
      const res = await request(app.getHttpServer())
        .post("/api/supplier-auth/login")
        .send({ email: user.email, password: user.plaintextPassword })
        .expect(403);
      expect(res.body.message).toContain("engellenmiş");
    });

    it("yanlış şifre → 401 generic", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);
      await request(app.getHttpServer())
        .post("/api/supplier-auth/login")
        .send({ email: user.email, password: "Wrong1" })
        .expect(401);
    });
  });

  describe("GET /api/supplier-auth/me", () => {
    it("geçerli token → me döner", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);
      const login = await request(app.getHttpServer())
        .post("/api/supplier-auth/login")
        .send({ email: user.email, password: user.plaintextPassword })
        .expect(200);

      const me = await request(app.getHttpServer())
        .get("/api/supplier-auth/me")
        .set("Authorization", `Bearer ${login.body.token}`)
        .expect(200);

      expect(me.body.supplierUser.id).toBe(user.id);
      expect(me.body.supplier.id).toBe(supplier.id);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/supplier-auth/me")
        .expect(401);
    });
  });
});
