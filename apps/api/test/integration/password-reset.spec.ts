/**
 * Self-service şifre sıfırlama — token üretimi (enumeration-safe, tek-aktif),
 * confirm (tek-kullanım/expiry/geçersiz → Forbidden, tokenVersion++), atomik
 * yarış koruması (iki eşzamanlı confirm → parola yalnız bir kez set edilir).
 */
import * as crypto from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PasswordResetService } from "../../src/modules/password-reset/password-reset.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

function rig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const supabaseAuth = {
    updatePassword: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PasswordResetService(
    prisma as never,
    email as never,
    config as never,
    supabaseAuth as never,
  );
  return { service, email, supabaseAuth };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function userWithAuth() {
  const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
  await prisma.companyUser.update({
    where: { id: owner.user.id },
    data: { authId: `auth-${owner.user.id}` },
  });
  return owner;
}

async function makeToken(
  userId: string,
  over: { usedAt?: Date; expiresAt?: Date } = {},
) {
  const plain = crypto.randomBytes(8).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      companyUserId: userId,
      tokenHash: sha256(plain),
      expiresAt: over.expiresAt ?? new Date(Date.now() + 3_600_000),
      usedAt: over.usedAt ?? null,
    },
  });
  return plain;
}

describe("PasswordResetService", () => {
  it("request: var olan e-posta → token üretir + e-posta gider", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();
    const res = await service.requestForCompany(owner.user.email);
    expect(res).toEqual({ success: true });
    expect(
      await prisma.passwordResetToken.count({
        where: { companyUserId: owner.user.id, usedAt: null },
      }),
    ).toBe(1);
    expect(email.send).toHaveBeenCalled();
    // Derin denetim X09: bağlam kimliği adres değil kullanıcı id'si (EmailLog +
    // kritik alarmda Sentry extra.contextId'e düşer).
    expect(email.send.mock.calls[0]![0].context).toEqual({
      type: "password_reset",
      id: owner.user.id,
    });
  });

  it("O-124: admin eklenen üyeye 'hesabınız açıldı' e-postası — firma adıyla, 72 sa geçerli token, sıfırlama metni YOK", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();
    const before = Date.now();
    const res = await service.requestAccountSetup(owner.user.id);
    expect(res).toEqual({ sent: true });
    const tok = await prisma.passwordResetToken.findFirstOrThrow({
      where: { companyUserId: owner.user.id, usedAt: null },
    });
    const ttlH = (tok.expiresAt.getTime() - before) / 3_600_000;
    expect(ttlH).toBeGreaterThan(71);
    expect(ttlH).toBeLessThanOrEqual(72.01);
    const arg = email.send.mock.calls[0]![0];
    expect(arg.templateData.template).toBe("notification");
    expect(arg.context).toEqual({ type: "password_reset", id: owner.user.id });
    const data = arg.templateData.data as {
      subject: string;
      paragraphs: string[];
      ctaUrl: string;
    };
    expect(data.subject).toContain(owner.company.name);
    expect(data.ctaUrl).toMatch(/reset-password\?token=[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toMatch(/sıfırlama talebinde/);
  });

  it("request: YOK olan e-posta → success ama token/e-posta YOK (enumeration-safe)", async () => {
    const { service, email } = rig();
    const res = await service.requestForCompany("yok@firma.com");
    expect(res).toEqual({ success: true });
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("request: yeni istek ESKİ kullanılmamış token'ı siler (tek aktif token)", async () => {
    const { service } = rig();
    const owner = await userWithAuth();
    await makeToken(owner.user.id);
    await service.requestForCompany(owner.user.email);
    expect(
      await prisma.passwordResetToken.count({
        where: { companyUserId: owner.user.id, usedAt: null },
      }),
    ).toBe(1);
  });

  it("confirm: geçerli token → parola güncellenir, token used, tokenVersion++", async () => {
    const { service, supabaseAuth } = rig();
    const owner = await userWithAuth();
    const before = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
      select: { tokenVersion: true },
    });
    const plain = await makeToken(owner.user.id);

    const res = await service.confirmPasswordReset(plain, "YeniParola123!");
    expect(res).toEqual({ success: true });
    expect(supabaseAuth.updatePassword).toHaveBeenCalledWith(
      `auth-${owner.user.id}`,
      "YeniParola123!",
    );
    const after = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
      select: { tokenVersion: true },
    });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    const tok = await prisma.passwordResetToken.findFirst({
      where: { companyUserId: owner.user.id },
    });
    expect(tok?.usedAt).not.toBeNull();
  });

  it("confirm: kullanılmış / süresi dolmuş / geçersiz token → Forbidden", async () => {
    const { service } = rig();
    const owner = await userWithAuth();
    const used = await makeToken(owner.user.id, { usedAt: new Date() });
    await expect(
      service.confirmPasswordReset(used, "x"),
    ).rejects.toThrow(ForbiddenException);
    const expired = await makeToken(owner.user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      service.confirmPasswordReset(expired, "x"),
    ).rejects.toThrow(/süresi/i);
    await expect(
      service.confirmPasswordReset("gecersiz-token", "x"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("confirm: eşzamanlı iki confirm — yalnız biri başarılı (atomik tek-kullanım)", async () => {
    const { service, supabaseAuth } = rig();
    const owner = await userWithAuth();
    const plain = await makeToken(owner.user.id);

    const results = await Promise.allSettled([
      service.confirmPasswordReset(plain, "Parola1!"),
      service.confirmPasswordReset(plain, "Parola2!"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    // Parola yalnız BİR kez güncellendi — yarışta ikinci set olmaz.
    expect(supabaseAuth.updatePassword).toHaveBeenCalledTimes(1);
  });

  it("confirm: Supabase parolayı reddederse (zayıf/sızmış) token YANMAZ, aynı linkle tekrar denenir (derin denetim X17)", async () => {
    const { service, supabaseAuth } = rig();
    const owner = await userWithAuth();
    const plain = await makeToken(owner.user.id);
    supabaseAuth.updatePassword.mockRejectedValueOnce(
      new BadRequestException("weak"),
    );

    await expect(
      service.confirmPasswordReset(plain, "Password123!"),
    ).rejects.toThrow(BadRequestException);
    const tok = await prisma.passwordResetToken.findFirst({
      where: { companyUserId: owner.user.id },
    });
    expect(tok?.usedAt).toBeNull();

    // İkinci deneme (güçlü parola) aynı linkle başarılı.
    await expect(
      service.confirmPasswordReset(plain, "Guclu-Parola-2026!"),
    ).resolves.toEqual({ success: true });
    const used = await prisma.passwordResetToken.findFirst({
      where: { companyUserId: owner.user.id },
    });
    expect(used?.usedAt).not.toBeNull();
  });
});
