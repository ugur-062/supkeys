/**
 * Faz R kabul testleri — etiket/rol modeli:
 * - SAHIP/YONETICI = ETİKET: yönetim yetkisi verir, İŞLEM izni (buy:* ve
 *   sell:* ailesi) VERMEZ.
 * - İşlem yalnız SATIN_ALMACI/SATISCI rolüyle; kombo gevşek ([SAHIP,SA],
 *   [YONETICI,ST], [ONAYLAYICI,SA] geçerli).
 * - İşlem-rolsüz Kurucu SALT-OKUNUR: veriyi görür, mutasyon 403.
 * - YONETICI etiketini yalnız Kurucu verir; rol atamayı Kurucu+Yönetici yapar.
 * (İşlem izinlerinin override ile atanamadığı approvals.spec'te test edilir.)
 */
import { CompanyRole } from "@rothern/db";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import {
  hasCompanyPermission,
  permissionsForRoles,
} from "../../src/modules/company-auth/permissions/company-permissions.constants";
import { prisma, truncateAll } from "./test-db";
import {
  makeCompanyWithUser,
  makeItem,
  makeListing,
  makeUser,
} from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
    prisma as never,
  );
}

function makeUsersService() {
  const supabase = {
    createUser: jest.fn().mockResolvedValue({ authId: `auth-${Date.now()}` }),
    deleteUser: jest.fn(),
  };
  const companyAuth = { createSession: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
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

const bid = (itemId: string, unitPrice = 100) =>
  ({
    items: [{ itemId, unitPrice }],
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

/** PUBLIC OPEN ilan + kalem (teklif hedefi). */
async function openListing() {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  return { owner, listing, item };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Faz R — SAHIP-only salt-okunur (etiket işlem vermez)", () => {
  it("izin yüzeyi: SAHIP-only'de buy:*/sell:* YOK; yönetim + OWNER_ONLY var", () => {
    for (const p of [
      "buy:listing:create",
      "buy:award",
      "sell:bid:submit",
      "sell:listing:manage",
    ]) {
      expect(hasCompanyPermission([CompanyRole.SAHIP], true, p)).toBe(false);
    }
    for (const p of ["users:manage", "billing:manage", "approval:act"]) {
      expect(hasCompanyPermission([CompanyRole.SAHIP], true, p)).toBe(true);
    }
  });

  it("teklif veremez + kazandıramaz + sipariş adımı atamaz; ama ilan/sipariş DETAYINI OKUR", async () => {
    const { service } = makeService();
    const solo = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: [CompanyRole.SAHIP],
    });

    // Teklif: ALIM ilanına teklif = satış → SATISCI ister; SAHIP yetmez.
    const { listing: alimListing, item } = await openListing();
    await expect(
      service.placeBid(solo.auth, alimListing.id, bid(item.id)),
    ).rejects.toThrow(/Satışçı rolü gerekir/);

    // Kazandırma: kendi ALIM ihalesinde bile SAHIP-only yetkisiz (rol kapısı).
    const own = await makeListing(prisma, {
      companyId: solo.company.id,
      createdById: solo.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    await expect(service.award(solo.auth, own.id, "herhangi")).rejects.toThrow(
      /Kazandırma için yetkiniz yok/,
    );

    // OKUMA: kendi ihalesinin sahip-görünümü tam döner (salt-okunur panel).
    const detail = (await service.getOne(solo.auth, own.id)) as {
      isOwner?: boolean;
      bids?: unknown[];
    };
    expect(detail).toBeTruthy();

    // Sipariş: satıcı-adımı (accept) SATISCI ister; okuma serbest.
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const orders = makeOrdersService();
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: solo.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "PENDING",
      },
    });
    await expect(
      orders.accept(solo.auth, order.id, {
        expectedDeliveryDate: FUTURE.toISOString(),
      } as never),
    ).rejects.toThrow(/Satışçı rolü gerekir/);
    await expect(orders.getOne(solo.auth, order.id)).resolves.toBeTruthy();
  });
});

describe("Faz R — etiket + op-rol komboları işlem yapar", () => {
  it("Kurucu (default SAHIP+SA+ST) teklif verebilir", async () => {
    const { service } = makeService();
    const founder = await makeCompanyWithUser(prisma, { country: "TR" }); // default roller
    const { listing, item } = await openListing(); // satış tarafı → ST
    await expect(
      service.placeBid(founder.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("YONETICI+SATISCI teklif verebilir (münhasırlık kalktı)", async () => {
    const { service } = makeService();
    const co = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: [CompanyRole.YONETICI, CompanyRole.SATISCI],
    });
    const { listing, item } = await openListing(); // satış tarafı → ST
    await expect(
      service.placeBid(co.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("ONAYLAYICI+SATISCI hem onay yetkisi taşır hem teklif verir", async () => {
    const { service } = makeService();
    const co = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: [CompanyRole.ONAYLAYICI, CompanyRole.SATISCI],
    });
    expect(
      permissionsForRoles([CompanyRole.ONAYLAYICI, CompanyRole.SATISCI]).has(
        "approval:act",
      ),
    ).toBe(true);
    const { listing, item } = await openListing(); // satış tarafı → ST
    await expect(
      service.placeBid(co.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });
});

describe("Faz R — etiket/rol atama kuralları", () => {
  it("YONETICI rol (SA/ST) atar; YONETICI etiketini ATAYAMAZ (yalnız Kurucu)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const manager = await makeUser(prisma, owner.company.id, [
      CompanyRole.YONETICI,
    ]);
    const managerAuth = {
      userId: manager.id,
      companyId: owner.company.id,
      email: manager.email,
      roles: [CompanyRole.YONETICI],
      isOwner: false,
    } as never;
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATIN_ALMACI,
    ]);

    // Rol atama (SA/ST): Yönetici yapabilir.
    await svc.updateRoles(managerAuth, member.id, {
      roles: [CompanyRole.SATIN_ALMACI, CompanyRole.SATISCI],
    } as never);

    // Etiket atama: Yönetici başka Yönetici ÜRETEMEZ.
    await expect(
      svc.updateRoles(managerAuth, member.id, {
        roles: [CompanyRole.YONETICI],
      } as never),
    ).rejects.toThrow(/Yönetici etiketini yalnızca Kurucu/);

    // Kurucu verebilir.
    await svc.updateRoles(owner.auth, member.id, {
      roles: [CompanyRole.YONETICI],
    } as never);
    const after = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(after.roles).toEqual([CompanyRole.YONETICI]);

    // Audit: etiket/rol ayrımı metadata'da.
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.user.roles_changed",
        entityId: member.id,
        actorId: owner.auth.userId,
      },
      orderBy: { createdAt: "desc" },
    });
    const meta = row.metadata as {
      labelChanges: { added: string[] };
      roleChanges: { removed: string[] };
    };
    expect(meta.labelChanges.added).toEqual(["YONETICI"]);
    expect(meta.roleChanges.removed.sort()).toEqual(
      ["SATIN_ALMACI", "SATISCI"].sort(),
    );
  });
});

describe("Faz Y — addresses:manage izin yüzeyi", () => {
  it("işlem rolleri + etiketler adres yönetir; ONAYLAYICI yönetemez", () => {
    for (const roles of [
      [CompanyRole.SATIN_ALMACI],
      [CompanyRole.SATISCI],
      [CompanyRole.YONETICI],
    ]) {
      expect(hasCompanyPermission(roles, false, "addresses:manage")).toBe(true);
    }
    expect(
      hasCompanyPermission([CompanyRole.SAHIP], true, "addresses:manage"),
    ).toBe(true); // SAHIP ⊇ YONETICI seti
    expect(
      hasCompanyPermission([CompanyRole.ONAYLAYICI], false, "addresses:manage"),
    ).toBe(false);
  });
});

describe("Sahiplik normalizasyonu — SAHIP etiketi tek kaynaktan (ownerUserId)", () => {
  it("kurucu kendine SA eklerken SAHIP'i göndermese de etiket KORUNUR (devret hatası yok)", async () => {
    const users = makeUsersService();
    const co = await makeCompanyWithUser(prisma);
    // Tutarsız eski veri simülasyonu: sahip ama SAHIP etiketi yok.
    await prisma.companyUser.update({
      where: { id: co.user.id },
      data: { roles: [CompanyRole.SATIN_ALMACI] },
    });

    await users.updateRoles(co.auth, co.user.id, {
      roles: [CompanyRole.SATIN_ALMACI, CompanyRole.SATISCI],
    } as never);

    const after = await prisma.companyUser.findUnique({
      where: { id: co.user.id },
      select: { roles: true },
    });
    expect(after?.roles).toEqual(
      expect.arrayContaining(["SAHIP", "SATIN_ALMACI", "SATISCI"]),
    );
  });

  it("devir akışı normalizasyondan ETKİLENMEZ: hedef başkası + SAHIP → devir çalışır", async () => {
    const users = makeUsersService();
    const co = await makeCompanyWithUser(prisma);
    const other = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);

    await users.updateRoles(co.auth, other.id, {
      roles: [CompanyRole.SAHIP],
      previousOwnerRoles: [CompanyRole.YONETICI],
    } as never);

    const company = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: { ownerUserId: true },
    });
    expect(company?.ownerUserId).toBe(other.id);
  });
});
