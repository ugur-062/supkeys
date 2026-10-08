/**
 * Self-service şifre sıfırlama — token üretimi (enumeration-safe, tek-aktif),
 * confirm (tek-kullanım/expiry/geçersiz → Forbidden, tokenVersion++), atomik
 * yarış koruması (iki eşzamanlı confirm → parola yalnız bir kez set edilir).
 */
import * as crypto from "node:crypto";
import { BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
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
    // Sıfırlama bağlantısı hesap kurulum ipucu taşımaz.
    expect(email.send.mock.calls[0]![0].templateData.data.resetUrl).toMatch(
      /reset-password\?token=[0-9a-f]{64}$/,
    );
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
    // `setup=1`: sayfa "Şifreni belirle" metnini gösterir (yeniden doğrulama).
    expect(data.ctaUrl).toMatch(/reset-password\?token=[0-9a-f]{64}&setup=1$/);
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

/**
 * login-16 (arayüz testi 2026-10): kullanılmış ya da yenisiyle değiştirilmiş
 * bağlantı tam formu gösteriyor, kullanıcı ölü olduğunu yeni şifreyi iki kez
 * yazıp gönderince öğreniyordu. `checkResetToken` sayfa açılırken sorulur:
 * confirm ile AYNI kurallar, ama hiçbir şey yazmaz.
 */
describe("PasswordResetService.checkResetToken — salt okuma (login-16)", () => {
  it("geçerli bağlantı → valid: true; token TÜKETİLMEZ, sonra confirm çalışır", async () => {
    const { service, supabaseAuth } = rig();
    const owner = await userWithAuth();
    const plain = await makeToken(owner.user.id);
    const before = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
      select: { tokenVersion: true },
    });

    // Kaç kez sorulursa sorulsun aynı yanıt.
    for (let i = 0; i < 3; i++) {
      expect(await service.checkResetToken(plain)).toEqual({ valid: true });
    }
    const tok = await prisma.passwordResetToken.findFirstOrThrow({
      where: { companyUserId: owner.user.id },
    });
    expect(tok.usedAt).toBeNull();
    expect(supabaseAuth.updatePassword).not.toHaveBeenCalled();
    expect(
      (await prisma.companyUser.findUniqueOrThrow({ where: { id: owner.user.id } })).tokenVersion,
    ).toBe(before.tokenVersion);

    await expect(service.confirmPasswordReset(plain, "Guclu-Parola-2026!")).resolves.toEqual({
      success: true,
    });
    // Kullanılan bağlantı artık geçersiz.
    expect(await service.checkResetToken(plain)).toEqual({
      valid: false,
      message: "Bu bağlantı zaten kullanılmış",
    });
  });

  it("bilinmeyen / kullanılmış / süresi dolmuş bağlantı → valid: false (confirm'ün metniyle)", async () => {
    const { service } = rig();
    const owner = await userWithAuth();
    const used = await makeToken(owner.user.id, { usedAt: new Date() });
    const expired = await makeToken(owner.user.id, { expiresAt: new Date(Date.now() - 1000) });

    const cases: Array<[string, string]> = [
      ["hic-uretilmemis-token", "Geçersiz veya kullanılmış bağlantı"],
      ["", "Geçersiz veya kullanılmış bağlantı"],
      [used, "Bu bağlantı zaten kullanılmış"],
      [expired, "Bağlantının süresi dolmuş"],
    ];
    for (const [token, message] of cases) {
      expect(await service.checkResetToken(token)).toEqual({ valid: false, message });
      // confirm aynı bağlantıyı aynı nedenle reddeder (tek kural kaynağı).
      await expect(service.confirmPasswordReset(token, "Guclu-Parola-2026!")).rejects.toMatchObject({
        status: 403,
        response: { message },
      });
    }
  });

  it("yenisiyle DEĞİŞTİRİLEN bağlantı geçersiz, yeni bağlantı geçerli", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();
    const tokenOf = (call: number) =>
      /token=([0-9a-f]{64})/.exec(
        email.send.mock.calls[call]![0].templateData.data.resetUrl as string,
      )![1]!;

    await service.requestForCompany(owner.user.email);
    const first = tokenOf(0);
    expect(await service.checkResetToken(first)).toEqual({ valid: true });

    await service.requestForCompany(owner.user.email);
    const second = tokenOf(1);
    expect(second).not.toBe(first);
    expect(await service.checkResetToken(first)).toEqual({
      valid: false,
      message: "Geçersiz veya kullanılmış bağlantı",
    });
    expect(await service.checkResetToken(second)).toEqual({ valid: true });
  });

  it("pasif ya da Supabase'e bağlı olmayan hesabın bağlantısı geçersiz (confirm ile aynı)", async () => {
    const { service } = rig();
    const passive = await userWithAuth();
    const passiveToken = await makeToken(passive.user.id);
    await prisma.companyUser.update({ where: { id: passive.user.id }, data: { isActive: false } });
    expect(await service.checkResetToken(passiveToken)).toMatchObject({ valid: false });
    await expect(service.confirmPasswordReset(passiveToken, "x")).rejects.toThrow(ForbiddenException);

    const unlinked = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.companyUser.update({ where: { id: unlinked.user.id }, data: { authId: null } });
    const unlinkedToken = await makeToken(unlinked.user.id);
    expect(await service.checkResetToken(unlinkedToken)).toMatchObject({ valid: false });
    await expect(service.confirmPasswordReset(unlinkedToken, "x")).rejects.toThrow(ForbiddenException);
  });
});

/**
 * login-14 (arayüz testi 2026-10): "şifremi unuttum" kayıtlı adreste token +
 * e-posta işini yanıttan ÖNCE bekliyordu; yanıt süresi adresin kayıtlı olup
 * olmadığını ele veriyordu (yerelde ~75 ms'ye karşı ~13 ms). Herkese açık uç
 * artık `requestForCompanyInBackground` çağırır: yanıt hemen, iş arkada.
 */
describe("PasswordResetService.requestForCompanyInBackground (login-14)", () => {
  /** Dışarıdan açılan kapı — "iş hâlâ sürüyor" anını sabitlemek için. */
  function gate() {
    let open!: () => void;
    const closed = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { closed, open };
  }

  it("yanıt token ve e-posta işi BİTMEDEN döner; iş arkada tamamlanır", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();
    const mail = gate();
    email.send.mockImplementation(async () => {
      await mail.closed;
      return { emailLogId: "t", sent: true };
    });

    // Eşzamanlı (Promise değil) yanıt: çağıran hiçbir şeyi bekleyemez.
    const res = service.requestForCompanyInBackground(owner.user.email);
    expect(res).toEqual({ success: true });
    expect(email.send).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count()).toBe(0);

    // E-posta sağlayıcısı yanıt vermeden iş bitmez; kapı açılınca biter.
    let idle = false;
    const done = service.whenIdle().then(() => {
      idle = true;
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(idle).toBe(false);
    expect(email.send).toHaveBeenCalledTimes(1);
    mail.open();
    await done;

    expect(
      await prisma.passwordResetToken.count({
        where: { companyUserId: owner.user.id, usedAt: null },
      }),
    ).toBe(1);
    expect(email.send.mock.calls[0]![0].templateData.data.resetUrl).toMatch(
      /reset-password\?token=[0-9a-f]{64}$/,
    );
  });

  it("kayıtlı ve kayıtsız adres AYNI yanıtı, aynı anda alır; kayıtsızda hiçbir şey üretilmez", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();

    const known = service.requestForCompanyInBackground(owner.user.email);
    const unknown = service.requestForCompanyInBackground("yok@firma.com");
    expect(known).toEqual(unknown);
    expect(known).toEqual({ success: true });

    await service.whenIdle();
    expect(await prisma.passwordResetToken.count()).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0]![0].to.email).toBe(owner.user.email);
  });

  it("arkadaki hata yanıtı bozmaz: loglanır (adres maskeli), reddedilmemiş söz bırakmaz", async () => {
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    try {
      const email = { send: jest.fn() };
      const broken = {
        companyUser: { findFirst: jest.fn().mockRejectedValue(new Error("db connection lost")) },
      };
      const service = new PasswordResetService(
        broken as never,
        email as never,
        { get: jest.fn() } as never,
        { updatePassword: jest.fn() } as never,
      );

      expect(service.requestForCompanyInBackground("Kisi@Firma.com")).toEqual({ success: true });
      await expect(service.whenIdle()).resolves.toBeUndefined();

      expect(email.send).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = String(errorSpy.mock.calls[0]![0]);
      expect(line).toContain("db connection lost");
      expect(line).toContain("k***@firma.com");
      expect(line).not.toContain("kisi@firma.com");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("süreç kapanırken (onModuleDestroy) süren iş beklenir", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();
    const mail = gate();
    email.send.mockImplementation(async () => {
      await mail.closed;
      return { emailLogId: "t", sent: true };
    });

    service.requestForCompanyInBackground(owner.user.email);
    let destroyed = false;
    const destroy = service.onModuleDestroy().then(() => {
      destroyed = true;
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(destroyed).toBe(false);
    mail.open();
    await destroy;
    expect(destroyed).toBe(true);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("admin yolu (requestForCompany) eskisi gibi BEKLER", async () => {
    const { service, email } = rig();
    const owner = await userWithAuth();
    await service.requestForCompany(owner.user.email);
    // Beklenen çağrı döndüğünde iş bitmiştir; arkada bir şey kalmaz.
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });
});
