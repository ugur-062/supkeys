/**
 * Firma Sahibi (SAHIP) rol modeli + sahiplik devri. Kurucu = görünür SAHIP;
 * sahiplik tek kişi, yalnız devirle aktarılır; SAHIP ⊇ Yönetici.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import {
  hasCompanyPermission,
} from "../../src/modules/company-auth/permissions/company-permissions.constants";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";

let authSeq = 0;
function makeUsersService() {
  const supabase = {
    createUser: jest.fn(async () => ({ authId: `auth-${authSeq++}` })),
    deleteUser: jest.fn(async () => undefined),
  };
  const companyAuth = {
    createSession: jest.fn(async (userId: string) => ({ token: "t", user: { id: userId } })),
  };
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyUsersService(
    prisma as never,
    supabase as never,
    companyAuth as never,
    email as never,
    config as never,
  );
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Firma Sahibi rolü + izinler", () => {
  it("kurucu SAHIP rolü + sahibe-özel izinlere sahip; op-roller ayrı", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(u.roles).toContain(CompanyRole.SAHIP);
    // SAHIP ⊇ Yönetici + sahibe-özel.
    expect(hasCompanyPermission(u.roles, true, "billing:manage")).toBe(true);
    expect(hasCompanyPermission(u.roles, true, "company:delete")).toBe(true);
    expect(hasCompanyPermission(u.roles, true, "users:manage")).toBe(true);
    // Salt YONETICI'de sahibe-özel YOK.
    expect(
      hasCompanyPermission([CompanyRole.YONETICI], false, "billing:manage"),
    ).toBe(false);
  });
});

describe("Sahiplik devri (updateRoles)", () => {
  it("davetle SAHIP verilemez", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    await expect(
      svc.invite(owner.auth, {
        email: "x@firma.test",
        roles: [CompanyRole.SAHIP],
      } as never),
    ).rejects.toThrow(/sahipliği davetle|devredin/i);
  });

  it("SAHIP + Yönetici birlikte reddedilir (SAHIP ⊇ Yönetici)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await expect(
      svc.updateRoles(owner.auth, member.id, {
        roles: [CompanyRole.SAHIP, CompanyRole.YONETICI],
      } as never),
    ).rejects.toThrow(/yalnızca Satın Almacı/i);
  });

  it("sahip başka kullanıcıya devreder → yeni sahip SAHIP, eski Yönetici'ye düşer", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma); // [SAHIP, SATIN_ALMACI, SATISCI]
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);

    await svc.updateRoles(owner.auth, member.id, {
      roles: [CompanyRole.SAHIP, CompanyRole.SATISCI],
    } as never);

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(company.ownerUserId).toBe(member.id); // sahiplik geçti

    const newOwner = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(newOwner.roles).toContain(CompanyRole.SAHIP);

    const oldOwner = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(oldOwner.roles).not.toContain(CompanyRole.SAHIP);
    expect(oldOwner.roles).toContain(CompanyRole.YONETICI); // yönetim kalır
    expect(oldOwner.roles).toContain(CompanyRole.SATIN_ALMACI); // op-rol korunur
  });

  it("sahip olmayan kullanıcı SAHIP veremez (devredemez)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const manager = await makeUser(prisma, owner.company.id, [
      CompanyRole.YONETICI,
    ]);
    const managerAuth = {
      userId: manager.id,
      companyId: owner.company.id,
      email: manager.email,
      roles: [CompanyRole.YONETICI],
      isOwner: false,
    } as AuthenticatedCompanyUser;
    const target = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await expect(
      svc.updateRoles(managerAuth, target.id, {
        roles: [CompanyRole.SAHIP],
      } as never),
    ).rejects.toThrow(/mevcut firma sahibi/i);
  });

  it("sahip, devretmeden SAHIP rolünü bırakamaz", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    // Başka bir aktif Yönetici olsun ki son-yönetici kuralına takılmasın.
    await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    await expect(
      svc.updateRoles(owner.auth, owner.user.id, {
        roles: [CompanyRole.SATIN_ALMACI],
      } as never),
    ).rejects.toThrow(/devret/i);
  });
});
