/**
 * E2E — POST /api/auth/login + GET /api/auth/me (tenant auth).
 *
 * HTTP layer:
 *   - ValidationPipe + class-validator (DTO mesajları)
 *   - JwtAuthGuard
 *   - Throttler (rate limit)
 *   - Response shape (token + user)
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AuthModule } from "./auth.module";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import {
  createTenant,
  createUser,
} from "../../../test/helpers/factories";

describe("POST /api/auth/login + GET /api/auth/me (E2E)", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    // JWT_SECRET .env.test'ten geliyor; AuthModule kendi ayarlar
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [AuthModule],
      enableThrottler: false, // ayrı bir test'te aktif edilecek
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe("POST /api/auth/login — happy path", () => {
    it("doğru kimlikle 200 + token + user", async () => {
      const tenant = await createTenant(prisma, { name: "E2E Co" });
      const user = await createUser(prisma, tenant.id, {
        email: "e2e@test.local",
      });

      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "e2e@test.local", password: user.plaintextPassword })
        .expect(200);

      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        id: user.id,
        email: "e2e@test.local",
        tenant: { name: "E2E Co" },
      });
      expect(Array.isArray(res.body.user.permissions)).toBe(true);
    });
  });

  describe("POST /api/auth/login — DTO validation 400", () => {
    it("boş body → 400 + errors.email + errors.password", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({})
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: "Doğrulama hatası",
      });
      expect(res.body.errors).toHaveProperty("email");
      expect(res.body.errors).toHaveProperty("password");
    });

    it("geçersiz email format → 400 + errors.email", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "not-an-email", password: "x" })
        .expect(400);
      expect(res.body.errors.email).toMatch(/e-posta/i);
    });

    it("forbidNonWhitelisted: extra field → 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "e@t.com", password: "x", extra: "hack" })
        .expect(400);
      expect(res.body.errors).toHaveProperty("extra");
    });
  });

  describe("POST /api/auth/login — auth failures 401", () => {
    const GENERIC = "E-posta veya şifre hatalı";

    it("var olmayan email → 401 generic", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "yok@test.local", password: "WrongPass1" })
        .expect(401);
      expect(res.body.message).toBe(GENERIC);
    });

    it("yanlış şifre → 401 generic", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: "Wrong1" })
        .expect(401);
      expect(res.body.message).toBe(GENERIC);
    });

    it("pasif user → 401 generic (info leak yok)", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id, { isActive: false });
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: user.plaintextPassword })
        .expect(401);
      expect(res.body.message).toBe(GENERIC);
    });
  });

  describe("GET /api/auth/me — JwtAuthGuard", () => {
    it("geçerli token ile 200 + public user", async () => {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);

      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: user.plaintextPassword })
        .expect(200);

      const me = await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${login.body.token}`)
        .expect(200);

      expect(me.body).toMatchObject({
        id: user.id,
        email: user.email,
      });
    });

    it("token yok → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .expect(401);
    });

    it("geçersiz token → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", "Bearer not-a-real-jwt")
        .expect(401);
    });

    it("malformed Authorization header → 401", async () => {
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", "Bearer")
        .expect(401);
    });
  });
});
