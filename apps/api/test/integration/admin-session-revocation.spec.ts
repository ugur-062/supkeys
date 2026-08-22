/**
 * Denetim 2026-08-23 #3/#4: admin realm oturum iptali (tokenVersion) + TOTP
 * sırrının şifreli saklanması. Company realm ile parite.
 */
import "reflect-metadata";
import { JwtService } from "@nestjs/jwt";
import { authenticator } from "otplib";
import { AdminAuthService } from "../../src/modules/admin-auth/admin-auth.service";
import { AdminJwtStrategy } from "../../src/modules/admin-auth/strategies/admin-jwt.strategy";
import { isEncryptedTotpSecret } from "../../src/common/auth/totp-secret-cipher";
import { prisma, truncateAll } from "./test-db";

const SECRET = "admin-revocation-test-secret-1234567890";
const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: "1h" } });
const config = {
  get: (key: string) => (key === "JWT_SECRET" ? SECRET : undefined),
  getOrThrow: (key: string) => {
    if (key === "JWT_SECRET") return SECRET;
    throw new Error(key);
  },
};

function makeService() {
  const supabaseAuth = {
    verifyPassword: jest.fn(async () => ({ authId: "auth-admin-1", email: "admin@test.local" })),
    updatePassword: jest.fn(async () => undefined),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new AdminAuthService(
    prisma as never,
    jwt,
    supabaseAuth as never,
    audit as never,
    config as never,
  );
  const strategy = new AdminJwtStrategy(config as never, prisma as never);
  return { svc, strategy, supabaseAuth };
}

async function makeAdmin() {
  return prisma.platformAdmin.create({
    data: {
      email: "admin@test.local",
      authId: "auth-admin-1",
      firstName: "Ad",
      lastName: "Min",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("admin oturum iptali (tokenVersion)", () => {
  it("login token'ı tv taşır; parola değişimi tv++ → eski token 401, dönen taze token geçer", async () => {
    const { svc, strategy } = makeService();
    const admin = await makeAdmin();
    const login = await svc.login({ email: admin.email, password: "x" } as never);
    const oldPayload = jwt.verify<{ tv?: number; sub: string }>(login.token);
    expect(oldPayload.tv).toBe(0);
    await expect(strategy.validate(oldPayload as never)).resolves.toMatchObject({ id: admin.id });

    const res = await svc.changePassword(admin.id, "old-pass-123456", "new-pass-123456");
    expect(res.ok).toBe(true);
    expect(typeof res.token).toBe("string");
    const fresh = jwt.verify<{ tv?: number }>(res.token);
    expect(fresh.tv).toBe(1);
    const db = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(db.tokenVersion).toBe(1);

    await expect(strategy.validate(oldPayload as never)).rejects.toThrow(/Oturum geçersiz/);
    await expect(strategy.validate(fresh as never)).resolves.toMatchObject({ id: admin.id });
  });

  it("2FA enable: sır DB'de ŞİFRELİ saklanır, login decrypt ile doğrular, tv++ yapılır; disable yine tv++", async () => {
    const { svc, strategy } = makeService();
    const admin = await makeAdmin();
    const { secret } = await svc.setupTwoFactor(admin.id);
    const code = authenticator.generate(secret);
    const en = await svc.enableTwoFactor(admin.id, secret, code);
    expect(typeof en.token).toBe("string");
    const row = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row.twoFactorEnabled).toBe(true);
    expect(isEncryptedTotpSecret(row.twoFactorSecret)).toBe(true);
    expect(row.twoFactorSecret).not.toContain(secret); // düz metin DB'de görünmez
    expect(row.tokenVersion).toBe(1);

    // Login: kodsuz → 2FA_REQUIRED; doğru kodla → token (decrypt çalışıyor)
    await expect(svc.login({ email: admin.email, password: "x" } as never)).rejects.toThrow(/2FA_REQUIRED/);
    const ok = await svc.login({ email: admin.email, password: "x", code: authenticator.generate(secret) } as never);
    expect(jwt.verify<{ tv?: number }>(ok.token).tv).toBe(1);
    await expect(strategy.validate(jwt.verify(ok.token) as never)).resolves.toMatchObject({ id: admin.id });

    const dis = await svc.disableTwoFactor(admin.id, authenticator.generate(secret));
    expect(typeof dis.token).toBe("string");
    const after = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after.twoFactorEnabled).toBe(false);
    expect(after.tokenVersion).toBe(2);
  });
});
