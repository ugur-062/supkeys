/**
 * #8 — Düşürme koruması: mevcut admin (Kurucu/Yönetici) hedefinin rollerini
 * yalnızca admin değiştirebilir. `users:manage` override'lı operasyon-rollü bir
 * kullanıcı bir Yöneticiyi düşük role indiremez.
 *
 * `assertCanGrantRoles` yalnız YÜKSELTMEYİ koruyordu (yeni rol ayrıcalıklıysa);
 * demotion'da yeni roller ayrıcalıklı olmadığından o kontrol geçiyordu → bu
 * test o boşluğun kapandığını kanıtlar. updateRoles + updateUser ikisi de.
 */
import { ForbiddenException } from "@nestjs/common";
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";

const OWNER_ID = "owner-1";
const ADMIN_TARGET_ID = "yonetici-2";
const OP_TARGET_ID = "satinalmaci-3";

function actor(
  overrides: Partial<AuthenticatedCompanyUser>,
): AuthenticatedCompanyUser {
  return {
    userId: "actor-x",
    companyId: "co-1",
    email: "actor@demo.com",
    firstName: "A",
    lastName: "B",
    roles: [CompanyRole.SATIN_ALMACI],
    tier: "STANDARD" as AuthenticatedCompanyUser["tier"],
    country: "TR",
    isOwner: false,
    permissionsOverride: null,
    ...overrides,
  };
}

/**
 * Servis + mock prisma. findFirst → hedef, company.findUnique → ownerUserId.
 * $transaction sentinel fırlatır: guard GEÇERSE oraya ulaşılır (kabul kanıtı).
 */
function makeService(target: { id: string; roles: CompanyRole[] }) {
  const $transaction = jest.fn(() => {
    throw new Error("REACHED_TX");
  });
  const prisma = {
    companyUser: {
      findFirst: jest.fn(async () => ({
        id: target.id,
        roles: target.roles,
        email: "target@demo.com",
        authId: "auth-t",
      })),
    },
    company: {
      findUnique: jest.fn(async () => ({ ownerUserId: OWNER_ID })),
    },
    $transaction,
  };
  const svc = new CompanyUsersService(
    prisma as never,
    {} as never, // supabaseAuth
    {} as never, // companyAuth
    {} as never, // email
    {} as never, // config
    { log: jest.fn() } as never, // audit
  );
  return { svc, $transaction };
}

const ADMIN_TARGET = { id: ADMIN_TARGET_ID, roles: [CompanyRole.YONETICI] };
const OP_TARGET = { id: OP_TARGET_ID, roles: [CompanyRole.SATIN_ALMACI] };
const DEMOTE_DTO = { roles: [CompanyRole.SATIN_ALMACI] };

describe("#8 admin-hedef düşürme koruması", () => {
  describe("updateRoles", () => {
    it("operasyon-rollü (users:manage) actor bir YÖNETİCİ'yi düşüremez → 403", async () => {
      const { svc, $transaction } = makeService(ADMIN_TARGET);
      await expect(
        svc.updateRoles(actor({}), ADMIN_TARGET_ID, DEMOTE_DTO),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect($transaction).not.toHaveBeenCalled(); // guard tx ÖNCESİ durdurdu
    });

    it("admin (YÖNETİCİ) actor bir YÖNETİCİ'yi düşürebilir (guard geçer → tx'e ulaşır)", async () => {
      const { svc } = makeService(ADMIN_TARGET);
      await expect(
        svc.updateRoles(
          actor({ roles: [CompanyRole.YONETICI] }),
          ADMIN_TARGET_ID,
          DEMOTE_DTO,
        ),
      ).rejects.toThrow("REACHED_TX");
    });

    it("Kurucu actor bir YÖNETİCİ'yi düşürebilir (guard geçer → tx'e ulaşır)", async () => {
      const { svc } = makeService(ADMIN_TARGET);
      await expect(
        svc.updateRoles(actor({ isOwner: true }), ADMIN_TARGET_ID, DEMOTE_DTO),
      ).rejects.toThrow("REACHED_TX");
    });

    it("Faz R: operasyon-rollü actor NON-admin hedefe de rol ATAYAMAZ (grant-kapısı) → 403", async () => {
      // Eski davranış: demote-guard karışmaz → tx'e ulaşırdı. Faz R'de rol
      // atama toptan Kurucu+Yönetici'ye kapılı (assertCanGrantRoles son dal).
      const { svc, $transaction } = makeService(OP_TARGET);
      await expect(
        svc.updateRoles(actor({}), OP_TARGET_ID, {
          roles: [CompanyRole.SATISCI],
        }),
      ).rejects.toThrow(/yalnızca Kurucu veya Yönetici/);
      expect($transaction).not.toHaveBeenCalled();
    });

    it("Faz R: Yönetici actor NON-admin hedefe rol atar (grant-kapısı geçer → tx'e ulaşır)", async () => {
      const { svc } = makeService(OP_TARGET);
      await expect(
        svc.updateRoles(actor({ roles: [CompanyRole.YONETICI] }), OP_TARGET_ID, {
          roles: [CompanyRole.SATISCI],
        }),
      ).rejects.toThrow("REACHED_TX");
    });
  });

  describe("updateUser (rol değişince aynı koruma)", () => {
    it("operasyon-rollü actor bir YÖNETİCİ'nin rollerini düşüremez → 403", async () => {
      const { svc, $transaction } = makeService(ADMIN_TARGET);
      await expect(
        svc.updateUser(actor({}), ADMIN_TARGET_ID, {
          roles: [CompanyRole.SATIN_ALMACI],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect($transaction).not.toHaveBeenCalled();
    });

    it("admin actor bir YÖNETİCİ'nin rollerini değiştirebilir (guard geçer → tx)", async () => {
      const { svc } = makeService(ADMIN_TARGET);
      await expect(
        svc.updateUser(actor({ roles: [CompanyRole.YONETICI] }), ADMIN_TARGET_ID, {
          roles: [CompanyRole.SATIN_ALMACI],
        }),
      ).rejects.toThrow("REACHED_TX");
    });
  });
});
