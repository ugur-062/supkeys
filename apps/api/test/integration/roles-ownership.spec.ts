/**
 * Firma Sahibi (SAHIP) rol modeli + sahiplik devri. Kurucu = görünür SAHIP;
 * sahiplik tek kişi, yalnız devirle aktarılır; SAHIP ⊇ Yönetici.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
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
    new AuditService(prisma as never),
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
    // Kurucu (SAHIP) = TAM YETKİ: yönetim + sahibe-özel + tüm operasyonlar.
    expect(hasCompanyPermission(u.roles, true, "billing:manage")).toBe(true);
    expect(hasCompanyPermission(u.roles, true, "company:delete")).toBe(true);
    expect(hasCompanyPermission(u.roles, true, "users:manage")).toBe(true);
    // Operasyon izinleri de var (ilan açma + teklif verme).
    expect(hasCompanyPermission(u.roles, true, "sell:bid:submit")).toBe(true);
    expect(hasCompanyPermission(u.roles, true, "buy:listing:create")).toBe(true);
    expect(hasCompanyPermission(u.roles, true, "sell:listing:create")).toBe(true);
    // Salt YONETICI'de sahibe-özel + operasyon YOK.
    expect(
      hasCompanyPermission([CompanyRole.YONETICI], false, "billing:manage"),
    ).toBe(false);
    expect(
      hasCompanyPermission([CompanyRole.YONETICI], false, "sell:bid:submit"),
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
    ).rejects.toThrow(/tam yetkili|birleştirilemez|ayrı rol/i);
  });

  it("kuruculuk devri → yeni Kurucu [SAHIP], eski Kurucu Yönetici'ye düşer", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma); // [SAHIP]
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);

    // Kurucu tam yetkilidir; ek rol taşımaz → yalnız SAHIP gönderilir.
    await svc.updateRoles(owner.auth, member.id, {
      roles: [CompanyRole.SAHIP],
    } as never);

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(company.ownerUserId).toBe(member.id); // kuruculuk geçti

    const newOwner = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(newOwner.roles).toEqual([CompanyRole.SAHIP]); // tek başına

    const oldOwner = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(oldOwner.roles).not.toContain(CompanyRole.SAHIP);
    expect(oldOwner.roles).toContain(CompanyRole.YONETICI); // varsayılan yönetim
  });

  it("devirde eski Kurucu kendi yeni rolünü seçer (previousOwnerRoles)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma); // [SAHIP]
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    // Eski Kurucu operasyon tarafında kalmak istiyor → Satın Almacı+Satışçı.
    await svc.updateUser(owner.auth, member.id, {
      roles: [CompanyRole.SAHIP],
      previousOwnerRoles: [CompanyRole.SATIN_ALMACI, CompanyRole.SATISCI],
    } as never);

    const oldOwner = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(oldOwner.roles.sort()).toEqual(
      [CompanyRole.SATIN_ALMACI, CompanyRole.SATISCI].sort(),
    );
    expect(oldOwner.roles).not.toContain(CompanyRole.YONETICI);
  });

  it("Faz R: devirde eski Kurucu Yönetici+op kombosunu SEÇEBİLİR (münhasırlık kalktı)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await svc.updateUser(owner.auth, member.id, {
      roles: [CompanyRole.SAHIP],
      previousOwnerRoles: [CompanyRole.YONETICI, CompanyRole.SATISCI],
    } as never);
    const oldOwner = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(oldOwner.roles.sort()).toEqual(
      [CompanyRole.SATISCI, CompanyRole.YONETICI].sort(),
    );
  });

  it("Faz R: devirde SAHIP+YONETICI kombosu yine reddedilir (etiket etiketle birleşmez)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await expect(
      svc.updateUser(owner.auth, member.id, {
        roles: [CompanyRole.SAHIP, CompanyRole.YONETICI],
      } as never),
    ).rejects.toThrow(/birleştirilemez/i);
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
    ).rejects.toThrow(/mevcut Kurucu/i);
  });

  it("sahip SAHIP'siz küme gönderse de etiket korunur (bırakma yalnız devirle)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    // Başka bir aktif Yönetici olsun ki son-yönetici kuralına takılmasın.
    await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    // Sahiplik normalizasyonu (2026-07-27): red yerine SAHIP sessizce korunur;
    // bırakmanın tek yolu devir akışı.
    await svc.updateRoles(owner.auth, owner.user.id, {
      roles: [CompanyRole.SATIN_ALMACI],
    } as never);
    const kept = await prisma.companyUser.findUnique({
      where: { id: owner.user.id },
      select: { roles: true },
    });
    expect(kept?.roles).toEqual(
      expect.arrayContaining(["SAHIP", "SATIN_ALMACI"]),
    );
  });
});

describe("Onay-netliği: YONETICI+ONAYLAYICI kombo engeli", () => {
  it("YONETICI+ONAYLAYICI ataması reddedilir (Yönetici zaten onay verebilir)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);
    await expect(
      svc.updateRoles(owner.auth, member.id, {
        roles: [CompanyRole.YONETICI, CompanyRole.ONAYLAYICI],
      } as never),
    ).rejects.toThrow(/zaten onay verebilir/);
  });

  it("SAHIP+ONAYLAYICI da reddedilir (mevcut SAHIP-dal kanıtı)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await expect(
      svc.updateUser(owner.auth, member.id, {
        roles: [CompanyRole.SAHIP, CompanyRole.ONAYLAYICI],
      } as never),
    ).rejects.toThrow(/birleştirilemez/);
  });

  it("REGRESYON NÖBETÇİSİ: SATIN_ALMACI+ONAYLAYICI GEÇER (satın alma müdürü deseni); salt ONAYLAYICI geçer", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await svc.updateRoles(owner.auth, member.id, {
      roles: [CompanyRole.SATIN_ALMACI, CompanyRole.ONAYLAYICI],
    } as never);
    const after = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(after.roles.sort()).toEqual(
      [CompanyRole.ONAYLAYICI, CompanyRole.SATIN_ALMACI].sort(),
    );
    await svc.updateRoles(owner.auth, member.id, {
      roles: [CompanyRole.ONAYLAYICI],
    } as never);
    const solo = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(solo.roles).toEqual([CompanyRole.ONAYLAYICI]);
  });
});

describe("Denetim 2026-08-23 #8 — kuruculuk devri sertleştirmeleri", () => {
  it("hedefin permissionsOverride'ı devirde TEMİZLENİR (yeni Kurucu kendi 'removed' anahtarlarıyla kilitlenmez)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    await prisma.companyUser.update({
      where: { id: member.id },
      data: { permissionsOverride: { removed: ["users:manage"] } },
    });
    await svc.updateRoles(owner.auth, member.id, { roles: [CompanyRole.SAHIP] } as never);
    const newOwner = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(newOwner.roles).toEqual([CompanyRole.SAHIP]);
    expect(newOwner.permissionsOverride).toBeNull();
    const company = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(company.ownerUserId).toBe(member.id);
  });

  it("PASİF üyeye kuruculuk devredilemez (firma aktif yöneticisiz kalmasın)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    await prisma.companyUser.update({ where: { id: member.id }, data: { isActive: false } });
    await expect(
      svc.updateRoles(owner.auth, member.id, { roles: [CompanyRole.SAHIP] } as never),
    ).rejects.toThrow(/aktif bir kullanıcıya devredilebilir/);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(company.ownerUserId).toBe(owner.user.id); // devir olmadı
  });
});

