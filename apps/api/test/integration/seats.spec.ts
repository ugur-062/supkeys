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
import { readSeatUsage } from "../../src/common/company/seat-gate";
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
  it("SA+ST taşıyan kurucu GOLD'da 2 koltuk (satınalma 1 + satış 1); ONAYLAYICI/YONETICI/görüntüleyici tüketmez", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // SAHIP+SA+ST
    await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await makeUser(prisma, co.company.id, [CompanyRole.YONETICI]);
    await makeUser(prisma, co.company.id, [], { permissions: ["buy:view", "sell:view"] });

    const usage = await svc.seatUsage(co.company.id);
    expect(usage).toMatchObject({ limit: 6, used: 2, usedBuy: 1, usedSell: 1, overflow: 0 });
  });

  it("Gold altında satınalma koltuğu SAYILMAZ; kayıtlı satınalma izni silinmez (arayüz testi O-065, DN-04)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" }); // SAHIP+SA+ST
    const buyer = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    expect(await svc.seatUsage(co.company.id)).toMatchObject({
      limit: 2,
      used: 1,
      usedBuy: 0,
      usedSell: 1,
      overflow: 0,
    });
    // Boş koltuk gerçekten kullanılabilir: satışçı daveti geçer.
    await expect(
      svc.invite(co.auth, { email: "s@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: buyer.id } });
    expect(row.roles).toContain(CompanyRole.SATIN_ALMACI);
    // Gold'a dönünce satınalma koltukları yeniden sayılır.
    await prisma.company.update({ where: { id: co.company.id }, data: { tier: "GOLD" } });
    expect(await svc.seatUsage(co.company.id)).toMatchObject({ usedBuy: 2, usedSell: 1 });
  });

  it("STANDART limit 2: kurucu satış koltuğu + bekleyen satışçı daveti paketi doldurur", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"] as never,
    });
    expect((await svc.seatUsage(co.company.id)).limit).toBe(2);
    await expect(
      svc.invite(co.auth, { email: "s@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
    await expect(
      svc.invite(co.auth, { email: "s2@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);
  });

  it("son koltuğu tutan bekleyen davet YENİDEN GÖNDERİLEBİLİR — kendi koltuğu iki kez sayılmaz (arayüz testi O-063)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"] as never,
    }); // 1/2
    const inv = (await svc.invite(co.auth, {
      email: "son-koltuk@x.com",
      roles: ["SATISCI"],
    } as never)) as { id: string };
    await expect(svc.resendInvitation(co.auth, inv.id)).resolves.toMatchObject({ ok: true });
    // Kapı hâlâ çalışıyor: başka bir koltuk daveti yine reddedilir.
    await expect(
      svc.invite(co.auth, { email: "fazla@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);
  });
});

describe("Koltuk kapısı tek kaynak (derin denetim MU-04)", () => {
  it("firma paneli sayımı admin kapısının okuduğu sayımla birebir aynı", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    await seedInvitation(
      co.company.id,
      co.user.id,
      [CompanyRole.SATIN_ALMACI],
      "tek-kaynak@example.com",
    );
    const panel = await svc.seatUsage(co.company.id);
    expect(panel).toEqual(await readSeatUsage(prisma as never, co.company.id));
    expect(panel).toMatchObject({ usedSell: 2, pendingBuy: 1, overflow: 0 });
  });
});

describe("Faz 5 — kapılar (STANDART 2 koltuk)", () => {
  /**
   * 2026-09-14: bu senaryolar eskiden SATIN_ALMACI ile kuruluyordu. Artık
   * ücretsiz pakette satınalma yetkisi HİÇ verilemiyor (ayrı kural, aşağıdaki
   * describe'ta), dolayısıyla koltuk SAYISI kuralını sınamak için satış
   * koltuğu kullanılıyor — iki kural birbirine karışmasın.
   */
  it("dolu: koltuk daveti + rol ataması + reaktivasyon reddedilir; ONAYLAYICI serbest", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"] as never,
    }); // 1/2
    const second = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]); // 2/2 dolu
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);

    await expect(
      svc.invite(co.auth, { email: "yeni@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu.*paketi yükseltin/);
    await expect(
      svc.invite(co.auth, { email: "onay@x.com", roles: ["ONAYLAYICI"] } as never),
    ).resolves.toBeDefined();
    // Koltuksuz kişiye işlem grubu → red.
    await expect(
      svc.updateRoles(co.auth, approver.id, {
        roles: ["ONAYLAYICI", "SATISCI"],
      } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // Aynı grupta kalan değişiklik serbest (koltuk sayısı değişmez).
    await expect(
      svc.setPermissions(co.auth, second.id, ["sell:bid:submit", "sell:product:manage"]),
    ).resolves.toBeDefined();

    // Reaktivasyon: koltuklu kişi pasifleşir → koltuk boşalır → onaylayıcıya
    // ST atanır → pasifin geri dönüşü reddedilir (limit yine dolu).
    await svc.setActive(co.auth, second.id, false);
    await svc.updateRoles(co.auth, approver.id, {
      roles: ["ONAYLAYICI", "SATISCI"],
    } as never);
    await expect(svc.setActive(co.auth, second.id, true)).rejects.toThrow(
      /Koltuk dolu/,
    );
  });

  it("GOLD: koltuklu kişiye İKİNCİ grup da yeni koltuk ister", async () => {
    const { svc } = makeUsersService();
    // GOLD 6 koltuk: sahip (ST) 1 + iki kişi çift grup 4 = 5; bir kişiye ikinci
    // grup vermek 6'ya çıkarır, ondan sonrası dolu.
    const co = await makeCompanyWithUser(prisma, {
      tier: "GOLD",
      roles: ["SAHIP", "SATISCI"] as never,
    });
    const a = await makeUser(prisma, co.company.id, [
      CompanyRole.SATIN_ALMACI,
      CompanyRole.SATISCI,
    ]);
    const b = await makeUser(prisma, co.company.id, [
      CompanyRole.SATIN_ALMACI,
      CompanyRole.SATISCI,
    ]);
    expect((await svc.seatUsage(co.company.id)).used).toBe(5);
    void a;
    void b;
    // Sahibe ikinci grup → 6/6.
    await expect(
      svc.updateRoles(co.auth, co.user.id, {
        roles: ["SAHIP", "SATISCI", "SATIN_ALMACI"],
      } as never),
    ).resolves.toBeDefined();
    expect((await svc.seatUsage(co.company.id)).used).toBe(6);
    await expect(
      svc.invite(co.auth, { email: "yedinci@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/Koltuk dolu/);
    // GOLD en üst paket: "paketi yükseltin" denmez, koltuk boşaltma yolu
    // söylenir (arayüz testi D-188).
    const err = (await svc
      .invite(co.auth, { email: "sekizinci@x.com", roles: ["SATISCI"] } as never)
      .catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/koltuğu boşaltın/);
    expect(err.message).not.toMatch(/yükselt/);
  });

  it("bekleyen koltuk davetleri grup bazında sayılır (davet-yağmuru kapalı)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP", "SATISCI"] as never,
    }); // 1/2
    await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATISCI], "bekleyen@x.com"); // 1 + 1 bekleyen = 2
    const usage = await svc.seatUsage(co.company.id);
    expect(usage).toMatchObject({ pendingSeatInvites: 1, pendingSell: 1, pendingBuy: 0 });
    await expect(
      svc.invite(co.auth, { email: "ucuncu@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/bekleyen davet/);
    // İki gruplu davet 2 koltuk ister. GOLD: satınalma yetkisi ücretsiz
    // pakette verilemiyor (ayrı kural), o yüzden bu senaryo paketli firmada.
    const wide = await makeCompanyWithUser(prisma, {
      tier: "GOLD",
      roles: ["SAHIP"] as never,
    }); // 0/6
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
      roles: ["SAHIP", "SATISCI"] as never,
    }); // 1/2 → 1 boş koltuk
    const invA = await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATISCI], "a@yaris.com");
    const invB = await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATISCI], "b@yaris.com");

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
    const u3 = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]); // +1 = 4

    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "STANDART", membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    // Gold altında kurucunun satınalma koltuğu sayılmaz (O-065): 3 satış / 2.
    const over = await svc.seatUsage(co.company.id);
    expect(over).toMatchObject({ limit: 2, used: 3, usedBuy: 0, usedSell: 3, overflow: 1 });
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

    // Kurucu seçer: kurucu SATIŞ + u3 SATIŞ kalır → u2'nin satış koltuğu
    // düşer; u2 YONETICI etiketi kalır. Kurucunun (sayılmayan) satınalma
    // izinleri dokunulmadan kalır.
    const res = await svc.applySeatSelection(co.auth, [
      { userId: co.user.id, group: "sell" },
      { userId: u3.id, group: "sell" },
    ]);
    expect(res).toEqual({ ok: true, droppedCount: 1 });
    const u2After = await prisma.companyUser.findUniqueOrThrow({ where: { id: u2.id } });
    expect(u2After.roles).toEqual([CompanyRole.YONETICI]);
    expect(u2After.isActive).toBe(true);
    expect(u2After.permissions).toContain("sell:view"); // görüntüleme kaldı
    expect(u2After.permissions).not.toContain("sell:bid:submit");
    const ownerAfter = await prisma.companyUser.findUniqueOrThrow({ where: { id: co.user.id } });
    expect(ownerAfter.permissions).toContain("sell:bid:submit");
    expect(ownerAfter.permissions).toContain("buy:listing:manage"); // uykuda, silinmedi
    const after = await svc.seatUsage(co.company.id);
    expect(after).toMatchObject({ limit: 2, used: 2, usedBuy: 0, usedSell: 2, overflow: 0 });

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
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" }); // kurucu SA+ST (satınalma sayılmaz)
    const a = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const b = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(
      svc.applySeatSelection(co.auth, [
        { userId: co.user.id, group: "sell" },
        { userId: a.id, group: "sell" },
        { userId: b.id, group: "sell" },
      ]),
    ).rejects.toThrow(/En fazla 2/);
    await expect(
      svc.applySeatSelection(co.auth, [{ userId: approver.id, group: "sell" }]),
    ).rejects.toThrow(/koltuk kullanmayan/);
    // Gold altında satınalma koltuğu seçilemez (O-069).
    await expect(
      svc.applySeatSelection(co.auth, [{ userId: co.user.id, group: "buy" }]),
    ).rejects.toThrow(/Gold pakette/);
    // Eski istemci: keepUserIds → kurucunun satış koltuğu korunur, a ve b düşer.
    const res = await svc.applySeatSelection(co.auth, [co.user.id]);
    expect(res).toEqual({ ok: true, droppedCount: 2 });
    expect((await svc.seatUsage(co.company.id)).used).toBe(1);
  });

  it("GOLD→SILVER: satınalma koltuğu seçimde reddedilir, satış koltukları seçilir; uykudaki satınalma izni kalır (arayüz testi O-069)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // kurucu SA+ST
    const buyer = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    const sellers = [];
    for (let i = 0; i < 4; i++) {
      sellers.push(await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]));
    }
    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "SILVER", membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    // 5 satış koltuğu / 4 (satınalma koltukları sayılmaz) → 1 aşkın.
    expect(await svc.seatUsage(co.company.id)).toMatchObject({
      limit: 4,
      used: 5,
      usedBuy: 0,
      overflow: 1,
    });
    await expect(
      svc.applySeatSelection(co.auth, [
        { userId: co.user.id, group: "buy" },
        { userId: buyer.id, group: "buy" },
        { userId: co.user.id, group: "sell" },
        { userId: sellers[0]!.id, group: "sell" },
      ]),
    ).rejects.toThrow(/Gold pakette/);
    const res = await svc.applySeatSelection(co.auth, [
      { userId: co.user.id, group: "sell" },
      ...sellers.slice(0, 3).map((s) => ({ userId: s.id, group: "sell" as const })),
    ]);
    expect(res).toEqual({ ok: true, droppedCount: 1 }); // yalnız 4. satışçı
    const buyerRow = await prisma.companyUser.findUniqueOrThrow({ where: { id: buyer.id } });
    expect(buyerRow.roles).toContain(CompanyRole.SATIN_ALMACI);
    expect(await svc.seatUsage(co.company.id)).toMatchObject({ used: 4, overflow: 0 });
  });
});

/**
 * ÜCRETSİZ PAKETTE SATINALMA YETKİSİ VERİLEMEZ (2026-09-14, kullanıcı kararı).
 *
 * Talep açma ve kazandırma zaten `BUYING_TIER` (GOLD) kapısının arkasındaydı;
 * yetkiyi yine de vermek kullanıcıya çalışmayan bir düğme gösteriyor ve
 * ücretsiz paketin iki koltuğundan birini boşuna yakıyordu. Kapı koltuk
 * SAYIMINDAN ÖNCE çalışır — "koltuk dolu" demek yanıltıcı olurdu, sorun sayı
 * değil paket.
 */
describe("Satınalma yetkisi paket kapısı", () => {
  it("STANDART: davet, rol ataması ve izin yazımı REDDEDİLİR", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP"] as never,
    });
    const kisi = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);

    await expect(
      svc.invite(co.auth, { email: "alici@x.com", roles: ["SATIN_ALMACI"] } as never),
    ).rejects.toThrow(/Gold pakette/);
    await expect(
      svc.updateRoles(co.auth, kisi.id, {
        roles: ["ONAYLAYICI", "SATIN_ALMACI"],
      } as never),
    ).rejects.toThrow(/Gold pakette/);
    await expect(
      svc.setPermissions(co.auth, kisi.id, ["buy:listing:manage"]),
    ).rejects.toThrow(/Gold pakette/);
  });

  it("STANDART: SATIŞ yetkisi serbest — kapı yalnız satınalmaya", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      roles: ["SAHIP"] as never,
    });
    await expect(
      svc.invite(co.auth, { email: "satici@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
  });

  it("SILVER de YETMEZ — kapı PAID değil BUYING kademesinde", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "SILVER",
      roles: ["SAHIP"] as never,
    });
    // Silver satış paketidir; talep açma/kazandırma yalnız Gold'da.
    await expect(
      svc.invite(co.auth, { email: "alici3@x.com", roles: ["SATIN_ALMACI"] } as never),
    ).rejects.toThrow(/Gold pakette/);
    // Satış yetkisi Silver'da elbette serbest.
    await expect(
      svc.invite(co.auth, { email: "satici3@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
  });

  it("GOLD: satınalma yetkisi verilebilir", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "GOLD",
      roles: ["SAHIP"] as never,
    });
    await expect(
      svc.invite(co.auth, { email: "alici2@x.com", roles: ["SATIN_ALMACI"] } as never),
    ).resolves.toBeDefined();
  });
});

/**
 * Arayüz testi Y-13: Kurucu her zaman yöneticidir. Yönetim yetkisi onda örtük
 * ve kayıtlı listede tutulmaz; koltuk seçimi ya da kendi işlem tiklerini
 * düzenlemesi satırına yalnız işlem izinlerini yazıyordu ve son-yönetici
 * nöbetçisi kurucuyu artık saymayıp her ekip düzenlemesini reddediyordu.
 */
describe("Kurucu ekip yönetiminden kilitlenmez (arayüz testi Y-13)", () => {
  async function svcWithNotifications() {
    const { NotificationService } = await import(
      "../../src/modules/notifications/notification.service"
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    return new CompanyUsersService(
      prisma as never,
      { createUser: jest.fn(), deleteUser: jest.fn() } as never,
      { createSession: jest.fn() } as never,
      email as never,
      config as never,
      new AuditService(prisma as never),
      new NotificationService(prisma as never),
    );
  }

  it("koltuk seçimi kurucunun kendi grubunu bıraktıktan sonra düzenleme ve pasifleştirme çalışır", async () => {
    const svc = await svcWithNotifications();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // tek yönetici: kurucu
    const sellers = [];
    for (let i = 0; i < 4; i++) {
      sellers.push(await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]));
    }
    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "SILVER", membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    // Kurucu kendi satış koltuğunu bırakıp dört satışçıyı seçer.
    await svc.applySeatSelection(
      co.auth,
      sellers.map((s) => ({ userId: s.id, group: "sell" as const })),
    );
    const ownerRow = await prisma.companyUser.findUniqueOrThrow({ where: { id: co.user.id } });
    expect(ownerRow.permissions).not.toContain("users:manage"); // örtük — saklanmaz
    await expect(
      svc.setPermissions(co.auth, sellers[0]!.id, ["sell:view", "sell:bid:submit"]),
    ).resolves.toMatchObject({ ok: true });
    await expect(svc.setActive(co.auth, sellers[1]!.id, false)).resolves.toBeDefined();
  });

  it("kurucu kendi işlem tiklerini düzenler, ardından başka kullanıcıyı düzenler → geçer; kendine 'yöneticiniz değiştirdi' bildirimi gitmez", async () => {
    const svc = await svcWithNotifications();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const seller = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    await svc.setPermissions(co.auth, co.user.id, ["sell:bid:submit"]);
    await expect(
      svc.setPermissions(co.auth, seller.id, ["sell:view", "sell:product:manage"]),
    ).resolves.toMatchObject({ ok: true });
    expect(
      await prisma.notification.count({
        where: { companyUserId: co.user.id, type: "permissions_changed" },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { companyUserId: seller.id, type: "permissions_changed" },
      }),
    ).toBe(1);
  });

  it("kurucusuz firmada son yönetici garantisi hâlâ çalışır", async () => {
    const svc = await svcWithNotifications();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const admin = await makeUser(prisma, co.company.id, [CompanyRole.YONETICI]);
    // Kurucu pasif → sayılmaz; tek aktif yönetim yetkilisi `admin`.
    await prisma.companyUser.update({ where: { id: co.user.id }, data: { isActive: false } });
    await expect(
      svc.setPermissions(
        { ...(co.auth as object), userId: "ghost", isOwner: true } as never,
        admin.id,
        ["sell:view"],
      ),
    ).rejects.toThrow(/aktif yönetim yetkilisi/);
  });
});

describe("Görüntüleyici hazır seti 'Özel' sayılmaz (arayüz testi D-305)", () => {
  it("rolsüz kişi Görüntüleyici setiyle birebir → custom:false; fazladan tik → custom:true", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const viewer = await makeUser(prisma, co.company.id, [], {
      permissions: ["buy:view", "sell:view", "buy:reports:view"],
    });
    const extra = await makeUser(prisma, co.company.id, [], {
      permissions: ["buy:view", "sell:view", "buy:reports:view", "insights:view"],
    });
    const list = await svc.list(co.company.id);
    expect(list.find((u) => u.id === viewer.id)?.custom).toBe(false);
    expect(list.find((u) => u.id === extra.id)?.custom).toBe(true);
  });
});

describe("GOLD→SILVER düşüşü firmaya bildirilir (arayüz testi O-065)", () => {
  it("admin Silver'a alınca 'satınalma paneli kapandı' bildirimi gider; Silver'dan Gold'a çıkışta gitmez", async () => {
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const { EmailSuppressionService } = await import(
      "../../src/modules/email/email-suppression.service"
    );
    const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
    const admin = new AdminCompaniesService(
      prisma as never,
      {} as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      notifications as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
    );
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await admin.setTier(co.company.id, "SILVER", 12, "admin-1");
    expect(notifications.pushToCompany).toHaveBeenCalledWith(
      co.company.id,
      expect.objectContaining({
        type: "membership_downgraded",
        titleKey: "api.notifications.adminCompanies.paketSilvereAlindiBaslik",
        bodyKey: "api.notifications.adminCompanies.paketSilvereAlindiGovde",
      }),
    );
    notifications.pushToCompany.mockClear();
    await admin.setTier(co.company.id, "GOLD", 12, "admin-1");
    expect(notifications.pushToCompany).not.toHaveBeenCalledWith(
      co.company.id,
      expect.objectContaining({ type: "membership_downgraded" }),
    );
  });
});
