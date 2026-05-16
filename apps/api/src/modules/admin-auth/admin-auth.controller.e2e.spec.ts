/**
 * E2E — POST /api/admin/auth/login + GET /api/admin/auth/me.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AdminAuthModule } from "./admin-auth.module";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { createPlatformAdmin } from "../../../test/helpers/factories";

describe("Admin auth controller (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [AdminAuthModule],
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

  describe("POST /api/admin/auth/login", () => {
    it("happy → 200 + token + admin", async () => {
      const admin = await createPlatformAdmin(prisma);

      const res = await request(app.getHttpServer())
        .post("/api/admin/auth/login")
        .send({ email: admin.email, password: admin.plaintextPassword })
        .expect(200);

      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.admin.email).toBe(admin.email);
    });

    it("yanlış şifre → 401 generic", async () => {
      const admin = await createPlatformAdmin(prisma);
      const res = await request(app.getHttpServer())
        .post("/api/admin/auth/login")
        .send({ email: admin.email, password: "Wrong1" })
        .expect(401);
      expect(res.body.message).toBe("E-posta veya şifre hatalı");
    });

    it("boş body → 400 + DTO errors", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/admin/auth/login")
        .send({})
        .expect(400);
      expect(res.body.errors).toHaveProperty("email");
    });
  });

  describe("GET /api/admin/auth/me", () => {
    it("geçerli token → admin döner", async () => {
      const admin = await createPlatformAdmin(prisma);
      const login = await request(app.getHttpServer())
        .post("/api/admin/auth/login")
        .send({ email: admin.email, password: admin.plaintextPassword })
        .expect(200);
      const me = await request(app.getHttpServer())
        .get("/api/admin/auth/me")
        .set("Authorization", `Bearer ${login.body.token}`)
        .expect(200);
      expect(me.body.id).toBe(admin.id);
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer()).get("/api/admin/auth/me").expect(401);
    });
  });
});
