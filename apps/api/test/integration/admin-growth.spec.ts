/**
 * BÜYÜME ÖLÇÜMÜ (2026-09-27, Faz 4): davet hunisi (davet → e-posta → teslim →
 * tıklama → kayıt → teklif), iptal nedenleri, kaynak/ülke kırılımı, soğuk
 * davet sağlığı, AI keşif maliyeti, program e-postaları. Yalnız sayılar.
 */
import { AdminGrowthService } from "../../src/modules/admin-growth/admin-growth.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("AdminGrowthService.inviteReport", () => {
  it("huni, iptal nedenleri, kaynak/ülke, sağlık ve keşif maliyeti", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const supplier = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "OPEN" });
    const mk = async (email: string, extra: Record<string, unknown>) => {
      const ref = await prisma.companyReferralInvite.create({
        data: { inviterCompanyId: buyer.company.id, email, invitedById: buyer.user.id, ...((extra.ref as object) ?? {}) },
      });
      await prisma.externalListingInvite.create({
        data: {
          listingId: listing.id,
          inviterCompanyId: buyer.company.id,
          referralInviteId: ref.id,
          email,
          locale: (extra.locale as string) ?? "tr",
          country: (extra.country as string) ?? null,
          source: (extra.source as "MANUAL") ?? "MANUAL",
          state: (extra.state as "SENT") ?? "SENT",
          cancelReason: (extra.cancelReason as string) ?? null,
        },
      });
      return ref;
    };
    await mk("a@x.it", { country: "IT", locale: "en", source: "AI_AUTO", ref: { lastClickedAt: new Date() } });
    await mk("b@x.it", { country: "IT", locale: "en", source: "AI_AUTO", ref: { status: "ACCEPTED", acceptedAt: new Date(), acceptedCompanyId: supplier.company.id, lastClickedAt: new Date() } });
    await mk("c@x.com", { state: "CANCELLED", cancelReason: "OPTED_OUT" });
    await makeBid(prisma, { listingId: listing.id, bidderCompanyId: supplier.company.id, createdById: supplier.user.id, amount: 10, status: "SUBMITTED" });
    for (const [i, extra] of [[0, { deliveredAt: new Date() }], [1, { complainedAt: new Date() }]] as const) {
      await prisma.emailLog.create({
        data: { template: "tender_external_invite", toEmail: `e${i}@x.it`, subject: "s", provider: "t", status: "SENT", contextType: "tender_external_invite", contextId: `c${i}`, ...extra },
      });
    }
    await prisma.supplierDiscoveryRun.create({ data: { companyId: buyer.company.id, trigger: "PUBLISH", state: "DONE", costUsd: 0.12 } });

    const svc = new AdminGrowthService(prisma as never, { capStatus: async () => ({ cap: 150, braked: null, sentToday: 2 }) } as never);
    const r = await svc.inviteReport(30);
    expect(r.funnel).toEqual({ invited: 3, emailed: 2, emails: 2, delivered: 1, clicked: 2, signedUp: 1, quoted: 1 });
    expect(r.cancelled).toEqual({ OPTED_OUT: 1 });
    expect(r.bySource).toMatchObject({ AI_AUTO: 2, MANUAL: 1 });
    expect(r.byCountry[0]).toEqual({ country: "IT", invited: 2 });
    expect(r.health).toMatchObject({ cap: 150, sent7d: 2, complaints7d: 1, complaintRatePct: 50 });
    expect(r.discovery.costUsd).toBeCloseTo(0.12);
    // Kişisel veri yok.
    expect(JSON.stringify(r)).not.toMatch(/@x\./);
  });
});
