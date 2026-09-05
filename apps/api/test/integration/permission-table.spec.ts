/**
 * Yetki tablosu Faz 4 (2026-09-06) — kişi başına AÇIK izin listesi yazma
 * (`setPermissions`) ve izinli davet (`invite` + `acceptInvitation`).
 *
 * Kurallar: kimse kendi satırını düzenleyemez (Kurucu hariç); "Kullanıcı ve
 * yetki" tikini yalnız Kurucu verir; işlem tiki koltuk kapısından geçer;
 * Kurucu satırında yalnız işlem tikleri yazılır; roller listeden türetilir;
 * her değişiklik denetim kaydı + kişiye bildirim; davet/kabul iz bırakır.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";

function makeUsersService() {
  const supabase = {
    createUser: jest.fn().mockResolvedValue({ authId: `auth-${Date.now()}-${Math.random()}` }),
    deleteUser: jest.fn(),
  };
  const companyAuth = { createSession: jest.fn().mockResolvedValue({ token: "t" }) };
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyUsersService(
    prisma as never,
    supabase as never,
    companyAuth as never,
    email as never,
    config as never,
    new AuditService(prisma as never),
    new NotificationService(prisma as never),
  );
}

function authFor(
  u: { id: string; email: string },
  companyId: string,
  roles: CompanyRole[],
  isOwner = false,
) {
  return {
    userId: u.id,
    companyId,
    email: u.email,
    roles,
    country: "TR",
    tier: "GOLD",
    isOwner,
    companyVerificationStatus: "VERIFIED",
  } as never;
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("setPermissions — kişi başına açık liste", () => {
  it("Kurucu bir Satın Almacı'yı görüntüleyiciye indirir: liste yazılır, roller türetilir, koltuk boşalır, iz + bildirim", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { tier: "BRONZ" });
    const sa = await makeUser(prisma, owner.company.id, [CompanyRole.SATIN_ALMACI]);
    const before = await svc.seatUsage(owner.company.id);
    expect(before.used).toBe(2); // kurucu (SA+ST) + sa

    const res = await svc.setPermissions(owner.auth, sa.id, [
      "buy:view",
      "buy:reports:view",
    ]);
    expect(res.roles).toEqual([]);
    expect(res.permissions).toEqual(["buy:view", "buy:reports:view"]);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: sa.id } });
    expect(row.roles).toEqual([]);
    expect(row.permissions).toEqual(["buy:view", "buy:reports:view"]);
    expect((await svc.seatUsage(owner.company.id)).used).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "company.user.permissions_changed", entityId: sa.id },
    });
    expect(audit?.metadata).toMatchObject({
      after: ["buy:view", "buy:reports:view"],
      rolesAfter: [],
    });
    expect((audit?.metadata as { removed: string[] }).removed).toContain("buy:listing:manage");
    const notif = await prisma.notification.findFirst({
      where: { companyUserId: sa.id, type: "permissions_changed" },
    });
    expect(notif).not.toBeNull();
  });

  it("işlem tiki eklemek koltuk ister: Bronz'da koltuk doluyken onaylayıcıya 'Teklif verme' 400", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { tier: "BRONZ" }); // 1 koltuk
    await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]); // 2/2
    const approver = await makeUser(prisma, owner.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(
      svc.setPermissions(owner.auth, approver.id, ["approval:act", "sell:bid:submit"]),
    ).rejects.toThrow(/Koltuk dolu/);
    // Koltuksuz tik (görüntüleme) geçer; işlem tiki görüntülemeyi örtük ekler.
    const res = await svc.setPermissions(owner.auth, approver.id, ["approval:act", "sell:view"]);
    expect(res.permissions).toEqual(["sell:view", "approval:act"]);
    expect(res.roles).toEqual(["ONAYLAYICI"]);
  });

  it("'Kullanıcı ve yetki' tikini yalnız Kurucu verir; Yönetici diğer tikleri dağıtır ve kaldırabilir", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { roles: ["SAHIP"] as never });
    const manager = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    const managerAuth = authFor(manager, owner.company.id, [CompanyRole.YONETICI]);
    const st = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await expect(
      svc.setPermissions(managerAuth, st.id, ["sell:view", "sell:bid:submit", "users:manage"]),
    ).rejects.toThrow(/yalnızca Kurucu verebilir/);
    // Yönetici: firma ayarları + bağlantılar verebilir.
    const res = await svc.setPermissions(managerAuth, st.id, [
      "sell:bid:submit",
      "company:manage",
      "connections:manage",
    ]);
    expect(res.permissions).toEqual(["sell:view", "sell:bid:submit", "company:manage", "connections:manage"]);
    expect(res.roles).toEqual(["YONETICI", "SATISCI"]);
    // Kurucu verir.
    const res2 = await svc.setPermissions(owner.auth, st.id, ["sell:bid:submit", "users:manage"]);
    expect(res2.permissions).toContain("users:manage");
    // Yönetici KALDIRABİLİR (son yetki sahibi koruması: Kurucu + manager kalır).
    const res3 = await svc.setPermissions(managerAuth, st.id, ["sell:bid:submit"]);
    expect(res3.permissions).not.toContain("users:manage");
  });

  it("kimse kendi satırını düzenleyemez (Kurucu hariç); Kurucu satırında yalnız işlem tikleri yazılır", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const manager = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    const managerAuth = authFor(manager, owner.company.id, [CompanyRole.YONETICI]);
    await expect(
      svc.setPermissions(managerAuth, manager.id, ["users:manage", "buy:listing:manage"]),
    ).rejects.toThrow(/Kendi yetkilerinizi düzenleyemezsiniz/);
    // Yönetici Kurucuya dokunamaz.
    await expect(
      svc.setPermissions(managerAuth, owner.user.id, ["buy:view"]),
    ).rejects.toThrow(/Kurucunun izinleri kısıtlanamaz/);
    // Kurucu kendi satırında koltuğunu bırakır: yalnız satış işlemi kalır;
    // yönetim/onay/görüntüleme örtük (listede saklanmaz, efektifte var).
    const res = await svc.setPermissions(owner.auth, owner.user.id, [
      "sell:bid:submit",
      "users:manage",
      "buy:view",
    ]);
    expect(res.permissions).toEqual(["sell:view", "sell:bid:submit"]);
    expect(res.roles).toEqual(["SAHIP", "SATISCI"]);
    const { effectivePermissions } = await import(
      "../../src/modules/company-auth/permissions/company-permissions.constants"
    );
    const eff = effectivePermissions({ isOwner: true, permissions: res.permissions, roles: res.roles });
    expect(eff).toEqual(expect.arrayContaining(["users:manage", "approval:act", "buy:view", "billing:manage"]));
    expect(eff).not.toContain("buy:listing:manage");
  });

  it("geçersiz/ölü anahtar 400; eski anahtar yenisine eşlenir", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const u = await makeUser(prisma, owner.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(svc.setPermissions(owner.auth, u.id, ["sell:award"])).rejects.toThrow(/Geçersiz izin/);
    const res = await svc.setPermissions(owner.auth, u.id, ["buy:listing:create"]);
    expect(res.permissions).toEqual(["buy:view", "buy:listing:manage"]);
    expect(res.roles).toEqual(["SATIN_ALMACI"]);
  });
});

describe("invite — davet AÇIK izin listesi taşır", () => {
  it("Yönetici izinle davet eder: roller türetilir, davet iz bırakır; kabulde liste kişiye yazılır + iz", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { roles: ["SAHIP"] as never });
    const manager = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    const managerAuth = authFor(manager, owner.company.id, [CompanyRole.YONETICI]);
    const inv = await svc.invite(managerAuth, {
      email: "yeni@firma.test",
      permissions: ["sell:bid:submit", "sell:inquiry:reply", "connections:manage"],
    } as never);
    const row = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.roles).toEqual(["SATISCI"]);
    expect(row.permissions).toEqual(["sell:view", "sell:bid:submit", "sell:inquiry:reply", "connections:manage"]);
    const invited = await prisma.auditLog.findFirst({
      where: { action: "company.user.invited", entityId: inv.id },
    });
    expect(invited?.actorId).toBe(manager.id);
    expect(JSON.stringify(invited?.metadata)).not.toContain("yeni@firma.test");

    await svc.acceptInvitation(row.token, {
      firstName: "Yeni",
      lastName: "Üye",
      password: "Sifre-1234!x",
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
    } as never);
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "yeni@firma.test" } });
    expect(user.permissions).toEqual(row.permissions);
    expect(user.roles).toEqual(["SATISCI"]);
    const accepted = await prisma.auditLog.findFirst({
      where: { action: "company.user.invitation_accepted", entityId: user.id },
    });
    expect(accepted?.metadata).toMatchObject({ invitationId: inv.id, invitedById: manager.id });
  });

  it("Yönetici 'Kullanıcı ve yetki' ile davet EDEMEZ; Kurucu eder; boş liste 400; eski istemci rol seti hâlâ çalışır", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { roles: ["SAHIP"] as never });
    const manager = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    const managerAuth = authFor(manager, owner.company.id, [CompanyRole.YONETICI]);
    await expect(
      svc.invite(managerAuth, { email: "a@firma.test", permissions: ["users:manage"] } as never),
    ).rejects.toThrow(/yalnızca Kurucu verebilir/);
    await expect(
      svc.invite(managerAuth, { email: "b@firma.test", permissions: [] } as never),
    ).rejects.toThrow(/En az bir yetki/);
    const ok = await svc.invite(owner.auth, { email: "c@firma.test", permissions: ["users:manage"] } as never);
    expect((await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: ok.id } })).roles).toEqual(["YONETICI"]);
    // Eski istemci: roles ile davet → hazır set.
    const legacy = await svc.invite(owner.auth, { email: "d@firma.test", roles: ["ONAYLAYICI"] } as never);
    expect((await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: legacy.id } })).permissions).toEqual(["approval:act"]);
  });
});
