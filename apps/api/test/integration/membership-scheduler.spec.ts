/**
 * MembershipScheduler.downgradeExpired — süresi biten PAKET → STANDARD +
 * downgrade olan firmanın GİDEN bekleyen davetlerinin (kayıtlı + referral)
 * temizliği. Gelen davetler ve süresi geçmemiş firmalar korunur.
 */
import { MembershipScheduler } from "../../src/modules/company-auth/schedulers/membership.scheduler";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("MembershipScheduler.downgradeExpired", () => {
  it("süresi biten PAKET → STANDARD + giden bekleyen davetler iptal; gelen davet & süresi geçmemiş firma korunur", async () => {
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const scheduler = new MembershipScheduler(
      prisma as never,
      email as never,
      config as never,
    );
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);

    // A: süresi dolmuş PAKET → düşecek.
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: a.company.id },
      data: { membershipEndAt: past },
    });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // A'nın davet ettiği
    const c = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // A'ya davet gönderen
    // D: süresi geçmemiş PAKET → dokunulmamalı.
    const d = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: d.company.id },
      data: { membershipEndAt: future },
    });

    // A → B giden bekleyen davet (iptal edilmeli).
    const outgoing = await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a.company.id,
        inviteeCompanyId: b.company.id,
        invitedById: a.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });
    // C → A gelen bekleyen davet (korunmalı — A kabul edip tedarikçi olabilir).
    const incoming = await prisma.companyConnection.create({
      data: {
        inviterCompanyId: c.company.id,
        inviteeCompanyId: a.company.id,
        invitedById: c.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });
    // A → kayıtsız e-posta referral daveti (iptal edilmeli).
    const referral = await prisma.companyReferralInvite.create({
      data: {
        inviterCompanyId: a.company.id,
        email: "yeni@firma.com",
        invitedById: a.user.id,
      },
    });

    const extListing = await makeListing(prisma, { companyId: a.company.id, createdById: a.user.id, status: "OPEN" });
    const queuedExt = await prisma.externalListingInvite.create({
      data: {
        listingId: extListing.id,
        referralInviteId: referral.id,
        inviterCompanyId: a.company.id,
        email: "yeni@firma.com",
        locale: "tr",
        state: "QUEUED",
        source: "MANUAL",
      },
    });

    await scheduler.downgradeExpired();

    // Tier: A düştü, D korundu.
    const aAfter = await prisma.company.findUniqueOrThrow({
      where: { id: a.company.id },
    });
    expect(aAfter.tier).toBe("STANDART");
    // Y3: membershipEndAt TEMİZLENDİ (bayat geçmiş tarih kalmaz → sonraki cron
    // yeniden eşleştirmez, gelecekteki re-grant/upgrade kırılmaz).
    expect(aAfter.membershipEndAt).toBeNull();
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: d.company.id } }))
        .tier,
    ).toBe("GOLD");

    // A'nın gideni silindi, geleni korundu.
    expect(
      await prisma.companyConnection.findUnique({ where: { id: outgoing.id } }),
    ).toBeNull();
    expect(
      await prisma.companyConnection.findUnique({ where: { id: incoming.id } }),
    ).not.toBeNull();
    // A'nın referral daveti SİLİNMEZ, iptal edilir (yayın denetimi Bölüm 13):
    // silinince talep davetleri cascade ile gidiyor, adres freni/geçmişi
    // sıfırlanıyordu. Kuyrukta bekleyen talep daveti de iptal.
    const refAfter = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: referral.id } });
    expect(refAfter.status).toBe("CANCELLED");
    const extAfter = await prisma.externalListingInvite.findUniqueOrThrow({ where: { id: queuedExt.id } });
    expect(extAfter.state).toBe("CANCELLED");
    expect(extAfter.cancelReason).toBe("INVITER_DOWNGRADED");
  });

  it("düşecek firma yoksa hiçbir şeye dokunmaz", async () => {
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const scheduler = new MembershipScheduler(
      prisma as never,
      email as never,
      config as never,
    );
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // membershipEndAt null
    await scheduler.downgradeExpired();
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } }))
        .tier,
    ).toBe("GOLD");
  });

  it("okuma ile claim arasında uzatılan firma DÜŞÜRÜLMEZ (derin denetim LU-06)", async () => {
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: a.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    const extendedTo = new Date(Date.now() + 365 * 86_400_000);
    // findMany süresi dolmuş firmayı döndürdükten HEMEN sonra admin uzatması
    // yazılır (yarış penceresinin deterministik taklidi).
    const bind = (o: object, k: string | symbol) => {
      const v = Reflect.get(o, k);
      return typeof v === "function" ? v.bind(o) : v;
    };
    const racing = new Proxy(prisma, {
      get(target, key) {
        if (key !== "company") return bind(target, key);
        return new Proxy(target.company, {
          get(ct, ck) {
            if (ck !== "findMany") return bind(ct, ck);
            return async (args: never) => {
              const rows = await ct.findMany(args);
              await target.company.update({
                where: { id: a.company.id },
                data: { membershipEndAt: extendedTo },
              });
              return rows;
            };
          },
        });
      },
    });
    const scheduler = new MembershipScheduler(
      racing as never,
      email as never,
      config as never,
    );
    await scheduler.downgradeExpired();
    const after = await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } });
    expect(after.tier).toBe("GOLD");
    expect(after.membershipEndAt?.getTime()).toBe(extendedTo.getTime());
    expect(email.send).not.toHaveBeenCalled();
    expect(
      await prisma.companyMembershipEvent.count({
        where: { companyId: a.company.id, action: "EXPIRE" },
      }),
    ).toBe(0);
  });
});
