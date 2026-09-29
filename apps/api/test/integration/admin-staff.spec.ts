/**
 * Faz 7 — personel yönetimi + admin 2FA. Guard'lar: son SUPER_ADMIN korunur,
 * kendini düşürme/pasifleştirme yok; 2FA'lı login kod ister; şifre sıfırlama
 * 2FA kilidini de açar. Supabase mock, DB gerçek.
 */
import { authenticator } from "otplib";
import { AdminAuthService } from "../../src/modules/admin-auth/admin-auth.service";
import { AdminStaffService } from "../../src/modules/admin-auth/admin-staff.service";
import { PrismaClient } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { TEST_DB_URL } from "./env";
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
  // Denetim 2026-08-23 #4: TOTP sırrı şifreli → ConfigService (JWT_SECRET) gerekir.
  const config = {
    get: () => undefined,
    getOrThrow: (k: string) => {
      if (k === "JWT_SECRET") return "admin-staff-spec-secret-1234567890";
      throw new Error(k);
    },
  };
  const service = new AdminAuthService(
    prisma as never,
    jwt as never,
    supabase as never,
    audit,
    config as never,
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

  it("resetPassword: kendi hesabını sıfırlama reddedilir (derin denetim MU-21 — tek SUPER_ADMIN kilitlenmesin)", async () => {
    const { service, supabase } = staffRig();
    const solo = await makeAdmin("SUPER_ADMIN", {
      twoFactorEnabled: true,
      twoFactorSecret: "SECRET",
    });
    await expect(service.resetPassword(solo.id, solo.id)).rejects.toThrow(
      /Kendi şifrenizi/,
    );
    expect(supabase.updatePassword).not.toHaveBeenCalled();
    const after = await prisma.platformAdmin.findUnique({
      where: { id: solo.id },
    });
    expect(after?.twoFactorEnabled).toBe(true);
    expect(after?.tokenVersion).toBe(solo.tokenVersion);
  });

  it("eşzamanlı çapraz düşürme 0 SUPER_ADMIN bırakmaz (derin denetim LU-02 — FOR UPDATE)", async () => {
    // Bariyer: her tx `count` sonrası diğerinin de saymasını bekler (en çok
    // 300 ms). Kilitsiz kodda iki tx de "benden başka 1 var" görüp yazardı;
    // FOR UPDATE ile ikinci tx kilitte bekler, bariyer zaman aşımıyla açılır.
    let arrived = 0;
    const waitOthers = async () => {
      arrived += 1;
      const until = Date.now() + 300;
      while (arrived < 2 && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    // Paylaşılan test client'ı connection_limit=1 (tüm tx'ler zaten seri) —
    // yarışı gerçekten koşturmak için bu test çok bağlantılı ayrı client açar.
    const base = TEST_DB_URL.replace(/[?&]connection_limit=\d+/, "");
    const multi = new PrismaClient({
      datasources: {
        db: { url: `${base}${base.includes("?") ? "&" : "?"}connection_limit=3` },
      },
    });
    const racyPrisma = new Proxy(multi, {
      get(target, prop, recv) {
        if (prop !== "$transaction") return Reflect.get(target, prop, recv);
        return (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
          target.$transaction(
            (tx) =>
              fn(
                new Proxy(tx, {
                  get(t, k) {
                    if (k !== "platformAdmin") return Reflect.get(t, k);
                    const model = t.platformAdmin;
                    return new Proxy(model, {
                      get(m, mk) {
                        if (mk !== "count") return Reflect.get(m, mk);
                        return async (args: never) => {
                          const n = await m.count(args);
                          await waitOthers();
                          return n;
                        };
                      },
                    });
                  },
                }),
              ),
            opts as never,
          );
      },
    });
    const service = new AdminStaffService(
      racyPrisma as never,
      new AuditService(prisma as never),
      {} as never,
    );
    try {
      for (let round = 0; round < 2; round += 1) {
        await truncateAll();
        arrived = 0;
        const a = await makeAdmin("SUPER_ADMIN");
        const b = await makeAdmin("SUPER_ADMIN");
        const results = await Promise.allSettled([
          service.setRole(b.id, "SALES", a.id),
          round % 2 === 0
            ? service.setRole(a.id, "SUPPORT", b.id)
            : service.setActive(a.id, false, b.id),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(String(rejected.reason?.message)).toMatch(/Son aktif SUPER_ADMIN/);
        const remaining = await prisma.platformAdmin.count({
          where: { role: "SUPER_ADMIN", isActive: true },
        });
        expect(remaining).toBe(1);
      }
    } finally {
      await multi.$disconnect();
    }
  });

  it("pasifleştirme oturumları iptal eder; yeniden aktifleştirmede eski JWT dirilmez (derin denetim LU-02)", async () => {
    const { service } = staffRig();
    const actor = await makeAdmin("SUPER_ADMIN");
    const staff = await makeAdmin("SALES");
    const otherSuper = await makeAdmin("SUPER_ADMIN");
    await service.setActive(staff.id, false, actor.id);
    let row = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: staff.id } });
    expect(row.isActive).toBe(false);
    expect(row.tokenVersion).toBe(staff.tokenVersion + 1);
    // Yeniden aktifleştirme sürümü değiştirmez (yeni giriş yeni tv ile imzalanır).
    await service.setActive(staff.id, true, actor.id);
    row = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: staff.id } });
    expect(row.isActive).toBe(true);
    expect(row.tokenVersion).toBe(staff.tokenVersion + 1);
    // SUPER_ADMIN dalı (transaction içi) da sürümü artırır.
    await service.setActive(otherSuper.id, false, actor.id);
    row = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: otherSuper.id } });
    expect(row.tokenVersion).toBe(otherSuper.tokenVersion + 1);
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
