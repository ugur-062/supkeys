/**
 * Admin kullanıcı kurtarma (Faz 4) — şifre reset / doğrulama resend /
 * aktif-pasif / oturum düşürme / e-posta değiştirme / doğrudan ekleme.
 * Dış servisler (reset e-postası, doğrulama kodu, Supabase) mock; DB gerçek.
 */
import { AdminCompanyUsersService } from "../../src/modules/admin-companies/admin-company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";
import { permissionsForRoles } from "@rothern/shared";

function rig() {
  const passwordReset = {
    requestForCompany: jest.fn().mockResolvedValue({ success: true }),
    requestAccountSetup: jest.fn().mockResolvedValue({ sent: true }),
  };
  const companyAuth = {
    adminResendVerificationCode: jest.fn().mockResolvedValue(undefined),
  };
  const supabase = {
    updateEmail: jest.fn().mockResolvedValue(undefined),
    createUser: jest.fn().mockResolvedValue({ authId: "auth-new-1" }),
    deleteUser: jest.fn().mockResolvedValue(undefined),
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

  it("O-064: doğrulama kodu gönderilemezse (tavan/hata) hata yükselir ve audit YAZILMAZ", async () => {
    const { service, companyAuth } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const capped = Object.assign(new Error("too many"), { status: 429 });
    companyAuth.adminResendVerificationCode.mockRejectedValueOnce(capped);
    await expect(
      service.resendVerification(co.company.id, co.user.id, "admin-1"),
    ).rejects.toBe(capped);
    expect(
      await prisma.auditLog.count({
        where: { action: "admin.user.verification_resent", entityId: co.user.id },
      }),
    ).toBe(0);
    // Başarıda audit firma kimliğiyle (tenantId) yazılır.
    await service.resendVerification(co.company.id, co.user.id, "admin-1");
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.user.verification_resent", entityId: co.user.id },
    });
    expect(log?.tenantId).toBe(co.company.id);
  });

  it("D-205: kullanıcı işlemleri firma kimliğiyle yazılır, firma id'siyle aramada bulunur", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const other = await makeCompanyWithUser(prisma, {});
    await service.dropSessions(co.company.id, co.user.id, "admin-1");
    await service.dropSessions(other.company.id, other.user.id, "admin-1");
    const audit = new AuditService(prisma as never);
    const res = await audit.query({ search: co.company.id });
    const actions = res.items.map((i) => [i.action, i.entityId]);
    expect(actions).toContainEqual(["admin.user.sessions_dropped", co.user.id]);
    expect(actions).not.toContainEqual([
      "admin.user.sessions_dropped",
      other.user.id,
    ]);
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
    // O-124: sıfırlama değil "hesabınız açıldı" e-postası (yeni kullanıcı id'si).
    expect(passwordReset.requestAccountSetup).toHaveBeenCalledWith(res.userId);
    expect(passwordReset.requestForCompany).not.toHaveBeenCalled();
    expect(res.emailSent).toBe(true);
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

describe("koltuk kapısı admin yolunda da (derin denetim MU-04)", () => {
  it("Aktifleştir: dolu firmada koltuk taşıyan pasif kişi geri açılamaz; koltuksuz kişi açılır", async () => {
    const { service } = rig();
    // SILVER limit 4: Kurucu ST (1; satınalma koltuğu Gold altında sayılmaz)
    // + üç satışçı (3) = 4/4.
    const co = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    await prisma.company.update({
      where: { id: co.company.id },
      data: { membershipEndAt: new Date(Date.now() + 30 * 86400_000) },
    });
    await makeUser(prisma, co.company.id, ["SATISCI"]);
    await makeUser(prisma, co.company.id, ["SATISCI"]);
    await makeUser(prisma, co.company.id, ["SATISCI"]);
    const passive = await makeUser(prisma, co.company.id, ["SATISCI"], {
      isActive: false,
    });
    await expect(
      service.setActive(co.company.id, passive.id, true, "admin-1"),
    ).rejects.toThrow(/Koltuk dolu \(4\/4\)/);
    const still = await prisma.companyUser.findUniqueOrThrow({
      where: { id: passive.id },
      select: { isActive: true },
    });
    expect(still.isActive).toBe(false);
    // Koltuksuz (yalnız onaylayıcı) kişi koltuk tüketmez → açılır.
    const approver = await makeUser(prisma, co.company.id, ["ONAYLAYICI"], {
      isActive: false,
    });
    await service.setActive(co.company.id, approver.id, true, "admin-1");
    const re = await prisma.companyUser.findUniqueOrThrow({
      where: { id: approver.id },
      select: { isActive: true },
    });
    expect(re.isActive).toBe(true);
  });

  it("Aktifleştir: Gold olmayan firmada satın almacı geri açılamaz (paket kapısı)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"],
    });
    const buyer = await makeUser(prisma, co.company.id, ["SATIN_ALMACI"], {
      isActive: false,
    });
    await expect(
      service.setActive(co.company.id, buyer.id, true, "admin-1"),
    ).rejects.toThrow(/yalnız Gold/);
  });

  it("addUser: Gold olmayan firmaya Satın Almacı eklenemez; Supabase hesabı açılmaz", async () => {
    const { service, supabase } = rig();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"],
    });
    await expect(
      service.addUser(
        co.company.id,
        { email: "alici@firma.com", firstName: "A", lastName: "B", role: "SATIN_ALMACI" },
        "admin-1",
      ),
    ).rejects.toThrow(/yalnız Gold/);
    expect(supabase.createUser).not.toHaveBeenCalled();
    expect(
      await prisma.companyUser.count({ where: { email: "alici@firma.com" } }),
    ).toBe(0);
  });

  it("addUser: bekleyen koltuk daveti koltuk sayımına girer", async () => {
    const { service, supabase } = rig();
    // STANDART limit 2: Kurucu satış koltuğu (1) + bekleyen satışçı daveti (1).
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"],
    });
    await prisma.companyUserInvitation.create({
      data: {
        companyId: co.company.id,
        email: "davetli@firma.com",
        roles: ["SATISCI"],
        permissions: permissionsForRoles(["SATISCI"]),
        token: "tok-mu04-" + Date.now(),
        invitedById: co.user.id,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await expect(
      service.addUser(
        co.company.id,
        { email: "satis@firma.com", firstName: "S", lastName: "T", role: "SATISCI" },
        "admin-1",
      ),
    ).rejects.toThrow(/bekleyen davet/);
    expect(supabase.createUser).not.toHaveBeenCalled();
    // Koltuksuz rol (Onaylayıcı) kapıya takılmaz.
    await service.addUser(
      co.company.id,
      { email: "onay@firma.com", firstName: "O", lastName: "N", role: "ONAYLAYICI" },
      "admin-1",
    );
    expect(supabase.createUser).toHaveBeenCalledTimes(1);
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

  // Arayüz testi son tur api-2: rolsüz Görüntüleyici üyenin izinleri döner —
  // admin Rol sütunu "—" yerine "Görüntüleyici" yazabilsin.
  it("permissions döner (rolsüz görüntüleyici ayırt edilir)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await prisma.companyUser.update({
      where: { id: co.user.id },
      data: { roles: [], permissions: ["buy:view", "sell:view", "buy:reports:view"] },
    });
    const [u] = await service.list(co.company.id);
    expect(u!.roles).toEqual([]);
    expect(u!.permissions).toEqual(["buy:view", "sell:view", "buy:reports:view"]);
  });
});
