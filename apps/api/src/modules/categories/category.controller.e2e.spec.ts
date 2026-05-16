/**
 * E2E — public categories + currency endpoint'leri (auth gerekmez).
 */
import type { INestApplication } from "@nestjs/common";
import { Module } from "@nestjs/common";
import request from "supertest";
import { CategoryController } from "./controllers/category.controller";
import { CategoryService } from "./services/category.service";
import { ExchangeRateController } from "../currency/controllers/exchange-rate.controller";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";
import { TcmbService } from "../currency/services/tcmb.service";
import { buildTestApp } from "../../../test/helpers/test-app";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { createCategoryTree } from "../../../test/helpers/factories";

@Module({
  controllers: [CategoryController, ExchangeRateController],
  providers: [
    CategoryService,
    ExchangeRateService,
    { provide: TcmbService, useValue: { fetchTodayRates: jest.fn() } },
  ],
})
class PublicTestModule {}

describe("Public endpoints (E2E) — categories + currency", () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test_jwt_secret";
    app = await buildTestApp({
      imports: [PublicTestModule],
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

  describe("GET /api/categories/roots", () => {
    it("boş DB → 200 + boş array + Cache-Control", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/categories/roots")
        .expect(200);
      expect(res.body).toEqual([]);
      expect(res.headers["cache-control"]).toContain("max-age=3600");
    });

    it("seeded → sadece level 1 (Segment) döner", async () => {
      await createCategoryTree(prisma);
      const res = await request(app.getHttpServer())
        .get("/api/categories/roots")
        .expect(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].level).toBe(1);
    });

    it("auth gerekmez (public)", async () => {
      // Authorization header hiç gönderilmeden 200
      await request(app.getHttpServer())
        .get("/api/categories/roots")
        .expect(200);
    });
  });

  describe("GET /api/categories/children", () => {
    it("parentId yoksa → 400", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/categories/children")
        .expect(400);
      expect(res.body.message).toContain("parentId");
    });

    it("parentId=segment → 200 + family döner", async () => {
      const { segment, family } = await createCategoryTree(prisma);
      const res = await request(app.getHttpServer())
        .get("/api/categories/children")
        .query({ parentId: segment.id })
        .expect(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(family.id);
    });

    it("Cache-Control 1h", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/categories/children")
        .query({ parentId: "any" })
        .expect(200);
      expect(res.headers["cache-control"]).toContain("max-age=3600");
    });
  });

  describe("GET /api/categories/search", () => {
    it("<2 char → 200 + boş array", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/categories/search")
        .query({ q: "a" })
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it("eşleşen Class döner + breadcrumb", async () => {
      await createCategoryTree(prisma);
      const res = await request(app.getHttpServer())
        .get("/api/categories/search")
        .query({ q: "Class" })
        .expect(200);
      const found = res.body.find((c: { level: number }) => c.level === 3);
      expect(found).toBeDefined();
      expect(found.breadcrumb).toContain("›");
    });
  });

  describe("GET /api/categories/search-tree", () => {
    it("eşleşen tree shape döner", async () => {
      await createCategoryTree(prisma);
      const res = await request(app.getHttpServer())
        .get("/api/categories/search-tree")
        .query({ q: "Class" })
        .expect(200);
      expect(res.body.segments).toBeDefined();
      expect(Array.isArray(res.body.segments)).toBe(true);
    });
  });

  describe("GET /api/categories/by-ids", () => {
    it("boş query → boş array", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/categories/by-ids")
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it("comma-separated ids → o kategoriler", async () => {
      const { klass } = await createCategoryTree(prisma);
      const res = await request(app.getHttpServer())
        .get("/api/categories/by-ids")
        .query({ ids: klass.id })
        .expect(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(klass.id);
    });
  });

  describe("GET /api/exchange-rates/current", () => {
    it("public → 200 + rates map (TRY=1 + fallback'ler)", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/exchange-rates/current")
        .expect(200);

      expect(res.body.rates).toBeDefined();
      expect(res.body.rates.TRY).toBe(1);
      expect(res.body.rates.USD).toBeGreaterThan(0);
      expect(res.body.timestamp).toBeDefined();
    });

    it("auth gerekmez", async () => {
      await request(app.getHttpServer())
        .get("/api/exchange-rates/current")
        .expect(200);
    });
  });
});
