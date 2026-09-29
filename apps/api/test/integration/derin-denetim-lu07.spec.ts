/**
 * Derin denetim 2026-09-29 — LU-07 (DÜŞÜK): bağlantılar, pano, belgeler.
 *
 * - 7 günlük referral freni dış talep davetini görür (contextId uyuşmazlığı);
 *   dispatcher adres geçmişi referral e-postasını sayar.
 * - Dış talep daveti BUYING_TIER (GOLD) ister; GOLD→SILVER kuyruğu iptal eder.
 * - Davet önizlemesi askıdaki/pasif firmanın talebini göstermez.
 * - Satış aktivite akışı/sayaçları taslak ve embargolu talebi davetliye göstermez.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { ActionCenterService } from "../../src/modules/company-dashboard/action-center.service";
import { CompanyDashboardService } from "../../src/modules/company-dashboard/company-dashboard.service";
import type { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

type SendArg = { to: { email: string }; templateData: { template: string }; context: { type: string; id: string } };

/** Gerçek EmailService gibi EmailLog satırı yazar. */
function makeEmail() {
  return {
    send: jest.fn(async (a: SendArg) => {
      await prisma.emailLog.create({
        data: {
          template: a.templateData.template,
          toEmail: a.to.email,
          subject: "s",
          provider: "test",
          status: "SENT",
          contextType: a.context.type,
          contextId: a.context.id,
        },
      });
      return { emailLogId: "t", sent: true };
    }),
  };
}

const config = { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };

function makeService() {
  return new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    makeEmail() as never,
    config as never,
    { notify: jest.fn(), pushToCompany: jest.fn(), pushToUser: jest.fn() } as never,
    new AuditService(prisma as never),
  );
}

const FUTURE = new Date(Date.now() + 10 * 24 * 3_600_000);
const openListing = (companyId: string, userId: string, extra: Partial<Prisma.ListingUncheckedCreateInput> = {}) =>
  makeListing(prisma, { companyId, createdById: userId, type: "ALIM", status: "OPEN", closesAt: FUTURE, ...extra });

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("referral 7 günlük freni ↔ dış talep daveti", () => {
  it("adrese talep daveti GİTTİYSE aynı firmanın 'e-posta ile davet et'i ALREADY_INVITED; gitmemişse serbest", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["gitti@firma.com", "bekliyor@firma.com"]);
    // Dispatcher gönderdi: satır SENT + sentAt (e-posta ExternalListingInvite id'siyle loglanır).
    await prisma.externalListingInvite.updateMany({
      where: { email: "gitti@firma.com" },
      data: { state: "SENT", sentAt: new Date() },
    });

    await expect(service.inviteByEmail(owner.auth, "gitti@firma.com")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ALREADY_INVITED" }),
    });
    // Kuyrukta bekleyen (henüz gitmemiş) talep daveti freni tetiklemez.
    await expect(service.inviteByEmail(owner.auth, "bekliyor@firma.com")).resolves.toMatchObject({ kind: "invited" });
  });

  it("dispatcher: adrese son günlerde referral e-postası gittiyse AI talep daveti ERTELENİR", async () => {
    const service = makeService();
    const email = makeEmail();
    const d = new ExternalInviteDispatcher(prisma as never, email as never, config as never, undefined as never);
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await prisma.emailLog.create({
      data: {
        template: "referral_invite",
        toEmail: "ref@x.com",
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "referral_invite",
        contextId: "eski",
        queuedAt: new Date(Date.now() - 2 * 24 * 3_600_000),
      },
    });
    await service.inviteExternalForListing(owner.auth, listing.id, ["ref@x.com", "temiz@x.com"], "AI_FORM");
    await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });

    await d.dispatch();
    expect(email.send.mock.calls.map((c) => (c[0] as SendArg).to.email)).toEqual(["temiz@x.com"]);
    expect((await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "ref@x.com" } })).state).toBe("QUEUED");
  });
});

describe("dış talep daveti paket kapısı", () => {
  it("SILVER firma dış talep daveti kuyruğa ALAMAZ (iç davetle aynı GOLD kapısı)", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const listing = await openListing(owner.company.id, owner.user.id);
    await expect(service.inviteExternalForListing(owner.auth, listing.id, ["dis@firma.com"])).rejects.toMatchObject({
      status: 403,
    });
    expect(await prisma.externalListingInvite.count()).toBe(0);
  });

  it("admin GOLD → SILVER: kuyruktaki dış talep davetleri iptal, referral daveti ve gönderilmiş satır kalır", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { membershipEndAt: new Date(Date.now() + 90 * 24 * 3_600_000) },
    });
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["kuyruk@firma.com", "gitti@firma.com"]);
    await prisma.externalListingInvite.updateMany({ where: { email: "gitti@firma.com" }, data: { state: "SENT", sentAt: new Date() } });

    const admin = new AdminCompaniesService(
      prisma as never,
      {} as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1) } as never,
      config as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
    );
    await admin.setTier(owner.company.id, "SILVER", 12, "admin-1");

    expect(await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "kuyruk@firma.com" } })).toMatchObject({
      state: "CANCELLED",
      cancelReason: "INVITER_DOWNGRADED",
    });
    expect((await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "gitti@firma.com" } })).state).toBe("SENT");
    // SILVER bağlantı/referral daveti gönderebilir — referral satırları iptal edilmez.
    expect(await prisma.companyReferralInvite.count({ where: { status: "PENDING" } })).toBe(2);
  });
});

describe("davet önizlemesi — askıdaki firma", () => {
  it("sahibi askıya alınan/pasifleşen firmanın talebi önizlemede 404; askı kalkınca yine açılır", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["hedef@firma.com"]);
    await prisma.externalListingInvite.updateMany({ data: { state: "SENT", sentAt: new Date() } });
    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "hedef@firma.com" } })).token;
    expect((await service.invitePreview(token)).listingId).toBe(listing.id);

    await prisma.company.update({ where: { id: owner.company.id }, data: { isBlocked: true } });
    await expect(service.invitePreview(token)).rejects.toMatchObject({ status: 404 });
    await prisma.company.update({ where: { id: owner.company.id }, data: { isBlocked: false, isActive: false } });
    await expect(service.invitePreview(token)).rejects.toMatchObject({ status: 404 });

    await prisma.company.update({ where: { id: owner.company.id }, data: { isActive: true } });
    expect((await service.invitePreview(token)).listingId).toBe(listing.id);
  });
});

describe("satış panosu — taslak/embargolu talep davetliye sızmaz", () => {
  it("satisAktivite, satisStats ve Aksiyon Merkezi yalnız yayımlanmış + embargosu geçmiş talebin davetini gösterir", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const seller = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const visible = await openListing(buyer.company.id, buyer.user.id, { title: "Görünür talep" });
    const draft = await openListing(buyer.company.id, buyer.user.id, { title: "Taslak talep", status: "DRAFT" });
    const inApproval = await openListing(buyer.company.id, buyer.user.id, { title: "Onay bekleyen", status: "IN_APPROVAL" });
    const embargoed = await openListing(buyer.company.id, buyer.user.id, {
      title: "Embargolu talep",
      bidsOpenAt: new Date(Date.now() + 2 * 24 * 3_600_000),
    });
    for (const l of [visible, draft, inApproval, embargoed]) {
      await prisma.listingInvitation.create({
        data: { listingId: l.id, invitedCompanyId: seller.company.id, invitedById: buyer.user.id },
      });
    }
    const dashboard = new CompanyDashboardService(
      prisma as never,
      { getRatesOnDates: jest.fn(async (_c: string, ds: Date[]) => ds.map(() => 1)) } as never,
    );

    const feed = await dashboard.satisAktivite(seller.auth, 20, 1);
    const invitationTitles = feed.rows.filter((r) => r.type === "invitation").map((r) => r.title);
    expect(invitationTitles).toEqual(["Görünür talep"]);
    expect(feed.total).toBe(1);
    expect(JSON.stringify(feed)).not.toContain(draft.id);
    expect(JSON.stringify(feed)).not.toContain(embargoed.id);

    const stats = (await dashboard.satisStats(seller.auth)) as { invitations: { active: number } };
    expect(stats.invitations.active).toBe(1);

    const ac = await new ActionCenterService(prisma as never).satis(seller.company.id);
    expect(ac.rows.find((r) => r.key === "unansweredInvites")?.count ?? 0).toBe(1);

    // Embargo kalkınca görünür olur.
    await prisma.listing.update({ where: { id: embargoed.id }, data: { bidsOpenAt: new Date(Date.now() - 60_000) } });
    expect((await dashboard.satisAktivite(seller.auth, 20, 1)).total).toBe(2);
  });
});
