/**
 * Supplier auth flow — SupplierUser login.
 *
 * Tenant/admin'den farklı: blocked + isActive (hem Supplier hem User)
 * koşulları ayrı 403 mesajı veriyor (timing trade-off — kasıtlı, çünkü
 * support yönlendirmesi için "engelliyim" mesajı UX'e değer katar). Bunu
 * davranış olarak test ediyoruz.
 */
import { TestingModule } from "@nestjs/testing";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SupplierAuthService } from "./services/supplier-auth.service";
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import {
  createSupplier,
  createSupplierUser,
} from "../../../test/helpers/factories";

describe("SupplierAuthService — supplier login", () => {
  let moduleRef: TestingModule;
  let service: SupplierAuthService;
  let jwt: JwtService;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({ providers: [SupplierAuthService] });
    service = moduleRef.get(SupplierAuthService);
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
    it("doğru kimlikle login → token + supplierUser + supplier döner", async () => {
      const supplier = await createSupplier(prisma, { companyName: "Acme Tedarik" });
      const user = await createSupplierUser(prisma, supplier.id, {
        email: "kullanici@tedarik.test",
        firstName: "Demet",
        lastName: "Yıldız",
      });

      const result = await service.login({
        email: "kullanici@tedarik.test",
        password: user.plaintextPassword,
      });

      expect(result.token).toEqual(expect.any(String));
      expect(result.supplierUser).toMatchObject({
        id: user.id,
        email: "kullanici@tedarik.test",
        firstName: "Demet",
      });
      expect(result.supplier).toMatchObject({
        id: supplier.id,
        companyName: "Acme Tedarik",
        isActive: true,
        isBlocked: false,
      });
    });

    it("JWT payload type=supplier + supplierUserId + supplierId içerir", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);

      const result = await service.login({
        email: user.email,
        password: user.plaintextPassword,
      });
      const decoded = jwt.decode(result.token) as Record<string, unknown>;

      expect(decoded).toMatchObject({
        sub: user.id,
        email: user.email,
        type: "supplier",
        supplierUserId: user.id,
        supplierId: supplier.id,
      });
    });

    it("lastLoginAt başarılı login sonrası set edilir", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);

      await service.login({ email: user.email, password: user.plaintextPassword });

      const fresh = await prisma.supplierUser.findUnique({ where: { id: user.id } });
      expect(fresh?.lastLoginAt).toBeInstanceOf(Date);
    });

    it("email başında/sonunda boşluk trim edilir", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id, {
        email: "trim@test.local",
      });

      const result = await service.login({
        email: "  TRIM@TEST.LOCAL  ",
        password: user.plaintextPassword,
      });
      expect(result.supplierUser.email).toBe("trim@test.local");
    });
  });

  describe("authentication failures", () => {
    it("var olmayan email → 401 generic", async () => {
      await expect(
        service.login({ email: "yok@test.local", password: "x" }),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login({ email: "yok@test.local", password: "x" }),
      ).rejects.toThrow("E-posta veya şifre hatalı");
    });

    it("yanlış şifre → 401 generic", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);

      await expect(
        service.login({ email: user.email, password: "Wrong1" }),
      ).rejects.toThrow("E-posta veya şifre hatalı");
    });
  });

  describe("supplier engelleme/pasifleştirme — 403 (UX kararı)", () => {
    it("supplier.isBlocked=true → 403 + sebep mesajı", async () => {
      const supplier = await createSupplier(prisma, {
        isBlocked: true,
        blockedReason: "Vergi belgesi eksik",
      });
      const user = await createSupplierUser(prisma, supplier.id);

      await expect(
        service.login({ email: user.email, password: user.plaintextPassword }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.login({ email: user.email, password: user.plaintextPassword }),
      ).rejects.toThrow("engellenmiş");
    });

    it("supplier.isBlocked + blockedReason yok → 403 + iletişim mesajı", async () => {
      const supplier = await createSupplier(prisma, {
        isBlocked: true,
        blockedReason: null,
      });
      const user = await createSupplierUser(prisma, supplier.id);

      await expect(
        service.login({ email: user.email, password: user.plaintextPassword }),
      ).rejects.toThrow("Lütfen Supkeys ekibiyle iletişime geçin");
    });

    it("supplier.isActive=false → 403 'Tedarikçi hesabı aktif değil'", async () => {
      const supplier = await createSupplier(prisma, { isActive: false });
      const user = await createSupplierUser(prisma, supplier.id);

      await expect(
        service.login({ email: user.email, password: user.plaintextPassword }),
      ).rejects.toThrow("Tedarikçi hesabı aktif değil");
    });

    it("supplierUser.isActive=false → 403 'Kullanıcı hesabı aktif değil'", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id, { isActive: false });

      await expect(
        service.login({ email: user.email, password: user.plaintextPassword }),
      ).rejects.toThrow("Kullanıcı hesabı aktif değil");
    });
  });

  describe("getMe", () => {
    it("supplier user id ile → user + supplier + tenantRelations + categories döner", async () => {
      const supplier = await createSupplier(prisma);
      const user = await createSupplierUser(prisma, supplier.id);

      const me = await service.getMe(user.id);
      expect(me.supplierUser.id).toBe(user.id);
      expect(me.supplier.id).toBe(supplier.id);
      expect(me.tenantRelations).toEqual([]);
      expect(me.categories).toEqual([]);
    });

    it("bilinmeyen id → 401", async () => {
      await expect(service.getMe("nope")).rejects.toThrow(UnauthorizedException);
    });
  });
});
