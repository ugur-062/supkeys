/**
 * MembershipScheduler.downgradeExpired — süresi biten PAKET → STANDARD +
 * downgrade olan firmanın GİDEN bekleyen davetlerinin (kayıtlı + referral)
 * temizliği. Gelen davetler ve süresi geçmemiş firmalar korunur.
 */
import { MembershipScheduler } from "../../src/modules/company-auth/schedulers/membership.scheduler";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("MembershipScheduler.downgradeExpired", () => {
  it("süresi biten PAKET → STANDARD + giden bekleyen davetler iptal; gelen davet & süresi geçmemiş firma korunur", async () => {
    const scheduler = new MembershipScheduler(prisma as never);
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);

    // A: süresi dolmuş PAKET → düşecek.
    const a = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await prisma.company.update({
      where: { id: a.company.id },
      data: { membershipEndAt: past },
    });
    const b = await makeCompanyWithUser(prisma, { tier: "PAKET" }); // A'nın davet ettiği
    const c = await makeCompanyWithUser(prisma, { tier: "PAKET" }); // A'ya davet gönderen
    // D: süresi geçmemiş PAKET → dokunulmamalı.
    const d = await makeCompanyWithUser(prisma, { tier: "PAKET" });
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

    await scheduler.downgradeExpired();

    // Tier: A düştü, D korundu.
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } }))
        .tier,
    ).toBe("STANDARD");
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: d.company.id } }))
        .tier,
    ).toBe("PAKET");

    // A'nın gideni silindi, geleni korundu.
    expect(
      await prisma.companyConnection.findUnique({ where: { id: outgoing.id } }),
    ).toBeNull();
    expect(
      await prisma.companyConnection.findUnique({ where: { id: incoming.id } }),
    ).not.toBeNull();
    // A'nın referral daveti silindi.
    expect(
      await prisma.companyReferralInvite.findUnique({
        where: { id: referral.id },
      }),
    ).toBeNull();
  });

  it("düşecek firma yoksa hiçbir şeye dokunmaz", async () => {
    const scheduler = new MembershipScheduler(prisma as never);
    const a = await makeCompanyWithUser(prisma, { tier: "PAKET" }); // membershipEndAt null
    await scheduler.downgradeExpired();
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: a.company.id } }))
        .tier,
    ).toBe("PAKET");
  });
});
