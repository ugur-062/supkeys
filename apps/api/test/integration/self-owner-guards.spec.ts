/**
 * KENDİNE/KURUCUYA KARŞI KORUMA GUARD'LARI — sözleşme testleri.
 *
 * Neden bu spec (2026-07-28): "arayüzde kilitli, API'de serbest" hata sınıfı
 * denetlenirken (KYC kimlik kilidi baypası) bu guard'ların HİÇ testi olmadığı
 * ölçüldü — servis doğru davranıyordu ama davranışı kilitleyen bir sözleşme
 * yoktu, yani sessizce kaldırılabilirdi. Arayüz bu aksiyonları zaten gizler;
 * burada gizlemenin DEĞİL, sunucunun reddettiğinin kanıtı tutulur.
 *
 * Kapsam: kendini pasifleştirme/çıkarma, kurucuyu pasifleştirme/çıkarma,
 * kurucunun izinlerini kısma, izin düzenlemeyi Kurucu'ya kilitleme.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/decorators/current-company-user.decorator";

let authSeq = 0;
function makeUsersService() {
  const supabase = {
    createUser: jest.fn(async () => ({ authId: `auth-guard-${authSeq++}` })),
    deleteUser: jest.fn(async () => undefined),
  };
  const companyAuth = {
    createSession: jest.fn(async (userId: string) => ({
      token: "t",
      user: { id: userId },
    })),
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

/** Kurucu + ayrıca bir Yönetici üye (kurucu-olmayan aktör senaryoları için). */
async function setup() {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const manager = await makeUser(prisma, owner.company.id, [
    CompanyRole.YONETICI,
  ]);
  const managerAuth = {
    userId: manager.id,
    companyId: owner.company.id,
    email: manager.email,
    roles: [CompanyRole.YONETICI],
    country: "TR",
    tier: owner.company.tier,
    companyVerificationStatus: owner.company.companyVerificationStatus,
    isOwner: false,
  } as AuthenticatedCompanyUser;
  return { owner, manager, managerAuth, svc: makeUsersService() };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("kendine karşı koruma — sunucu reddi (UI gizlemesine güvenilmez)", () => {
  it("kullanıcı KENDİNİ pasifleştiremez", async () => {
    const { owner, managerAuth, manager, svc } = await setup();
    await expect(
      svc.setActive(managerAuth, manager.id, false),
    ).rejects.toThrow(/Kendinizi pasifleştiremezsiniz/);
    const row = await prisma.companyUser.findUniqueOrThrow({
      where: { id: manager.id },
    });
    expect(row.isActive).toBe(true);
    void owner;
  });

  it("kullanıcı KENDİNİ firmadan çıkaramaz", async () => {
    const { managerAuth, manager, svc } = await setup();
    await expect(svc.remove(managerAuth, manager.id)).rejects.toThrow(
      /Kendinizi çıkaramazsınız/,
    );
    expect(
      await prisma.companyUser.count({ where: { id: manager.id } }),
    ).toBe(1);
  });
});

describe("kurucuya karşı koruma — sunucu reddi", () => {
  it("kurucu pasifleştirilemez (kurucu-olmayan yönetici denerse)", async () => {
    const { owner, managerAuth, svc } = await setup();
    await expect(
      svc.setActive(managerAuth, owner.user.id, false),
    ).rejects.toThrow(/Firma sahibi pasifleştirilemez/);
    const row = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(row.isActive).toBe(true);
  });

  it("kurucu firmadan çıkarılamaz — önce devir gerekir", async () => {
    const { owner, managerAuth, svc } = await setup();
    await expect(svc.remove(managerAuth, owner.user.id)).rejects.toThrow(
      /Kurucu çıkarılamaz/,
    );
    expect(
      await prisma.companyUser.count({ where: { id: owner.user.id } }),
    ).toBe(1);
  });

  it("kurucunun izinleri kısıtlanamaz (tüm yetkilere sahiptir)", async () => {
    const { owner, svc } = await setup();
    await expect(
      svc.updatePermissions(owner.auth, owner.user.id, {
        added: [],
        removed: ["company:manage"],
      } as never),
    ).rejects.toThrow(/Kurucunun izinleri kısıtlanamaz/);
  });
});

describe("izin düzenleme yalnız Kurucu'ya açık", () => {
  it("kurucu-olmayan yönetici izin düzenleyemez (403)", async () => {
    const { managerAuth, manager, svc } = await setup();
    await expect(
      svc.updatePermissions(managerAuth, manager.id, {
        added: ["company:manage"],
        removed: [],
      } as never),
    ).rejects.toThrow(/yalnızca Kurucu/i);
  });

  it("kurucu, kurucu-olmayan üyenin izinlerini düzenleyebilir (pozitif kontrol)", async () => {
    const { owner, manager, svc } = await setup();
    await expect(
      svc.updatePermissions(owner.auth, manager.id, {
        added: [],
        removed: ["company:manage"],
      } as never),
    ).resolves.toBeDefined();
  });
});
