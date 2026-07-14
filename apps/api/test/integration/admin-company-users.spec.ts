/**
 * Admin kullanıcı kurtarma (Faz 4) — şifre reset / doğrulama resend /
 * aktif-pasif / oturum düşürme / e-posta değiştirme / doğrudan ekleme.
 * Dış servisler (reset e-postası, doğrulama kodu, Supabase) mock; DB gerçek.
 */
import { AdminCompanyUsersService } from "../../src/modules/admin-companies/admin-company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";

function rig() {
  const passwordReset = {
    requestForCompany: jest.fn().mockResolvedValue({ success: true }),
  };
  const companyAuth = {
    adminResendVerificationCode: jest.fn().mockResolvedValue(undefined),
  };
  const supabase = {
    updateEmail: jest.fn().mockResolvedValue(undefined),
    createUser: jest.fn().mockResolvedValue({ authId: "auth-new-1" }),
  };
  const audit = new AuditService(prisma as never);
  const service = new AdminCompanyUsersService(
    prisma as never,
    audit,
    passwordReset as never,
    companyAuth as never,
    supabase as never,
  );
  return { service, passwordReset, companyAuth, supabase };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("kurtarma aksiyonları", () => {
  it("sendPasswordReset → reset akışı çağrılır + audit", async () => {
    const { service, passwordReset } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await service.sendPasswordReset(co.company.id, co.user.id, "admin-1");
    expect(passwordReset.requestForCompany).toHaveBeenCalledWith(
      co.user.email,
    );
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.user.password_reset_sent", entityId: co.user.id },
    });
    expect(log?.actorId).toBe("admin-1");
  });

  it("başka firmanın kullanıcısına işlem yapılamaz (scope)", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    await expect(
      service.sendPasswordReset(a.company.id, b.user.id, "admin-1"),
    ).rejects.toThrow(/bulunamadı/);
  });

  it("dropSessions → tokenVersion artar", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const before = await prisma.companyUser.findUniqueOrThrow({
      where: { id: co.user.id },
      select: { tokenVersion: true },
    });
    await service.dropSessions(co.company.id, co.user.id, "admin-1");
    const after = await prisma.companyUser.findUniqueOrThrow({
      where: { id: co.user.id },
      select: { tokenVersion: true },
    });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
  });

  it("deactivate → isActive false + oturumlar düşer; SAHIP pasifleştirilemez", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const member = await makeUser(prisma, co.company.id, ["SATISCI"]);
    const before = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
      select: { tokenVersion: true },
    });
    await service.setActive(co.company.id, member.id, false, "admin-1");
    const after = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
      select: { isActive: true, tokenVersion: true },
    });
    expect(after.isActive).toBe(false);
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    // Kurucu engeli.
    await expect(
      service.setActive(co.company.id, co.user.id, false, "admin-1"),
    ).rejects.toThrow(/sahibi devre dışı/);
    // Yeniden aktifleştirme tokenVersion artırmaz.
    await service.setActive(co.company.id, member.id, true, "admin-1");
    const re = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
      select: { isActive: true, tokenVersion: true },
    });
    expect(re.isActive).toBe(true);
    expect(re.tokenVersion).toBe(after.tokenVersion);
  });
});

describe("e-posta değiştirme + doğrudan ekleme", () => {
  it("changeEmail → Supabase + domain güncellenir, from/to audit'te", async () => {
    const { service, supabase } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    // Factory authId koymaz — Supabase köprüsü kurulmuş kullanıcıyı simüle et.
    await prisma.companyUser.update({
      where: { id: co.user.id },
      data: { authId: "auth-x1" },
    });
    const oldEmail = co.user.email;
    const res = await service.changeEmail(
      co.company.id,
      co.user.id,
      "Yeni@Firma.com",
      "admin-1",
    );
    expect(res.email).toBe("yeni@firma.com");
    expect(supabase.updateEmail).toHaveBeenCalledWith(
      "auth-x1",
      "yeni@firma.com",
    );
    const after = await prisma.companyUser.findUniqueOrThrow({
      where: { id: co.user.id },
      select: { email: true, emailVerifiedAt: true },
    });
    expect(after.email).toBe("yeni@firma.com");
    expect(after.emailVerifiedAt).not.toBeNull();
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.user.email_changed", entityId: co.user.id },
    });
    expect(log?.metadata).toMatchObject({
      from: oldEmail,
      to: "yeni@firma.com",
    });
  });

  it("changeEmail çakışan e-postayı reddeder", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const other = await makeUser(prisma, co.company.id, ["SATISCI"]);
    await expect(
      service.changeEmail(co.company.id, co.user.id, other.email, "admin-1"),
    ).rejects.toThrow(/başka bir kullanıcıda/);
  });

  it("addUser → Supabase hesabı + üye + şifre kurma e-postası; çakışma 409; SAHIP atanamaz", async () => {
    const { service, supabase, passwordReset } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const res = await service.addUser(
      co.company.id,
      {
        email: "eklenen@firma.com",
        firstName: "Yeni",
        lastName: "Üye",
        role: "SATIN_ALMACI",
      },
      "admin-1",
    );
    expect(supabase.createUser).toHaveBeenCalled();
    expect(passwordReset.requestForCompany).toHaveBeenCalledWith(
      "eklenen@firma.com",
    );
    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { id: res.userId },
      select: {
        roles: true,
        emailVerifiedAt: true,
        companyId: true,
        authId: true,
      },
    });
    expect(user.roles).toEqual(["SATIN_ALMACI"]);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.companyId).toBe(co.company.id);
    expect(user.authId).toBe("auth-new-1");
    // Aynı e-posta → çakışma.
    await expect(
      service.addUser(
        co.company.id,
        {
          email: "eklenen@firma.com",
          firstName: "X",
          lastName: "Y",
          role: "SATISCI",
        },
        "admin-1",
      ),
    ).rejects.toThrow(/zaten bir kullanıcı/);
    // SAHIP doğrudan atanamaz.
    await expect(
      service.addUser(
        co.company.id,
        {
          email: "sahip@firma.com",
          firstName: "S",
          lastName: "S",
          role: "SAHIP",
        },
        "admin-1",
      ),
    ).rejects.toThrow(/Geçersiz rol/);
  });
});

describe("list — telefon PII response'ta yok (fazla-açığa-çıkarma kırpıldı)", () => {
  it("phone anahtarı dönmez; email/ad döner", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    // Kullanıcıya telefon yaz — DB'de var ama response'a sızmamalı.
    await prisma.companyUser.update({
      where: { id: co.user.id },
      data: { phone: "5551112233" },
    });
    const rows = await service.list(co.company.id);
    expect(rows).toHaveLength(1);
    const u = rows[0]!;
    expect(u).not.toHaveProperty("phone");
    expect(u.email).toBe(co.user.email);
    expect(u).toHaveProperty("firstName");
    expect(u).toHaveProperty("lastName");
  });
});
