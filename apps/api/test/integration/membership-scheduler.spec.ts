/**
 * MembershipScheduler.downgradeExpired — süresi biten PAKET → STANDARD +
 * downgrade olan firmanın GİDEN bekleyen davetlerinin (kayıtlı + referral)
 * temizliği. Gelen davetler ve süresi geçmemiş firmalar korunur.
 */
import { MembershipScheduler } from "../../src/modules/company-auth/schedulers/membership.scheduler";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("MembershipScheduler — ücretsiz dönem (anahtar AÇIK): zamanlayıcı hiçbir şey yapmaz", () => {
  it("süresi dolmuş saklı paket satırına, giden davete dokunmaz; SEO tazelemesi ve EXPIRE olayı yok", async () => {
    const seo = { companyChanged: jest.fn() };
    const scheduler = new MembershipScheduler(prisma as never, undefined, seo as never);
    const past = new Date(Date.now() - 86_400_000);
    // Doğrulanmış ve doğrulanmamış: ikisine de dokunulmaz (erişimi effectiveTier'ın tembel kuralı belirler).
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const u = await makeCompanyWithUser(prisma, { tier: "SILVER", companyVerificationStatus: "UNVERIFIED" });
    await prisma.company.updateMany({
      where: { id: { in: [a.company.id, u.company.id] } },
      data: { membershipEndAt: past },
    });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const outgoing = await prisma.companyConnection.create({
      data: {
        inviterCompanyId: u.company.id,
        inviteeCompanyId: b.company.id,
        invitedById: u.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });

    await scheduler.downgradeExpired();

    const aAfter = await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } });
    expect(aAfter.tier).toBe("GOLD");
    expect(aAfter.membershipEndAt?.getTime()).toBe(past.getTime());
    const uAfter = await prisma.company.findUniqueOrThrow({ where: { id: u.company.id } });
    expect(uAfter.tier).toBe("SILVER");
    expect(uAfter.membershipEndAt?.getTime()).toBe(past.getTime());
    expect(
      await prisma.companyConnection.findUnique({ where: { id: outgoing.id } }),
    ).not.toBeNull();
    expect(await prisma.companyMembershipEvent.count()).toBe(0);
    expect(seo.companyChanged).not.toHaveBeenCalled();
  });
});

describe("MembershipScheduler.downgradeExpired (ücretsiz dönem anahtarı KAPALI)", () => {
  // Uyuyan ücretli-paket makinesi: anahtar kapandığı gün süre dolumu düşürmesi aynen çalışmalı.
  beforeEach(() => {
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("süresi biten PAKET → STANDARD + giden bekleyen davetler iptal; gelen davet & süresi geçmemiş firma korunur", async () => {
    const scheduler = new MembershipScheduler(prisma as never);
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

  // Arayüz testi D-192 yeniden doğrulama: süre dolumu herkese açık firma/ürün
  // sayfalarını tazeler (Silver+ video ve belgeler önbellekte kalmasın);
  // süresi geçmemiş firma için tazeleme yayılmaz.
  it("düşen firma için SEO tazelemesi yayılır, düşmeyen için yayılmaz", async () => {
    const seo = { companyChanged: jest.fn() };
    const scheduler = new MembershipScheduler(prisma as never, undefined, seo as never);
    const a = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    await prisma.company.update({
      where: { id: a.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    const d = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    await prisma.company.update({
      where: { id: d.company.id },
      data: { membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    await scheduler.downgradeExpired();
    expect(seo.companyChanged).toHaveBeenCalledTimes(1);
    expect(seo.companyChanged).toHaveBeenCalledWith(a.company.id);
  });

  it("düşecek firma yoksa hiçbir şeye dokunmaz", async () => {
    const scheduler = new MembershipScheduler(prisma as never);
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" }); // membershipEndAt null
    await scheduler.downgradeExpired();
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } }))
        .tier,
    ).toBe("GOLD");
  });

  it("okuma ile claim arasında uzatılan firma DÜŞÜRÜLMEZ (derin denetim LU-06)", async () => {
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
    const scheduler = new MembershipScheduler(racing as never);
    await scheduler.downgradeExpired();
    const after = await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } });
    expect(after.tier).toBe("GOLD");
    expect(after.membershipEndAt?.getTime()).toBe(extendedTo.getTime());
    expect(
      await prisma.companyMembershipEvent.count({
        where: { companyId: a.company.id, action: "EXPIRE" },
      }),
    ).toBe(0);
  });
});
