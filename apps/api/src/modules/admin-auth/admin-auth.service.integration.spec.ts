/**
 * Admin auth flow — PlatformAdmin login.
 *
 * Tenant auth ile aynı pattern: timing-safe, generic 401, lastLoginAt update,
 * JWT type=admin.
 */
import { TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AdminAuthService } from "./admin-auth.service";
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import { createPlatformAdmin } from "../../../test/helpers/factories";

describe("AdminAuthService — admin login", () => {
  let moduleRef: TestingModule;
  let service: AdminAuthService;
  let jwt: JwtService;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({ providers: [AdminAuthService] });
    service = moduleRef.get(AdminAuthService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe("happy path", () => {
    it("doğru kimlikle login → token + admin döner", async () => {
      const admin = await createPlatformAdmin(prisma, {
        email: "admin@supkeys.test",
        firstName: "Süper",
        lastName: "Yönetici",
      });

      const result = await service.login({
        email: "admin@supkeys.test",
        password: admin.plaintextPassword,
      });

      expect(result.token).toEqual(expect.any(String));
      expect(result.admin).toMatchObject({
        id: admin.id,
        email: "admin@supkeys.test",
        firstName: "Süper",
        lastName: "Yönetici",
      });
    });

    it("JWT payload type=admin içerir (cross-token izolasyon için kritik)", async () => {
      const admin = await createPlatformAdmin(prisma);
      const result = await service.login({
        email: admin.email,
        password: admin.plaintextPassword,
      });
      const decoded = jwt.decode(result.token) as Record<string, unknown>;
      expect(decoded.type).toBe("admin");
      expect(decoded.sub).toBe(admin.id);
    });

    it("lastLoginAt başarılı login sonrası set edilir", async () => {
      const admin = await createPlatformAdmin(prisma);
      await service.login({ email: admin.email, password: admin.plaintextPassword });

      const fresh = await prisma.platformAdmin.findUnique({ where: { id: admin.id } });
      expect(fresh?.lastLoginAt).toBeInstanceOf(Date);
    });

    it("e-posta lowercase normalize edilir", async () => {
      const admin = await createPlatformAdmin(prisma, { email: "case@admin.test" });
      const result = await service.login({
        email: "CASE@ADMIN.TEST",
        password: admin.plaintextPassword,
      });
      expect(result.admin.email).toBe("case@admin.test");
    });
  });

  describe("authentication failures (generic 401)", () => {
    const GENERIC = "E-posta veya şifre hatalı";

    it("var olmayan email → 401 generic", async () => {
      await expect(
        service.login({ email: "yok@admin.test", password: "x" }),
      ).rejects.toThrow(GENERIC);
    });

    it("yanlış şifre → 401 generic", async () => {
      const admin = await createPlatformAdmin(prisma);
      await expect(
        service.login({ email: admin.email, password: "Wrong1" }),
      ).rejects.toThrow(GENERIC);
    });

    it("pasif admin → 401 generic", async () => {
      const admin = await createPlatformAdmin(prisma, { isActive: false });
      await expect(
        service.login({ email: admin.email, password: admin.plaintextPassword }),
      ).rejects.toThrow(GENERIC);
    });
  });

  describe("getMe", () => {
    it("admin id ile çağrılınca admin döner", async () => {
      const admin = await createPlatformAdmin(prisma);
      const me = await service.getMe(admin.id);
      expect(me).toMatchObject({ id: admin.id, email: admin.email });
    });

    it("bilinmeyen id → 401", async () => {
      await expect(service.getMe("nope")).rejects.toThrow(UnauthorizedException);
    });
  });
});
