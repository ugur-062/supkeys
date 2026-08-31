/**
 * Faz C — dış ihale daveti sözleşmesi: sahiplik, günlük tavan (20), aynı
 * adrese tek davet, opt-out/kayıtlı-adres atlama, referral kaydına listingId,
 * opt-out endpoint'i.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

function makeService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const blocks = { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never;
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") } as never;
  const notifications = {
    notify: jest.fn().mockResolvedValue(1),
    pushToCompany: jest.fn().mockResolvedValue(1),
    pushToUser: jest.fn().mockResolvedValue(1),
  } as never;
  const service = new CompanyConnectionsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
    prisma as never,
    blocks,
    email as never,
    config,
    notifications,
    new AuditService(prisma as never),
  );
  return { service, email };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("inviteExternalForListing", () => {
  it("gönderim: referral kaydı listingId'li oluşur, e-posta şablonu tender_external_invite", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      title: "Baret alımı",
    });
    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      "dis@firma.com",
    ]);
    expect(res.results).toEqual([{ email: "dis@firma.com", status: "SENT" }]);
    const inv = await prisma.companyReferralInvite.findFirst({
      where: { email: "dis@firma.com" },
    });
    expect(inv?.listingId).toBe(listing.id);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateData: expect.objectContaining({
          template: "tender_external_invite",
          data: expect.objectContaining({ tenderTitle: "Baret alımı" }),
        }),
      }),
    );
  });

  it("aynı adrese ikinci davet SKIPPED; opt-out ve kayıtlı adres SKIPPED", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const registered = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await prisma.referralOptOut.create({ data: { email: "istemiyor@x.com" } });

    await service.inviteExternalForListing(owner.auth, listing.id, ["bir@x.com"]);
    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      "bir@x.com",
      "istemiyor@x.com",
      registered.user.email.toLowerCase(),
    ]);
    const byEmail = Object.fromEntries(res.results.map((r) => [r.email, r]));
    expect(byEmail["bir@x.com"]!.status).toBe("SKIPPED");
    expect(byEmail["istemiyor@x.com"]!.status).toBe("SKIPPED");
    expect(byEmail[registered.user.email.toLowerCase()]!.status).toBe("SKIPPED");
  });

  it("günlük tavan 20: 20 gönderim sonrası yenisi SKIPPED", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    const first = Array.from({ length: 20 }, (_, i) => `t${i}@cap.com`);
    const r1 = await service.inviteExternalForListing(owner.auth, listing.id, first);
    expect(r1.results.filter((r) => r.status === "SENT")).toHaveLength(20);
    const r2 = await service.inviteExternalForListing(owner.auth, listing.id, [
      "fazla@cap.com",
    ]);
    expect(r2.results[0]!.status).toBe("SKIPPED");
    expect(r2.results[0]!.reason).toMatch(/limit/i);
  });

  it("başka firmanın ihalesi için 404; kapalı ihale için 400", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    const foreign = await makeListing(prisma, {
      companyId: other.company.id,
      createdById: other.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await expect(
      service.inviteExternalForListing(owner.auth, foreign.id, ["a@b.com"]),
    ).rejects.toThrow(/bulunamadı/i);
    const closed = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "AWARDED",
    });
    await expect(
      service.inviteExternalForListing(owner.auth, closed.id, ["a@b.com"]),
    ).rejects.toThrow(/taslak|açık/i);
  });

  it("markReferralOptOut: token'daki adres opt-out olur; geçersiz token 404", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await service.inviteExternalForListing(owner.auth, listing.id, ["opt@x.com"]);
    const inv = await prisma.companyReferralInvite.findFirst({
      where: { email: "opt@x.com" },
    });
    const res = await service.markReferralOptOut(inv!.token);
    expect(res.ok).toBe(true);
    expect(await prisma.referralOptOut.findUnique({ where: { email: "opt@x.com" } })).not.toBeNull();
    await expect(service.markReferralOptOut("yok-token")).rejects.toThrow();
  });
});
