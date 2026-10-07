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
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

/**
 * ÜCRETSİZ DÖNEM (2026-10-07): SINIRLI firma = DOĞRULANMAMIŞ firma (saklı
 * kademesi STANDART → 2 koltuk, satınalma yetkisi yok). Doğrulanmış firma
 * saklı kademesinden bağımsız en üst kademededir (6 koltuk, iki panel);
 * factory varsayılanı VERIFIED + GOLD = tam erişimli firma.
 */
const LIMITED = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" } as const;
/** Kullanıcıya dönen ret metni paket adı anmaz. */
const PACKAGE_WORDS = /silver|gold|paket/i;
/** Satınalma yetkisi reddi doğrulama ister. */
const BUY_NEEDS_VERIFICATION = /yalnız doğrulanmış firmada/i;
/** Doğrulanmış firmada (yalnız anahtar kapalıyken ulaşılır) nötr ret metni. */
const NOT_AVAILABLE = /kullanılamıyor/i;

/**
 * Saklı paket makinesi (STANDART 2 / SILVER 4 / GOLD 6, paket düşüşü) yalnız
 * ücretsiz dönem anahtarı KAPALIYKEN doğrulanmış firmaya uygulanır. Anahtarın
 * kapatılacağı gün için bu mantık çalışır kalmalı → çağrıldığı blok anahtarı kapatır.
 */
function withPaidPlansOn() {
  beforeEach(() => {
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
  });
}

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
afterEach(() => {
  jest.restoreAllMocks(); // anahtarı çeviren bloklardan sonra canlı değere dön
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

  it("doğrulanmamış (sınırlı) firmada satınalma koltuğu SAYILMAZ; kayıtlı satınalma izni silinmez; doğrulanınca yeniden sayılır (arayüz testi O-065, DN-04)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { ...LIMITED }); // SAHIP+SA+ST
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
    // Firma doğrulanınca (saklı kademe STANDART kalır) satınalma koltukları
    // yeniden sayılır ve limit en üst kademeninki olur.
    await prisma.company.update({
      where: { id: co.company.id },
      data: { companyVerificationStatus: "VERIFIED" },
    });
    expect(await svc.seatUsage(co.company.id)).toMatchObject({ limit: 6, usedBuy: 2, usedSell: 1 });
  });

  it.each(["PENDING", "REJECTED"] as const)(
    "%s firma da sınırlıdır: limit 2, satınalma koltuğu sayılmaz",
    async (status) => {
      const { svc } = makeUsersService();
      const co = await makeCompanyWithUser(prisma, { tier: "STANDART", companyVerificationStatus: status });
      expect(await svc.seatUsage(co.company.id)).toMatchObject({ limit: 2, used: 1, usedBuy: 0, usedSell: 1 });
    },
  );

  describe("saklı kademe limitleri (ücretsiz dönem anahtarı KAPALI)", () => {
    withPaidPlansOn();

    it("doğrulanmış firmada limit saklı kademeden gelir (STANDART 2 / SILVER 4 / GOLD 6); Gold altında satınalma koltuğu sayılmaz, Gold'a dönünce yeniden sayılır", async () => {
      const { svc } = makeUsersService();
      const co = await makeCompanyWithUser(prisma, { tier: "STANDART" }); // SAHIP+SA+ST
      await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
      expect(await svc.seatUsage(co.company.id)).toMatchObject({ limit: 2, used: 1, usedBuy: 0, usedSell: 1 });
      await prisma.company.update({ where: { id: co.company.id }, data: { tier: "SILVER" } });
      expect(await svc.seatUsage(co.company.id)).toMatchObject({ limit: 4, used: 1, usedBuy: 0 });
      await prisma.company.update({ where: { id: co.company.id }, data: { tier: "GOLD" } });
      expect(await svc.seatUsage(co.company.id)).toMatchObject({ limit: 6, usedBuy: 2, usedSell: 1 });
    });
  });

  it("doğrulanmamış firma limit 2: kurucu satış koltuğu + bekleyen satışçı daveti koltukları doldurur", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      ...LIMITED,
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
      ...LIMITED,
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

describe("Faz 5 — kapılar (doğrulanmamış firma: 2 koltuk)", () => {
  /**
   * 2026-09-14: bu senaryolar eskiden SATIN_ALMACI ile kuruluyordu. Artık
   * sınırlı (doğrulanmamış) firmada satınalma yetkisi HİÇ verilemiyor (ayrı kural, aşağıdaki
   * describe'ta), dolayısıyla koltuk SAYISI kuralını sınamak için satış
   * koltuğu kullanılıyor — iki kural birbirine karışmasın.
   */
  it("dolu: koltuk daveti + rol ataması + reaktivasyon reddedilir; ONAYLAYICI serbest", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      ...LIMITED,
      roles: ["SAHIP", "SATISCI"] as never,
    }); // 1/2
    const second = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]); // 2/2 dolu
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);

    // Metin daha fazla koltuk için DOĞRULAMAYI önerir; paket adı anmaz.
    const full = (await svc
      .invite(co.auth, { email: "yeni@x.com", roles: ["SATISCI"] } as never)
      .catch((e: unknown) => e)) as Error;
    expect(full.message).toMatch(/Koltuk dolu.*doğrulanmış firmalar daha fazla koltuk kullanır/);
    expect(full.message).not.toMatch(PACKAGE_WORDS);
    expect(full.message).not.toMatch(/yükselt/);
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

  it("doğrulanmış firma (tam erişim, 6 koltuk): koltuklu kişiye İKİNCİ grup da yeni koltuk ister", async () => {
    const { svc } = makeUsersService();
    // 6 koltuk: sahip (ST) 1 + iki kişi çift grup 4 = 5; bir kişiye ikinci
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
    // Doğrulanmış firma en üst kademede: "doğrulanın / yükseltin" denmez,
    // koltuk boşaltma yolu söylenir (arayüz testi D-188).
    const err = (await svc
      .invite(co.auth, { email: "sekizinci@x.com", roles: ["SATISCI"] } as never)
      .catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/koltuğu boşaltın/);
    expect(err.message).not.toMatch(/yükselt/);
    expect(err.message).not.toMatch(/doğrulanmış firmalar/);
    expect(err.message).not.toMatch(PACKAGE_WORDS);
  });

  it("bekleyen koltuk davetleri grup bazında sayılır (davet-yağmuru kapalı)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      ...LIMITED,
      roles: ["SAHIP", "SATISCI"] as never,
    }); // 1/2
    await seedInvitation(co.company.id, co.user.id, [CompanyRole.SATISCI], "bekleyen@x.com"); // 1 + 1 bekleyen = 2
    const usage = await svc.seatUsage(co.company.id);
    expect(usage).toMatchObject({ pendingSeatInvites: 1, pendingSell: 1, pendingBuy: 0 });
    await expect(
      svc.invite(co.auth, { email: "ucuncu@x.com", roles: ["SATISCI"] } as never),
    ).rejects.toThrow(/bekleyen davet/);
    // İki gruplu davet 2 koltuk ister. Satınalma yetkisi doğrulanmamış firmada
    // verilemiyor (ayrı kural), o yüzden bu senaryo doğrulanmış firmada.
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
      ...LIMITED,
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
  /**
   * Aynı senaryo iki yoldan: (1) canlı — ücretsiz dönemde tam erişimi DOĞRULAMA
   * verir; doğrulama geri alınınca firma saklı kademesine (STANDART) düşer.
   * (2) saklı paket düşüşü GOLD→STANDART — anahtar kapalıyken geçerli makine.
   */
  const DROP_MODES = [
    {
      name: "ücretsiz dönem: doğrulama geri alındı (tam erişim → sınırlı)",
      paidPlansOn: false,
      start: { tier: "STANDART" },
      drop: { companyVerificationStatus: "UNVERIFIED" },
      restore: { companyVerificationStatus: "VERIFIED" },
      statusAfterDrop: "UNVERIFIED",
    },
    {
      name: "saklı paket GOLD→STANDART (ücretsiz dönem anahtarı KAPALI)",
      paidPlansOn: true,
      start: { tier: "GOLD" },
      drop: { tier: "STANDART", membershipEndAt: new Date(Date.now() + 86_400_000) },
      restore: { tier: "GOLD" },
      statusAfterDrop: "VERIFIED",
    },
  ] as const;

  describe.each(DROP_MODES)("$name", (mode) => {
    beforeEach(() => {
      if (mode.paidPlansOn) jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });

    it("mevcutlar aktif kalır; seçilmeyen koltuğun işlem izinleri düşer (etiket/görüntüleme kalır); açık sipariş kalan koltukluyla tamamlanır; tam erişime dönüş kapıyı açar", async () => {
      const { svc } = makeUsersService();
      const co = await makeCompanyWithUser(prisma, { ...mode.start }); // kurucu SA+ST = 2
      expect(await svc.seatUsage(co.company.id)).toMatchObject({ limit: 6, used: 2, overflow: 0 });
      const u2 = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI, CompanyRole.YONETICI]); // +1 = 3
      const u3 = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]); // +1 = 4

      await prisma.company.update({ where: { id: co.company.id }, data: mode.drop });
      // Tam erişim altında kurucunun satınalma koltuğu sayılmaz (O-065): 3 satış / 2.
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
        companyVerificationStatus: mode.statusAfterDrop,
        country: "TR",
        tier: "STANDART",
      } as never;
      await expect(orders.accept(u2Auth, order.id, acceptInput)).rejects.toThrow(
        /'Satış siparişi işlemleri' yetkisi/,
      );
      const ownerAuth = {
        ...(co.auth as object),
        tier: "STANDART",
        companyVerificationStatus: mode.statusAfterDrop,
        roles: ownerAfter.roles,
        permissions: ownerAfter.permissions,
      } as never;
      await expect(orders.accept(ownerAuth, order.id, acceptInput)).resolves.toBeDefined();

      // Tam erişime dönüş: kapı açılır, düşen koltuk geri verilebilir.
      await prisma.company.update({ where: { id: co.company.id }, data: mode.restore });
      await expect(
        svc.updateRoles(co.auth, u2.id, { roles: ["YONETICI", "SATISCI"] } as never),
      ).resolves.toBeDefined();
    });
  });

  it("seçim doğrulamaları: limit üstü seçim + koltuksuz çift reddedilir; eski istemci keepUserIds kişinin tüm gruplarını korur", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, { ...LIMITED }); // kurucu SA+ST (satınalma sayılmaz)
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
    // Doğrulanmamış firmada satınalma koltuğu seçilemez (O-069); metin doğrulama ister.
    const buyErr = (await svc
      .applySeatSelection(co.auth, [{ userId: co.user.id, group: "buy" }])
      .catch((e: unknown) => e)) as Error;
    expect(buyErr.message).toMatch(BUY_NEEDS_VERIFICATION);
    expect(buyErr.message).not.toMatch(PACKAGE_WORDS);
    // Eski istemci: keepUserIds → kurucunun satış koltuğu korunur, a ve b düşer.
    const res = await svc.applySeatSelection(co.auth, [co.user.id]);
    expect(res).toEqual({ ok: true, droppedCount: 2 });
    expect((await svc.seatUsage(co.company.id)).used).toBe(1);
  });

  describe("saklı paket GOLD→SILVER (ücretsiz dönem anahtarı KAPALI)", () => {
    withPaidPlansOn();

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
      ).rejects.toThrow(NOT_AVAILABLE); // doğrulanmış firmaya nötr metin (paket adı yok)
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
});

/**
 * SINIRLI FİRMADA SATINALMA YETKİSİ VERİLEMEZ (2026-09-14, kullanıcı kararı;
 * ücretsiz dönem 2026-10-07: sınırlı = doğrulanmamış firma, metin doğrulama ister).
 *
 * Talep açma ve kazandırma zaten `BUYING_TIER` (GOLD) kapısının arkasındaydı;
 * yetkiyi yine de vermek kullanıcıya çalışmayan bir düğme gösteriyor ve
 * ücretsiz paketin iki koltuğundan birini boşuna yakıyordu. Kapı koltuk
 * SAYIMINDAN ÖNCE çalışır — "koltuk dolu" demek yanıltıcı olurdu, sorun sayı
 * değil paket.
 */
describe("Satınalma yetkisi kapısı (doğrulama)", () => {
  it("doğrulanmamış firma: davet, rol ataması ve izin yazımı REDDEDİLİR; metin doğrulama ister, paket anmaz", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      ...LIMITED,
      roles: ["SAHIP"] as never,
    });
    const kisi = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);

    for (const attempt of [
      () => svc.invite(co.auth, { email: "alici@x.com", roles: ["SATIN_ALMACI"] } as never),
      () => svc.updateRoles(co.auth, kisi.id, { roles: ["ONAYLAYICI", "SATIN_ALMACI"] } as never),
      () => svc.setPermissions(co.auth, kisi.id, ["buy:listing:manage"]),
    ]) {
      const err = (await attempt().then(() => null, (e: unknown) => e)) as Error | null;
      expect(err).not.toBeNull();
      expect(err!.message).toMatch(BUY_NEEDS_VERIFICATION);
      expect(err!.message).not.toMatch(PACKAGE_WORDS);
    }
    // İncelemedeki / reddedilmiş firma durumuna özel metni alır.
    for (const [status, pattern] of [
      ["PENDING", /inceleniyor/i],
      ["REJECTED", /yeniden başvurun/i],
    ] as const) {
      await prisma.company.update({
        where: { id: co.company.id },
        data: { companyVerificationStatus: status },
      });
      await expect(
        svc.invite(co.auth, { email: `alici-${status}@x.com`, roles: ["SATIN_ALMACI"] } as never),
      ).rejects.toThrow(pattern);
    }
  });

  it("doğrulanmamış firma: SATIŞ yetkisi serbest — kapı yalnız satınalmaya", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      ...LIMITED,
      roles: ["SAHIP"] as never,
    });
    await expect(
      svc.invite(co.auth, { email: "satici@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
  });

  it("doğrulanmamış firmanın saklı SILVER paketi de YETMEZ — kapı satınalma (en üst) kademesinde; satış serbest", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      tier: "SILVER",
      companyVerificationStatus: "UNVERIFIED",
      roles: ["SAHIP"] as never,
    });
    const err = (await svc
      .invite(co.auth, { email: "alici3@x.com", roles: ["SATIN_ALMACI"] } as never)
      .catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(BUY_NEEDS_VERIFICATION);
    expect(err.message).not.toMatch(PACKAGE_WORDS);
    await expect(
      svc.invite(co.auth, { email: "satici3@x.com", roles: ["SATISCI"] } as never),
    ).resolves.toBeDefined();
  });

  describe("saklı SILVER paketi (ücretsiz dönem anahtarı KAPALI)", () => {
    withPaidPlansOn();

    it("SILVER de YETMEZ — kapı PAID değil BUYING kademesinde", async () => {
      const { svc } = makeUsersService();
      const co = await makeCompanyWithUser(prisma, {
        tier: "SILVER",
        roles: ["SAHIP"] as never,
      });
      // Silver satış paketidir; talep açma/kazandırma yalnız Gold'da.
      // Doğrulanmış firmaya nötr metin döner (paket adı yok).
      const err = (await svc
        .invite(co.auth, { email: "alici3@x.com", roles: ["SATIN_ALMACI"] } as never)
        .catch((e: unknown) => e)) as Error;
      expect(err.message).toMatch(NOT_AVAILABLE);
      expect(err.message).not.toMatch(PACKAGE_WORDS);
      // Satış yetkisi Silver'da elbette serbest.
      await expect(
        svc.invite(co.auth, { email: "satici3@x.com", roles: ["SATISCI"] } as never),
      ).resolves.toBeDefined();
    });
  });

  it("uykudaki buy koltuğu olan kişiye YENİ buy işlem izni doğrulanmamış firmada REDDEDİLİR; mevcutlar kalır (arayüz testi T3)", async () => {
    const { svc } = makeUsersService();
    const co = await makeCompanyWithUser(prisma, {
      ...LIMITED,
      roles: ["SAHIP"] as never,
    });
    // Tam erişimliyken verilmiş, firma sınırlıya düşünce uykuya geçmiş talep yönetme izni.
    const kisi = await makeUser(prisma, co.company.id, [], {
      permissions: ["buy:view", "buy:listing:manage"],
    });
    await expect(
      svc.setPermissions(co.auth, kisi.id, ["buy:view", "buy:listing:manage", "buy:award"]),
    ).rejects.toThrow(BUY_NEEDS_VERIFICATION);
    await expect(
      svc.setPermissions(co.auth, kisi.id, [
        "buy:view",
        "buy:listing:manage",
        "buy:order:manage",
        "buy:inquiry:send",
      ]),
    ).rejects.toThrow(BUY_NEEDS_VERIFICATION);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: kisi.id } });
    expect(row.permissions).not.toContain("buy:award");
    // Mevcut uykudaki izin korunarak başka değişiklik yapılabilir.
    await expect(
      svc.setPermissions(co.auth, kisi.id, ["buy:view", "buy:listing:manage", "sell:view"]),
    ).resolves.toBeDefined();
  });

  it.each(["GOLD", "SILVER", "STANDART"] as const)(
    "doğrulanmış firma (saklı kademe %s): satınalma yetkisi verilebilir",
    async (tier) => {
      const { svc } = makeUsersService();
      const co = await makeCompanyWithUser(prisma, {
        tier,
        roles: ["SAHIP"] as never,
      });
      await expect(
        svc.invite(co.auth, { email: "alici2@x.com", roles: ["SATIN_ALMACI"] } as never),
      ).resolves.toBeDefined();
    },
  );
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
    // Fikstür saklı paket düşüşüne (GOLD→SILVER, 4 koltuk) dayanır → anahtar bu testte kapalı.
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    const svc = await svcWithNotifications();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // tek yönetici: kurucu
    const sellers = [];
    for (let i = 0; i < 5; i++) {
      sellers.push(await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]));
    }
    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "SILVER", membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    // Kurucu kendi satış koltuğunu bırakıp ilk dört satışçıyı seçer (beşinci düşer).
    await svc.applySeatSelection(
      co.auth,
      sellers.slice(0, 4).map((s) => ({ userId: s.id, group: "sell" as const })),
    );
    const ownerRow = await prisma.companyUser.findUniqueOrThrow({ where: { id: co.user.id } });
    expect(ownerRow.permissions).not.toContain("users:manage"); // örtük — saklanmaz
    // Kendi koltuğunu bırakan kurucuya "işlem yetkileriniz kaldırıldı"
    // bildirimi gitmez (arayüz testi api2-01 yeniden doğrulama). Bildirim
    // best-effort (void) — diğer düşen kişininki yazılana dek beklenir.
    const seatNotices = (id: string) =>
      prisma.notification.count({ where: { companyUserId: id, type: "seat_selection" } });
    for (let i = 0; i < 40 && (await seatNotices(sellers[4]!.id)) === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(await seatNotices(sellers[4]!.id)).toBe(1); // düşen diğer kişi bilgilenir
    expect(await seatNotices(co.user.id)).toBe(0);
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

/**
 * Arayüz testi O-065'te firma GOLD→SILVER düşüşünde "paketiniz Silver'a alındı"
 * bildirimi alıyordu. Ücretsiz dönem (2026-10-07): hiçbir bildirim paket adı
 * anamaz → admin saklı kademeyi değiştirince firmaya bildirim GİTMEZ; kayıt
 * denetim izinde ve üyelik geçmişinde durur. (Ücretli paketler dönünce bildirim
 * git geçmişinden geri alınır — o gün bu test eski beklentisine döner.)
 */
describe("admin saklı kademe değişimi firmaya paket bildirimi yollamaz (arayüz testi O-065, ücretsiz dönem)", () => {
  async function adminRig() {
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const { EmailSuppressionService } = await import(
      "../../src/modules/email/email-suppression.service"
    );
    const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const admin = new AdminCompaniesService(
      prisma as never,
      {} as never,
      email as never,
      notifications as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
    );
    return { admin, notifications, email };
  }

  it.each([
    ["anahtar AÇIK (canlı)", true],
    ["anahtar KAPALI", false],
  ] as const)(
    "%s: Silver'a alma ve Gold'a çıkarma kademeyi + denetim izini + üyelik olayını yazar, firmaya bildirim/e-posta gitmez",
    async (_name, freePeriod) => {
      // Saklı kademe makinesi iki anahtar değerinde de yazmaya devam eder.
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", freePeriod);
      const { admin, notifications, email } = await adminRig();
      const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

      await admin.setTier(co.company.id, "SILVER", 12, "admin-1");
      expect((await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } })).tier).toBe("SILVER");
      // Koltuk limiti: canlıda doğrulanmış firma tam erişimli kalır; anahtar kapalıyken saklı kademe geçerli.
      expect((await readSeatUsage(prisma as never, co.company.id)).limit).toBe(freePeriod ? 6 : 4);

      await admin.setTier(co.company.id, "GOLD", 12, "admin-1");
      expect((await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } })).tier).toBe("GOLD");

      expect(notifications.pushToCompany).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(
        await prisma.auditLog.count({
          where: { action: "admin.company.tier_set", entityId: co.company.id },
        }),
      ).toBe(2);
      expect(
        await prisma.companyMembershipEvent.count({
          where: { companyId: co.company.id, action: "GRANT" },
        }),
      ).toBe(2);
    },
  );
});
