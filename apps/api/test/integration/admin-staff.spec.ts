/**
 * Faz 7 — personel yönetimi + admin 2FA. Guard'lar: son SUPER_ADMIN korunur,
 * kendini düşürme/pasifleştirme yok; 2FA'lı login kod ister; şifre sıfırlama
 * 2FA kilidini de açar. Supabase mock, DB gerçek.
 */
import { authenticator } from "otplib";
import { AdminAuthService } from "../../src/modules/admin-auth/admin-auth.service";
import { AdminStaffService } from "../../src/modules/admin-auth/admin-staff.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";

let seq = 0;
async function makeAdmin(
  role: "SUPER_ADMIN" | "SALES" | "SUPPORT" = "SUPER_ADMIN",
  over: Record<string, unknown> = {},
) {
  seq += 1;
  return prisma.platformAdmin.create({
    data: {
      email: `admin-${Date.now()}-${seq}@test.local`,
      authId: `auth-adm-${Date.now()}-${seq}`,
      firstName: "Test",
      lastName: "Admin",
      role,
      ...over,
    },
  });
}

function staffRig() {
  const supabase = {
    createUser: jest.fn().mockResolvedValue({ authId: `auth-new-${++seq}` }),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  };
  const audit = new AuditService(prisma as never);
  const service = new AdminStaffService(
    prisma as never,
    audit,
    supabase as never,
  );
  return { service, supabase };
}

function authRig() {
  const supabase = {
    verifyPassword: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  };
  const jwt = { sign: jest.fn().mockReturnValue("jwt-token") };
  const audit = new AuditService(prisma as never);
  const service = new AdminAuthService(
    prisma as never,
    jwt as never,
    supabase as never,
    audit,
  );
  return { service, supabase };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("personel yönetimi", () => {
  it("create: Supabase hesabı + geçici parola döner (parola politikaya uyar)", async () => {
    const { service, supabase } = staffRig();
    const actor = await makeAdmin("SUPER_ADMIN");
    const res = await service.create(
      {
        email: "yeni@rothern.com",
        firstName: "Yeni",
        lastName: "Personel",
        role: "SUPPORT",
      },
      actor.id,
    );
    expect(supabase.createUser).toHaveBeenCalled();
    expect(res.tempPassword.length).toBeGreaterThanOrEqual(12);
    const created = await prisma.platformAdmin.findUnique({
      where: { id: res.id },
    });
    expect(created?.role).toBe("SUPPORT");
    // Parola audit metadata'sına YAZILMAZ.
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.staff.created", entityId: res.id },
    });
    expect(JSON.stringify(log?.metadata)).not.toContain(res.tempPassword);
  });

  it("son aktif SUPER_ADMIN düşürülemez/pasifleştirilemez; kendini düşürme yok", async () => {
    const { service } = staffRig();
    const solo = await makeAdmin("SUPER_ADMIN");
    await expect(
      service.setRole(solo.id, "SALES", solo.id),
    ).rejects.toThrow(/Kendi rolünüzü/);
    // Başka bir aktör olsa bile son süper korunur.
    const other = await makeAdmin("SALES");
    await expect(
      service.setRole(solo.id, "SUPPORT", other.id),
    ).rejects.toThrow(/Son aktif SUPER_ADMIN/);
    await expect(
      service.setActive(solo.id, false, other.id),
    ).rejects.toThrow(/Son aktif SUPER_ADMIN/);
    // İkinci süper varken düşürme serbest.
    const second = await makeAdmin("SUPER_ADMIN");
    await service.setRole(solo.id, "SALES", second.id);
    const after = await prisma.platformAdmin.findUnique({
      where: { id: solo.id },
    });
    expect(after?.role).toBe("SALES");
  });

  it("resetPassword: yeni geçici parola + 2FA kilidi açılır", async () => {
    const { service, supabase } = staffRig();
    const actor = await makeAdmin("SUPER_ADMIN");
    const target = await makeAdmin("SALES", {
      twoFactorEnabled: true,
      twoFactorSecret: "SECRET",
    });
    const res = await service.resetPassword(target.id, actor.id);
    expect(supabase.updatePassword).toHaveBeenCalledWith(
      target.authId,
      res.tempPassword,
    );
    const after = await prisma.platformAdmin.findUnique({
      where: { id: target.id },
    });
    expect(after?.twoFactorEnabled).toBe(false);
    expect(after?.twoFactorSecret).toBeNull();
  });
});

describe("admin 2FA + login", () => {
  it("2FA'lı hesapta kod yoksa 2FA_REQUIRED; doğru kodla giriş başarılı", async () => {
    const { service, supabase } = authRig();
    const secret = authenticator.generateSecret();
    const admin = await makeAdmin("SUPER_ADMIN", {
      twoFactorEnabled: true,
      twoFactorSecret: secret,
    });
    supabase.verifyPassword.mockResolvedValue({ authId: admin.authId });

    await expect(
      service.login({ email: admin.email, password: "x" } as never),
    ).rejects.toThrow("2FA_REQUIRED");

    await expect(
      service.login({
        email: admin.email,
        password: "x",
        code: "000000",
      } as never),
    ).rejects.toThrow(/Doğrulama kodu hatalı/);

    const code = authenticator.generate(secret);
    const ok = await service.login({
      email: admin.email,
      password: "x",
      code,
    } as never);
    expect(ok.admin.id).toBe(admin.id);
  });

  it("enable/disable akışı: kod doğrulanır, durum + secret güncellenir", async () => {
    const { service } = authRig();
    const admin = await makeAdmin("SALES");
    const setup = await service.setupTwoFactor(admin.id);
    expect(setup.otpauthUrl).toContain("Rothern");
    await expect(
      service.enableTwoFactor(admin.id, setup.secret, "000000"),
    ).rejects.toThrow(/kodu hatalı/);
    const code = authenticator.generate(setup.secret);
    await service.enableTwoFactor(admin.id, setup.secret, code);
    let row = await prisma.platformAdmin.findUnique({ where: { id: admin.id } });
    expect(row?.twoFactorEnabled).toBe(true);
    // Kapatma da kod ister.
    const code2 = authenticator.generate(setup.secret);
    await service.disableTwoFactor(admin.id, code2);
    row = await prisma.platformAdmin.findUnique({ where: { id: admin.id } });
    expect(row?.twoFactorEnabled).toBe(false);
    expect(row?.twoFactorSecret).toBeNull();
  });
});
