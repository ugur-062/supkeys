/**
 * Faz K — Koltuk sistemi: koltuk = SA/ST taşıyan AKTİF kişi (SA+ST = 1);
 * limit BRONZ 2 / SILVER 4 / GOLD 8 / STANDART limitsiz. Kapılar: davet
 * (bekleyenler dahil), kabul (tx + FOR UPDATE — TOCTOU), rol atama,
 * reaktivasyon. Aşkın durum TÜRETİLİR (flag yok).
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
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
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

describe("Faz K — koltuk sayımı", () => {
  it("SA+ST taşıyan kişi 1 koltuk; ONAYLAYICI/YONETICI/etiket tüketmez", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "BRONZ" }); // kurucu SAHIP+SA+ST = 1 koltuk
    await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await makeUser(prisma, co.company.id, [CompanyRole.YONETICI]);

    const usage = await svc.seatUsage(co.company.id);
    expect(usage).toMatchObject({ limit: 2, used: 1, overflow: 0 });
  });

  it("STANDART limitsiz (limit null) — kapılar atlanır", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    for (let i = 0; i < 4; i++) {
      await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    }
    const usage = await svc.seatUsage(co.company.id);
    expect(usage.limit).toBeNull();
    await expect(
      svc.invite(co.auth, { email: `s${Date.now()}@x.com`, roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
  });
});

describe("Faz K — kapılar (BRONZ 2 koltuk)", () => {
  it("dolu: SA/ST daveti + rol ataması + reaktivasyon reddedilir; ONAYLAYICI serbest", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "BRONZ" });
    const second = await makeUser(prisma, co.company.id, [
      CompanyRole.SATIN_ALMACI,
    ]); // 2/2 dolu
    const approver = await makeUser(prisma, co.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);

    // Davet reddi
    await expect(
      svc.invite(co.auth, { email: "yeni@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // ONAYLAYICI daveti serbest
    await expect(
      svc.invite(co.auth, { email: "onay@x.com", roles: ["ONAYLAYICI"] } as never),
    ).resolves.toBeDefined();

    // Rol atama reddi (koltuksuz kişiye SA)
    await expect(
      svc.updateRoles(co.auth, approver.id, {
        roles: ["ONAYLAYICI", "SATIN_ALMACI"],
      } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // Koltuklu kişinin rol değişimi serbest (SA→SA+ST hâlâ 1 koltuk)
    await expect(
      svc.updateRoles(co.auth, second.id, {
        roles: ["SATIN_ALMACI", "SATISCI"],
      } as never),
    ).resolves.toBeDefined();

    // Reaktivasyon: koltuklu kişi pasifleşir → koltuk boşalır → ONAYLAYICI'ya
    // SA atanır → pasifin geri dönüşü reddedilir (limit yine dolu).
    await svc.setActive(co.auth, second.id, false);
    await svc.updateRoles(co.auth, approver.id, {
      roles: ["ONAYLAYICI", "SATIN_ALMACI"],
    } as never);
    await expect(svc.setActive(co.auth, second.id, true)).rejects.toThrow(
      /Koltuk dolu/,
    );
  });

  it("bekleyen SA/ST davetleri davet-kapısında sayılır (davet-yağmuru kapalı)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "BRONZ" }); // 1/2
    await seedInvitation(
      co.company.id,
      co.user.id,
      [CompanyRole.SATISCI],
      "bekleyen@x.com",
    ); // aktif 1 + bekleyen 1 = 2

    await expect(
      svc.invite(co.auth, { email: "ucuncu@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/bekleyen davet/);
    await expect(
      svc.invite(co.auth, { email: "onay2@x.com", roles: ["ONAYLAYICI"] } as never),
    ).resolves.toBeDefined();
  });

  it("TOCTOU: son koltuk için iki eşzamanlı kabul → tam 1 kazanır, kaybedenin daveti PENDING kalır", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "BRONZ" }); // 1/2 → 1 boş koltuk
    const invA = await seedInvitation(
      co.company.id,
      co.user.id,
      [CompanyRole.SATISCI],
      "a@yaris.com",
    );
    const invB = await seedInvitation(
      co.company.id,
      co.user.id,
      [CompanyRole.SATIN_ALMACI],
      "b@yaris.com",
    );

    const results = await Promise.allSettled([
      svc.acceptInvitation(invA.token, ACCEPT_DTO),
      svc.acceptInvitation(invB.token, ACCEPT_DTO),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1);

    const usage = await svc.seatUsage(co.company.id);
    expect(usage.used).toBe(2); // limit aşılmadı

    // Kaybedenin daveti PENDING kaldı (upgrade sonrası yeniden kabul edilebilir).
    const pending = await prisma.companyUserInvitation.count({
      where: {
        id: { in: [invA.id, invB.id] },
        status: "PENDING",
      },
    });
    expect(pending).toBe(1);
  });
});

describe("Faz K — downgrade aşkın durum + kurucu seçimi", () => {
  it("GOLD→BRONZ: mevcutlar aktif kalır (aşkın), yeni SA/ST reddedilir; seçim → düşenin SA/ST'si gider (YONETICI korunur), açık sipariş kalan koltukluyla tamamlanır; upgrade kapıyı açar", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // kurucu 1 koltuk
    const u2 = await makeUser(prisma, co.company.id, [
      CompanyRole.SATISCI,
      CompanyRole.YONETICI,
    ]); // 2
    const u3 = await makeUser(prisma, co.company.id, [
      CompanyRole.SATIN_ALMACI,
    ]); // 3

    // Downgrade → BRONZ (limit 2): aşkın 1.
    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "BRONZ", membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    const over = await svc.seatUsage(co.company.id);
    expect(over).toMatchObject({ limit: 2, used: 3, overflow: 1 });
    // Aşkın: kimse silinmedi, ama yeni SA/ST kilitli.
    await expect(
      svc.invite(co.auth, { email: "n@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);

    // Seçim yalnız kurucu (isOwner) yapabilir.
    const managerAuth = {
      userId: u2.id,
      companyId: co.company.id,
      email: u2.email,
      roles: u2.roles,
      isOwner: false,
    } as never;
    await expect(
      svc.applySeatSelection(managerAuth, [co.user.id, u3.id]),
    ).rejects.toThrow(/yalnızca Kurucu/);

    // Açık sipariş (satıcı = firma) — u2'nin işi ama firma varlığı.
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: co.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 500,
        status: "PENDING",
      },
    });

    // Kurucu seçer: kurucu + u3 kalır → u2'nin SATISCI'sı düşer, YONETICI kalır.
    const res = await svc.applySeatSelection(co.auth, [co.user.id, u3.id]);
    expect(res).toEqual({ ok: true, droppedCount: 1 });
    const u2After = await prisma.companyUser.findUniqueOrThrow({
      where: { id: u2.id },
    });
    expect(u2After.roles).toEqual([CompanyRole.YONETICI]); // etiket korundu
    expect(u2After.isActive).toBe(true); // kişi pasifleşmedi
    const after = await svc.seatUsage(co.company.id);
    expect(after).toMatchObject({ limit: 2, used: 2, overflow: 0 });

    // Audit: kişi-bazlı roles_changed (seat_selection) + toplu iz.
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.roles_changed", entityId: u2.id },
      orderBy: { createdAt: "desc" },
    });
    expect(row.metadata).toMatchObject({ reason: "seat_selection" });
    await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.seats.selection_applied",
        entityId: co.company.id,
      },
    });

    // Açık işlem FİRMA düzeyinde devam eder: rolü düşen u2 adım atamaz ama
    // kurucu (ST taşıyor) aynı siparişi kabul edebilir.
    const { CompanyOrdersService } = await import(
      "../../src/modules/company-orders/services/company-orders.service"
    );
    const { NotificationService } = await import(
      "../../src/modules/notifications/notification.service"
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
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
      isOwner: false,
      companyVerificationStatus: "VERIFIED",
      country: "TR",
      tier: "BRONZ",
    } as never;
    await expect(orders.accept(u2Auth, order.id, acceptInput)).rejects.toThrow(
      /Satışçı rolü/,
    );
    await expect(
      orders.accept(co.auth, order.id, acceptInput),
    ).resolves.toBeDefined(); // kalan koltuklu (kurucu ST) tamamlar

    // Upgrade → GOLD: kapı açılır, düşen kişiye rol geri atanabilir.
    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "GOLD" },
    });
    await expect(
      svc.updateRoles(co.auth, u2.id, {
        roles: ["YONETICI", "SATISCI"],
      } as never),
    ).resolves.toBeDefined();
  });

  it("seçim doğrulamaları: limitsiz pakette reddedilir; limit üstü seçim + koltuksuz id reddedilir", async () => {
    const { svc } = makeUsersService();
    const std = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await expect(
      svc.applySeatSelection(std.auth, [std.user.id]),
    ).rejects.toThrow(/koltuk sınırı yok/);

    const co = await makeCompanyWithUser(prisma, { tier: "BRONZ" });
    const a = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const b = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const approver = await makeUser(prisma, co.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);
    await expect(
      svc.applySeatSelection(co.auth, [co.user.id, a.id, b.id]),
    ).rejects.toThrow(/En fazla 2/);
    await expect(
      svc.applySeatSelection(co.auth, [co.user.id, approver.id]),
    ).rejects.toThrow(/koltuk kullanmayan/);
  });
});
