/**
 * AI'IN ÖNERDİĞİ ÜYEYE DOĞRUDAN TALEP DAVETİ (2026-09-28) — sözleşme.
 *
 * Kullanıcı: "bizim sistemimize kayıtlıysa zaten ayrıca davet etsin diye onu
 * ayrıca gösterelim, kategori veyahut kalem eşleşmesi var diye; davet ederken
 * en üstte seçili olur".
 *
 *  - Bağlantı ŞARTI YOK: üye talebe davetli olur (origin "AI" + gerekçe).
 *  - Engelli (iki yön), pasif ve talebin ülkesine uymayan firma NOT_ELIGIBLE.
 *  - Zaten davetli → ALREADY_INVITED (ikinci davet/e-posta yok).
 *  - Günlük tavan e-posta davetleriyle ORTAK (60/gün/firma) → DAILY_LIMIT.
 *  - Gerekçe: vitrinde kalemi satan ürün adı, yoksa kategori eşleşmesi.
 *  - E-posta alıcının yerel gününde 3'ü geçmez, fazlası akşam özetine
 *    (INVITATION); bu talep için zaten e-posta almış adrese ikincisi gitmez.
 *  - Keşif turu platform üyelerini de önerir; web'de adresi üyeyle eşleşen
 *    aday aynı satıra katılır (BOTH); tek tık davet üyeyi talebe davet eder.
 */
import { foldSearchText } from "@rothern/shared";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { DiscoveryRunsService } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const DAY = 24 * 3_600_000;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** Arka plandaki bildirim işi bitene dek bekle (fire-and-forget). */
async function settle(check: () => Promise<boolean> | boolean, ms = 3_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function setup(extra: Record<string, unknown> = {}) {
  const owner = await makeCompanyWithUser(prisma, { tier: "GOLD", name: "Alıcı Makina AŞ" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    status: "OPEN",
    visibility: "PRIVATE",
    categoryIds: ["31161600"],
    closesAt: new Date(Date.now() + 7 * DAY),
    publishedAt: new Date(),
    inviteShowName: true,
    ...extra,
  });
  await makeItem(prisma, listing.id, { name: "M6 cıvata" });
  return { owner, listing };
}

async function productSeller(name: string) {
  const s = await makeCompanyWithUser(prisma, { tier: "SILVER", name });
  await prisma.company.update({
    where: { id: s.company.id },
    data: { slug: `s-${s.company.id}`, publicEnabled: true },
  });
  await prisma.companyItem.create({
    data: {
      companyId: s.company.id,
      createdById: s.user.id,
      name: "M6 Cıvata DIN 933",
      unit: "adet",
      slug: "m6-civata",
      isPublic: true,
      publishedAt: new Date(),
      searchText: foldSearchText("M6 Cıvata DIN 933 bağlantı elemanı"),
    },
  });
  return s;
}

async function categorySeller(name: string, country = "TR") {
  const s = await makeCompanyWithUser(prisma, { tier: "SILVER", name, country });
  await prisma.company.update({
    where: { id: s.company.id },
    data: { sellerCategoryIds: ["31000000"], sellerSubCategoryIds: ["31161600"] },
  });
  return s;
}

describe("CompanyListingsService.inviteDiscoveredMembers", () => {
  it("bağlantı şartı yok: üye talebe davetli olur, gerekçe (ürün/kategori) yazılır, e-posta gerekçeyle gider", async () => {
    const { service, email } = makeService();
    const { owner, listing } = await setup();
    const byProduct = await productSeller("Cıvata AŞ");
    const byCategory = await categorySeller("Bağlantı Ltd");

    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [
      byProduct.company.id,
      byCategory.company.id,
    ]);
    expect(results).toEqual([
      { companyId: byProduct.company.id, status: "INVITED" },
      { companyId: byCategory.company.id, status: "INVITED" },
    ]);
    const rows = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { invitedCompanyId: true, origin: true, aiReason: true },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { invitedCompanyId: byProduct.company.id, origin: "AI", aiReason: { productName: "M6 Cıvata DIN 933" } },
        { invitedCompanyId: byCategory.company.id, origin: "AI", aiReason: { category: true } },
      ]),
    );
    await settle(() => email.send.mock.calls.length >= 2);
    const sent = email.send.mock.calls.map((c) => c[0] as { to: { email: string }; subject: string; context: { type: string } });
    expect(sent.map((s) => s.context.type)).toEqual(["listing_invitation_ai", "listing_invitation_ai"]);
    const toProduct = sent.find((s) => s.to.email === byProduct.user.email)!;
    // Firma adı görünür (inviteShowName) ve ürün gerekçesi gövdede.
    expect(toProduct.subject).toContain("Alıcı Makina AŞ");
    const body = JSON.stringify((email.send.mock.calls.find((c) => c[0].to.email === byProduct.user.email)![0] as { templateData: unknown }).templateData);
    expect(body).toContain("M6 Cıvata DIN 933");
  });

  it("engelli, pasif ve ülkesi uymayan NOT_ELIGIBLE; zaten davetli ALREADY_INVITED", async () => {
    const { service, blocks } = makeService();
    const { owner, listing } = await setup({ targetCountries: ["TR"] });
    const blocked = await categorySeller("Engelli AŞ");
    const inactive = await categorySeller("Pasif AŞ");
    await prisma.company.update({ where: { id: inactive.company.id }, data: { isActive: false } });
    const foreign = await categorySeller("Schrauben GmbH", "DE");
    const invited = await categorySeller("Davetli AŞ");
    await prisma.listingInvitation.create({
      data: { listingId: listing.id, invitedCompanyId: invited.company.id, invitedById: owner.user.id },
    });
    blocks.blockedCompanyIds.mockResolvedValue([blocked.company.id]);

    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [
      blocked.company.id,
      inactive.company.id,
      foreign.company.id,
      invited.company.id,
    ]);
    expect(results.map((r) => r.status)).toEqual(["NOT_ELIGIBLE", "NOT_ELIGIBLE", "NOT_ELIGIBLE", "ALREADY_INVITED"]);
    expect(await prisma.listingInvitation.count({ where: { listingId: listing.id } })).toBe(1);
  });

  it("ücretsiz ya da doğrulanmamış BAĞLANTISIZ üye AI yoluyla davet edilemez; bağlantılı ücretsiz üye edilir (2026-09-28)", async () => {
    const { service } = makeService();
    const { owner, listing } = await setup();
    const free = await categorySeller("Ücretsiz AŞ");
    await prisma.company.update({ where: { id: free.company.id }, data: { tier: "STANDART" } });
    const unverified = await categorySeller("Belgesiz AŞ");
    await prisma.company.update({ where: { id: unverified.company.id }, data: { companyVerificationStatus: "UNVERIFIED" } });
    const connectedFree = await categorySeller("Bağlı Ücretsiz AŞ");
    await prisma.company.update({ where: { id: connectedFree.company.id }, data: { tier: "STANDART" } });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: owner.company.id,
        inviteeCompanyId: connectedFree.company.id,
        status: "ACTIVE",
        invitedById: owner.user.id,
      },
    });
    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [
      free.company.id,
      unverified.company.id,
      connectedFree.company.id,
    ]);
    expect(results.map((r) => r.status)).toEqual(["NOT_ELIGIBLE", "NOT_ELIGIBLE", "INVITED"]);
    expect(await prisma.listingInvitation.count({ where: { listingId: listing.id } })).toBe(1);
  });

  it("günlük tavan e-posta davetleriyle ORTAK: 59 dış davet + 2 üye → 1 INVITED, 1 DAILY_LIMIT", async () => {
    const { service } = makeService();
    const { owner, listing } = await setup();
    const ref = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: owner.company.id, email: "ref@x.com", invitedById: owner.user.id },
    });
    await prisma.externalListingInvite.createMany({
      data: Array.from({ length: 59 }, (_, i) => ({
        listingId: listing.id,
        inviterCompanyId: owner.company.id,
        referralInviteId: ref.id,
        email: `d${i}@x.com`,
        locale: "tr",
      })),
    });
    const a = await categorySeller("A AŞ");
    const b = await categorySeller("B AŞ");
    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [a.company.id, b.company.id]);
    expect(results.map((r) => r.status)).toEqual(["INVITED", "DAILY_LIMIT"]);
  });

  it("yerel günde 3 e-postadan sonra akşam özetine (INVITATION); bu talep için e-posta almış adrese ikincisi gitmez", async () => {
    const { service, email } = makeService();
    const { owner, listing } = await setup();
    const busy = await categorySeller("Yoğun AŞ");
    const mailed = await categorySeller("Duyurulmuş AŞ");
    for (let i = 0; i < 3; i++) {
      await prisma.emailLog.create({
        data: {
          template: "notification",
          toEmail: busy.user.email,
          subject: "s",
          provider: "test",
          status: "SENT",
          contextType: "listing_invitation_ai",
          contextId: `x${i}`,
        },
      });
    }
    await prisma.emailLog.create({
      data: {
        template: "notification",
        toEmail: mailed.user.email,
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "listing_category_match",
        contextId: listing.id,
      },
    });
    // Akşam özetinde bekleyen kategori eşleşmesi davete dönüşür (tek satır).
    await prisma.emailDigestItem.create({
      data: { email: busy.user.email, locale: "tr", companyId: busy.company.id, kind: "CATEGORY_MATCH", listingId: listing.id },
    });

    await service.inviteDiscoveredMembers(owner.auth, listing.id, [busy.company.id, mailed.company.id]);
    await settle(async () => (await prisma.emailDigestItem.count({ where: { kind: "INVITATION" } })) > 0);
    expect(email.send).not.toHaveBeenCalled();
    const digest = await prisma.emailDigestItem.findMany({ select: { email: true, kind: true, listingId: true } });
    expect(digest).toEqual([{ email: busy.user.email, kind: "INVITATION", listingId: listing.id }]);
    // Uygulama içi bildirim ikisine de gider.
    expect(await prisma.notification.count({ where: { type: "listing_invitation", listingId: listing.id } })).toBeGreaterThanOrEqual(2);
  });
});

describe("DiscoveryRunsService — platform üyeleri", () => {
  function makeRuns(batches: Array<Array<Record<string, unknown>>>) {
    let parse = 0;
    const ai = {
      isEnabled: true,
      callAiSystem: jest.fn(async (o: { responseSchema?: object }) => {
        if (!o.responseSchema) return { text: "research", costUsd: 0.05, downgraded: false, warned: false };
        return { text: JSON.stringify({ companies: batches[parse++] ?? [] }), costUsd: 0.01, downgraded: false, warned: false };
      }),
    };
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const notifications = { pushToUser: jest.fn().mockResolvedValue(1) };
    const config = { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
    const discovery = new SupplierDiscoveryService(prisma as never, ai as never, prisma as never);
    discovery.mxCheck = async () => true;
    const connections = new CompanyConnectionsService(
      prisma as never,
      prisma as never,
      { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
      email as never,
      config as never,
      notifications as never,
      new AuditService(prisma as never),
    );
    const listings = makeService();
    const runs = new DiscoveryRunsService(
      prisma as never,
      prisma as never,
      ai as never,
      discovery,
      connections,
      config as never,
      email as never,
      notifications as never,
      listings.service,
    );
    return { runs, ai };
  }

  it("tur platform üyelerini önerir (MEMBER, gerekçeli); web'de adresi üyeyle eşleşen aynı satıra katılır; tek tık üyeyi talebe davet eder", async () => {
    const { owner, listing } = await setup({ aiDiscovery: true, visibility: "PUBLIC" });
    const member = await categorySeller("Bağlantı Ltd");
    // Gerekçe rozeti katalogdaki adı okur.
    await prisma.category.create({
      data: { id: "31161600", code: "31161600", nameTr: "Vidalar", level: 3, isActive: true } as never,
    });
    const { runs } = makeRuns([
      [
        { name: "Bağlantı Ltd", email: member.user.email, country: "TR", reason: "r", items: [1] },
        { name: "Cıvata AŞ", email: "satis@civata.com.tr", country: "TR", reason: "r", items: [1] },
      ],
      [],
    ]);
    const runId = await runs.enqueue(listing.id, "PUBLISH");
    await runs.process(runId!);

    const view = await runs.forListing(owner.auth, listing.id);
    const cands = view.runs[0]!.candidates;
    const m = cands.find((c) => c.memberCompanyId === member.company.id)!;
    expect(m).toMatchObject({ status: "MEMBER", source: "BOTH", email: null });
    expect(m.matchedCategories).toEqual(["Vidalar"]);
    expect(cands.filter((c) => c.name === "Bağlantı Ltd")).toHaveLength(1);
    expect(cands.find((c) => c.email === "satis@civata.com.tr")!.status).toBe("SUGGESTED");

    const res = await runs.invite(owner.auth, listing.id, cands.map((c) => c.id));
    expect(res.memberResults).toEqual([{ companyId: member.company.id, status: "INVITED" }]);
    expect(res.results.map((r) => r.status)).toEqual(["QUEUED"]);
    expect(
      await prisma.listingInvitation.findFirst({ where: { listingId: listing.id, invitedCompanyId: member.company.id }, select: { origin: true } }),
    ).toEqual({ origin: "AI" });
    const after = await runs.forListing(owner.auth, listing.id);
    expect(after.runs[0]!.candidates.find((c) => c.memberCompanyId === member.company.id)!.status).toBe("INVITED");
  });

  it("AI kapalıyken de üyeler önerilir (model çağrısı yok); üye yoksa tur FAILED", async () => {
    const { listing } = await setup({ aiDiscovery: true, visibility: "PUBLIC" });
    await categorySeller("Bağlantı Ltd");
    const { runs, ai } = makeRuns([]);
    ai.isEnabled = false;
    const runId = await runs.enqueue(listing.id, "PUBLISH");
    await runs.process(runId!);
    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId! }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(run.error).toBe("ai_disabled");
    expect(run.candidates.map((c) => [c.name, c.status, c.source])).toEqual([["Bağlantı Ltd", "MEMBER", "PLATFORM"]]);
    expect(ai.callAiSystem).not.toHaveBeenCalled();

    const { listing: l2 } = await setup({ aiDiscovery: true, visibility: "PUBLIC", categoryIds: ["43211500"] });
    await prisma.listingItem.updateMany({ where: { listingId: l2.id }, data: { name: "Dizüstü bilgisayar" } });
    const id2 = await runs.enqueue(l2.id, "PUBLISH");
    await runs.process(id2!);
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: id2! } })).state).toBe("FAILED");
  });
});
