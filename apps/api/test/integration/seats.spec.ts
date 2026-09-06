/**
 * Koltuk sistemi — Faz 5 (2026-09-06, kullanıcı kararı "her biri bir koltuk"):
 * koltuk = (kişi, grup). Satınalma işlem izni 1, satış işlem izni 1; aynı
 * kişide ikisi 2. Limit STANDART 2 / SILVER 4 / GOLD 6 (üç paket,
 * 2026-09-06). Kapılar: davet (bekleyenler grup bazında dahil), kabul
 * (tx + FOR UPDATE — TOCTOU), rol/izin atama (yeni grup başına 1), reaktivasyon.
 * Aşkın durum TÜRETİLİR (flag yok); kurucu seçimi (kişi, grup) çiftleriyle.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";

let authSeq = 0;
function makeUsersService() {
  const supabase = {
    createUser: jest.fn(async () => ({ authId: `auth-seat-${authSeq++}` })),
    deleteUser: jest.fn(async () => undefined),
  };
  const companyAuth = {
    createSession: jest.fn(async (userId: string) => ({
      token: "t",
      user: { id: userId },
    })),
  };
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return {
    svc: new CompanyUsersService(
      prisma as never,
      supabase as never,
      companyAuth as never,
      email as never,
      config as never,
      new AuditService(prisma as never),
    ),
    supabase,
  };
}

const ACCEPT_DTO = {
  password: "Sifre1234!",
  firstName: "Yeni",
  lastName: "Üye",
} as never;

/** Doğrudan PENDING davet satırı (invite-kapısını bypass — TOCTOU kurulumları). */
async function seedInvitation(
  companyId: string,
  invitedById: string,
  roles: CompanyRole[],
  email: string,
) {
  return prisma.companyUserInvitation.create({
    data: {
      companyId,
      email,
      roles,
      token: `tok-${email}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      invitedById,
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Faz 5 — koltuk sayımı (kişi, grup)", () => {
  it("SA+ST taşıyan kurucu 2 koltuk (satınalma 1 + satış 1); ONAYLAYICI/YONETICI/görüntüleyici tüketmez", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" }); // SAHIP+SA+ST
    await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await makeUser(prisma, co.company.id, [CompanyRole.YONETICI]);
    await makeUser(prisma, co.company.id, [], { permissions: ["buy:view", "sell:view"] });

    const usage = await svc.seatUsage(co.company.id);
    expect(usage).toMatchObject({ limit: 2, used: 2, usedBuy: 1, usedSell: 1, overflow: 0 });
  });

  it("STANDART limit 2: kurucu iki koltuğu alırsa paket dolar; tek koltuklu kurucuda 1 boş", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    expect((await svc.seatUsage(co.company.id)).limit).toBe(2);
    await expect(
      svc.invite(co.auth, { email: "s@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // Kurucu yalnız satınalma koltuğu → 1 boş → satış daveti geçer.
    const solo = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATIN_ALMACI"] as never,
    });
    expect((await svc.seatUsage(solo.company.id)).used).toBe(1);
    await expect(
      svc.invite(solo.auth, { email: "s2@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
  });
});

describe("Faz 5 — kapılar (STANDART 2 koltuk)", () => {
  it("dolu: koltuk daveti + rol ataması + ikinci grup + reaktivasyon reddedilir; ONAYLAYICI serbest", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATIN_ALMACI"] as never,
    }); // 1/2
    const second = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]); // 2/2 dolu
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);

    await expect(
      svc.invite(co.auth, { email: "yeni@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    await expect(
      svc.invite(co.auth, { email: "onay@x.com", roles: ["ONAYLAYICI"] } as never),
    ).resolves.toBeDefined();
    // Koltuksuz kişiye işlem grubu → red.
    await expect(
      svc.updateRoles(co.auth, approver.id, {
        roles: ["ONAYLAYICI", "SATIN_ALMACI"],
      } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // Faz 5: koltuklu kişiye İKİNCİ grup da yeni koltuk ister → red.
    await expect(
      svc.updateRoles(co.auth, second.id, {
        roles: ["SATIN_ALMACI", "SATISCI"],
      } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // Aynı grupta kalan değişiklik serbest (koltuk sayısı değişmez).
    await expect(
      svc.setPermissions(co.auth, second.id, ["buy:listing:manage", "buy:award"]),
    ).resolves.toBeDefined();

    // Reaktivasyon: koltuklu kişi pasifleşir → koltuk boşalır → onaylayıcıya
    // SA atanır → pasifin geri dönüşü reddedilir (limit yine dolu).
    await svc.setActive(co.auth, second.id, false);
    await svc.updateRoles(co.auth, approver.id, {
      roles: ["ONAYLAYICI", "SATIN_ALMACI"],
    } as never);
    await expect(svc.setActive(co.auth, second.id, true)).rejects.toThrow(
      /Koltuk dolu/,
    );
  });

  it("bekleyen koltuk davetleri grup bazında sayılır (davet-yağmuru kapalı)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATIN_ALMACI"] as never,
    }); // 1/2
    await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATISCI], "bekleyen@x.com"); // 1 + 1 bekleyen = 2
    const usage = await svc.seatUsage(co.company.id);
    expect(usage).toMatchObject({ pendingSeatInvites: 1, pendingSell: 1, pendingBuy: 0 });
    await expect(
      svc.invite(co.auth, { email: "ucuncu@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/bekleyen davet/);
    // İki gruplu davet 2 koltuk ister.
    const wide = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP"] as never,
    }); // 0/2
    await expect(
      svc.invite(wide.auth, {
        email: "iki@x.com",
        permissions: ["buy:listing:manage", "sell:bid:submit"],
      } as never),
    ).resolves.toBeDefined();
    expect((await svc.seatUsage(wide.company.id)).pendingSeatInvites).toBe(2);
    await expect(
      svc.invite(wide.auth, { email: "onay2@x.com", roles: ["ONAYLAYICI"] } as never),
    ).resolves.toBeDefined();
  });

  it("TOCTOU: son koltuk için iki eşzamanlı kabul → tam 1 kazanır, kaybedenin daveti PENDING kalır", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATIN_ALMACI"] as never,
    }); // 1/2 → 1 boş koltuk
    const invA = await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATISCI], "a@yaris.com");
    const invB = await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATIN_ALMACI], "b@yaris.com");

    const results = await Promise.allSettled([
      svc.acceptInvitation(invA.token, ACCEPT_DTO),
      svc.acceptInvitation(invB.token, ACCEPT_DTO),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect((await svc.seatUsage(co.company.id)).used).toBe(2); // limit aşılmadı
    const pending = await prisma.companyUserInvitation.count({
      where: { id: { in: [invA.id, invB.id] }, status: "PENDING" },
    });
    expect(pending).toBe(1);
  });
});

describe("Faz 5 — paket düşüşü: aşkın durum + kurucu koltuk seçimi (kişi, grup)", () => {
  it("GOLD→STANDART: mevcutlar aktif kalır; seçilmeyen koltuğun işlem izinleri düşer (etiket/görüntüleme kalır); açık sipariş kalan koltukluyla tamamlanır; upgrade kapıyı açar", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // kurucu SA+ST = 2
    const u2 = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI, CompanyRole.YONETICI]); // +1 = 3
    const u3 = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]); // +1 = 4

    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "STANDART", membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    const over = await svc.seatUsage(co.company.id);
    expect(over).toMatchObject({ limit: 2, used: 4, usedBuy: 2, usedSell: 2, overflow: 2 });
    await expect(
      svc.invite(co.auth, { email: "n@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);

    const managerAuth = {
      userId: u2.id,
      companyId: co.company.id,
      email: u2.email,
      roles: u2.roles,
      isOwner: false,
    } as never;
    await expect(
      svc.applySeatSelection(managerAuth, [{ userId: co.user.id, group: "sell" }]),
    ).rejects.toThrow(/yalnızca Kurucu/);

    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: co.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 500,
        status: "PENDING",
      },
    });

    // Kurucu seçer: kurucu SATIŞ + u3 SATINALMA kalır → kurucunun satınalma
    // koltuğu ve u2'nin satış koltuğu düşer; u2 YONETICI etiketi kalır.
    const res = await svc.applySeatSelection(co.auth, [
      { userId: co.user.id, group: "sell" },
      { userId: u3.id, group: "buy" },
    ]);
    expect(res).toEqual({ ok: true, droppedCount: 2 });
    const u2After = await prisma.companyUser.findUniqueOrThrow({ where: { id: u2.id } });
    expect(u2After.roles).toEqual([CompanyRole.YONETICI]);
    expect(u2After.isActive).toBe(true);
    expect(u2After.permissions).toContain("sell:view"); // görüntüleme kaldı
    expect(u2After.permissions).not.toContain("sell:bid:submit");
    const ownerAfter = await prisma.companyUser.findUniqueOrThrow({ where: { id: co.user.id } });
    expect(ownerAfter.roles).toEqual([CompanyRole.SAHIP, CompanyRole.SATISCI]);
    expect(ownerAfter.permissions).not.toContain("buy:listing:manage");
    const after = await svc.seatUsage(co.company.id);
    expect(after).toMatchObject({ limit: 2, used: 2, usedBuy: 1, usedSell: 1, overflow: 0 });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.roles_changed", entityId: u2.id },
      orderBy: { createdAt: "desc" },
    });
    expect(row.metadata).toMatchObject({ reason: "seat_selection", droppedGroups: ["sell"] });
    await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.seats.selection_applied", entityId: co.company.id },
    });

    // Açık iş FİRMA düzeyinde devam eder: satış koltuğu düşen u2 adım atamaz,
    // satış koltuğunu koruyan kurucu aynı siparişi kabul eder.
    const { CompanyOrdersService } = await import(
      "../../src/modules/company-orders/services/company-orders.service"
    );
    const { NotificationService } = await import(
      "../../src/modules/notifications/notification.service"
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const orders = new CompanyOrdersService(
      prisma as never,
      email as never,
      config as never,
      new NotificationService(prisma as never),
      new AuditService(prisma as never),
      prisma as never,
    );
    const acct = await prisma.companyBankAccount.create({
      data: {
        companyId: co.company.id,
        title: "TL",
        accountHolder: "Firma",
        iban: "TR330006100519786457841326",
      },
    });
    const acceptInput = {
      expectedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      bankAccountId: acct.id,
    } as never;
    const u2Auth = {
      userId: u2.id,
      companyId: co.company.id,
      email: u2.email,
      roles: [CompanyRole.YONETICI],
      permissions: u2After.permissions,
      isOwner: false,
      companyVerificationStatus: "VERIFIED",
      country: "TR",
      tier: "STANDART",
    } as never;
    await expect(orders.accept(u2Auth, order.id, acceptInput)).rejects.toThrow(
      /'Satış siparişi işlemleri' yetkisi/,
    );
    const ownerAuth = {
      ...(co.auth as object),
      roles: ownerAfter.roles,
      permissions: ownerAfter.permissions,
    } as never;
    await expect(orders.accept(ownerAuth, order.id, acceptInput)).resolves.toBeDefined();

    // Upgrade → GOLD: kapı açılır, düşen koltuk geri verilebilir.
    await prisma.company.update({ where: { id: co.company.id }, data: { tier: "GOLD" } });
    await expect(
      svc.updateRoles(co.auth, u2.id, { roles: ["YONETICI", "SATISCI"] } as never),
    ).resolves.toBeDefined();
  });

  it("seçim doğrulamaları: limit üstü seçim + koltuksuz çift reddedilir; eski istemci keepUserIds kişinin tüm gruplarını korur", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" }); // kurucu 2 koltuk
    const a = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(
      svc.applySeatSelection(co.auth, [
        { userId: co.user.id, group: "buy" },
        { userId: co.user.id, group: "sell" },
        { userId: a.id, group: "sell" },
      ]),
    ).rejects.toThrow(/En fazla 2/);
    await expect(
      svc.applySeatSelection(co.auth, [{ userId: approver.id, group: "buy" }]),
    ).rejects.toThrow(/koltuk kullanmayan/);
    await expect(
      svc.applySeatSelection(co.auth, [{ userId: a.id, group: "buy" }]), // a'nın satınalma koltuğu yok
    ).rejects.toThrow(/koltuk kullanmayan/);
    // Eski istemci: keepUserIds → kurucunun iki grubu korunur, a düşer.
    const res = await svc.applySeatSelection(co.auth, [co.user.id]);
    expect(res).toEqual({ ok: true, droppedCount: 1 });
    expect((await svc.seatUsage(co.company.id)).used).toBe(2);
  });
});
