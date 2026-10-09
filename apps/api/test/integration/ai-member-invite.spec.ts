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
 *  - Keşif turu platform üyelerini de bulur; web'de adresi üyeyle eşleşen
 *    aday aynı satıra katılır (BOTH); tur üyeyi talebe KENDİSİ davet eder
 *    (2026-10-08, onay yok — tam sözleşme `ai-auto-invite.spec.ts`).
 */
import { foldSearchText } from "@rothern/shared";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { DiscoveryRunsService } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing, proveAccounts } from "./factories";
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
async function settle(check: () => Promise<boolean> | boolean, ms = 10_000) {
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
  // A real member: its address is proven (a sign-up placeholder gets no request invitation).
  await proveAccounts(prisma, s.company.id);
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
  await proveAccounts(prisma, s.company.id);
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

  /**
   * Round 5 gözden geçirme, R5-06 — keşif kalemin tam adı ürün bulmadığında
   * gevşek kuralı da kullanıyor (`item-product-match.ts`); davet gerekçesi
   * yalnız tam adı arıyordu. Canlıdaki D5 örneği: FIN PA1 Smoke Makina
   * "Hidrolik silindir 80 mm çift etkili" kalemi için yalnız gevşek kuralla
   * bulunuyor, pencere "kalem eşleşmesi" gösteriyor, davet e-postası ürünü
   * ("FIN PA1 Smoke Hidrolik Silindir 80 mm") anmıyordu.
   */
  it("R5-06: yalnız gevşek kuralla eşleşen üyenin daveti de ürünü anar (keşifle aynı eşleştirici); iki nitelik sözcüğüyle eşleşen kategori dışı ürün anılmaz", async () => {
    const { service, email } = makeService();
    const { owner, listing } = await setup();
    await prisma.listingItem.deleteMany({ where: { listingId: listing.id } });
    await makeItem(prisma, listing.id, { lineNo: 1, name: "Hidrolik silindir 80 mm çift etkili" });
    await makeItem(prisma, listing.id, { lineNo: 2, name: "Hidrolik pres 40 ton C tipi" });
    const product = async (name: string, productName: string, declares: Record<string, string[]> = {}) => {
      const s = await makeCompanyWithUser(prisma, { tier: "SILVER", name });
      await proveAccounts(prisma, s.company.id);
      await prisma.company.update({
        where: { id: s.company.id },
        data: { slug: `s-${s.company.id}`, publicEnabled: true, ...declares },
      });
      await prisma.companyItem.create({
        data: {
          companyId: s.company.id,
          createdById: s.user.id,
          name: productName,
          unit: "adet",
          slug: `u-${s.company.id}`,
          isPublic: true,
          publishedAt: new Date(),
          searchText: foldSearchText(productName),
        },
      });
      return s;
    };
    // Talebin segmentinde; kalemin dört anlamlı sözcüğünden ikisi (zayıf eşleşme + kategori).
    const weak = await product("FIN PA1 Smoke Makina", "FIN PA1 Smoke Hidrolik Silindir 80 mm", {
      sellerCategoryIds: ["31000000"],
    });
    // Kategori beyanı yok; ikinci kalemin iki anlamlı sözcüğünün ikisi (kesin eşleşme).
    const strict = await product("Pres AŞ", "Hidrolik Pres");
    // Kategori dışı, yalnız "çift etkili": keşifte aday değildir; elle davet edilse de ürünü gerekçe olmaz.
    const qualifiers = await product("Valf AŞ", "Çift etkili pnömatik valf", { sellerCategoryIds: ["52000000"] });

    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [
      weak.company.id,
      strict.company.id,
      qualifiers.company.id,
    ]);
    expect(results.map((r) => r.status)).toEqual(["INVITED", "INVITED", "INVITED"]);
    const rows = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { invitedCompanyId: true, aiReason: true },
    });
    expect(new Map(rows.map((r) => [r.invitedCompanyId, r.aiReason]))).toEqual(
      new Map<string, unknown>([
        [weak.company.id, { productName: "FIN PA1 Smoke Hidrolik Silindir 80 mm" }],
        [strict.company.id, { productName: "Hidrolik Pres" }],
        [qualifiers.company.id, {}],
      ]),
    );
    await settle(() => email.send.mock.calls.length >= 3);
    const bodyTo = (to: string) =>
      JSON.stringify((email.send.mock.calls.find((c) => c[0].to.email === to)![0] as { templateData: unknown }).templateData);
    expect(bodyTo(weak.user.email)).toContain("FIN PA1 Smoke Hidrolik Silindir 80 mm");
    expect(bodyTo(strict.user.email)).toContain("Hidrolik Pres");
    expect(bodyTo(qualifiers.user.email)).not.toContain("pnömatik valf");
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

  /** Kategorisi uyan satıcı; saklı kademe ve doğrulama durumu açıkça kurulur. */
  async function sellerWith(
    name: string,
    tier: "STANDART" | "SILVER",
    status: "VERIFIED" | "UNVERIFIED" | "PENDING" | "REJECTED",
  ) {
    const s = await categorySeller(name);
    await prisma.company.update({
      where: { id: s.company.id },
      data: { tier, companyVerificationStatus: status },
    });
    return s;
  }
  const connectToOwner = (owner: { company: { id: string }; user: { id: string } }, inviteeId: string) =>
    prisma.companyConnection.create({
      data: {
        inviterCompanyId: owner.company.id,
        inviteeCompanyId: inviteeId,
        status: "ACTIVE",
        invitedById: owner.user.id,
      },
    });

  it("doğrulanmamış BAĞLANTISIZ üye AI yoluyla davet edilemez; bağlantılı doğrulanmamış üye ve doğrulanmış üye (saklı kademesi ne olursa olsun) edilir (2026-09-28 / ücretsiz dönem)", async () => {
    const { service } = makeService();
    const { owner, listing } = await setup();
    // Ücretsiz dönem: kısıtlı firma = doğrulanmamış firma (saklı paketi olsa da önerilmez).
    const unverified = await sellerWith("Belgesiz AŞ", "STANDART", "UNVERIFIED");
    const pendingPaid = await sellerWith("İncelemede Silver AŞ", "SILVER", "PENDING");
    const rejected = await sellerWith("Reddedilmiş AŞ", "STANDART", "REJECTED");
    const connectedUnverified = await sellerWith("Bağlı Belgesiz AŞ", "STANDART", "UNVERIFIED");
    await connectToOwner(owner, connectedUnverified.company.id);
    // Doğrulanmış firma tam erişimli: saklı STANDART olsa da AI yoluyla davet edilir.
    const verifiedFree = await sellerWith("Doğrulanmış AŞ", "STANDART", "VERIFIED");
    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [
      unverified.company.id,
      pendingPaid.company.id,
      rejected.company.id,
      connectedUnverified.company.id,
      verifiedFree.company.id,
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "NOT_ELIGIBLE",
      "NOT_ELIGIBLE",
      "NOT_ELIGIBLE",
      "INVITED",
      "INVITED",
    ]);
    expect(await prisma.listingInvitation.count({ where: { listingId: listing.id } })).toBe(2);
  });

  describe("ücretli paket makinesi (anahtar kapalı)", () => {
    // Ücretli paketler dönünce "AI önerisine yalnız Silver+ ∧ doğrulanmış" kuralı geri gelmeli.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("ücretsiz (STANDART) ya da doğrulanmamış BAĞLANTISIZ üye davet edilemez; bağlantılı ücretsiz üye edilir", async () => {
      const { service } = makeService();
      const { owner, listing } = await setup();
      const free = await sellerWith("Ücretsiz AŞ", "STANDART", "VERIFIED");
      const unverified = await sellerWith("Belgesiz AŞ", "SILVER", "UNVERIFIED");
      const connectedFree = await sellerWith("Bağlı Ücretsiz AŞ", "STANDART", "VERIFIED");
      await connectToOwner(owner, connectedFree.company.id);
      const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [
        free.company.id,
        unverified.company.id,
        connectedFree.company.id,
      ]);
      expect(results.map((r) => r.status)).toEqual(["NOT_ELIGIBLE", "NOT_ELIGIBLE", "INVITED"]);
      expect(await prisma.listingInvitation.count({ where: { listingId: listing.id } })).toBe(1);
    });
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
    // Özet satırı döngüde, uygulama içi bildirim döngüden SONRA yazılır —
    // ikisini de bekle (yalnız özeti beklemek yük altında yarışa düşer).
    await settle(
      async () =>
        (await prisma.emailDigestItem.count({ where: { kind: "INVITATION" } })) > 0 &&
        (await prisma.notification.count({ where: { type: "listing_invitation", listingId: listing.id } })) >= 2,
    );
    expect(email.send).not.toHaveBeenCalled();
    const digest = await prisma.emailDigestItem.findMany({ select: { email: true, kind: true, listingId: true } });
    expect(digest).toEqual([{ email: busy.user.email, kind: "INVITATION", listingId: listing.id }]);
    // Uygulama içi bildirim ikisine de gider.
    expect(await prisma.notification.count({ where: { type: "listing_invitation", listingId: listing.id } })).toBeGreaterThanOrEqual(2);
  });

  /**
   * Round 5, AI-NOTIF-1 (owner: the invitation says which company invited).
   * The e-mail named the inviting company; the in-app row of the same
   * invitation said only "you have been invited to the request".
   */
  describe("in-app invitation names the inviting company (round 5, AI-NOTIF-1)", () => {
    const inApp = (listingId: string, companyId: string) =>
      prisma.notification.findFirst({ where: { type: "listing_invitation", listingId, companyId } });

    it("name shown: the row names the company; catalog key + typed params, re-rendered in the reader's language", async () => {
      const { service, notifications } = makeService();
      const { owner, listing } = await setup({ number: "ROT-000833" });
      const seller = await categorySeller("Bağlantı Ltd");
      await service.inviteDiscoveredMembers(owner.auth, listing.id, [seller.company.id]);
      await settle(async () => !!(await inApp(listing.id, seller.company.id)));
      const row = (await inApp(listing.id, seller.company.id))!;
      expect(row.title).toBe("Alım talebi daveti");
      expect(row.body).toBe(`Alıcı Makina AŞ sizi “${listing.title}” (ROT-000833) alım talebine davet etti.`);
      // Not pre-translated text: the row keeps the key and the raw inputs
      // (request title as `$listingTitle` with the RAW title as fallback).
      expect(row.i18n).toMatchObject({
        titleKey: "api.notifications.listings.invitation.title",
        bodyKey: "api.notifications.listings.aiInvitation.inAppBodyInviter",
        params: {
          inviter: "Alıcı Makina AŞ",
          number: "ROT-000833",
          title: { $listingTitle: listing.id, fallback: listing.title },
        },
      });
      const [en] = await notifications.listForUser(seller.user.id, {}, undefined, "en");
      expect(en!.body).toBe(`Alıcı Makina AŞ invited you to the buying request “${listing.title}” (ROT-000833).`);
      const [ru] = await notifications.listForUser(seller.user.id, {}, undefined, "ru");
      expect(ru!.body).toBe(
        `Alıcı Makina AŞ приглашает Вас к участию в заявке на закупку «${listing.title}» (ROT-000833).`,
      );
    });

    it("name hidden (inviteShowName off): the generic text stays and the name is not stored in the row", async () => {
      const { service, email } = makeService();
      const { owner, listing } = await setup({ number: "ROT-000834", inviteShowName: false });
      const seller = await categorySeller("Bağlantı Ltd");
      await service.inviteDiscoveredMembers(owner.auth, listing.id, [seller.company.id]);
      await settle(async () => !!(await inApp(listing.id, seller.company.id)) && email.send.mock.calls.length >= 1);
      const row = (await inApp(listing.id, seller.company.id))!;
      expect(row.body).toBe(`“${listing.title}” (ROT-000834) alım talebine davet edildiniz.`);
      expect(row.i18n).toMatchObject({ bodyKey: "api.notifications.listings.invitation.inAppBody" });
      expect(JSON.stringify(row)).not.toContain("Alıcı Makina");
      // The e-mail stays anonymous as before.
      expect(JSON.stringify(email.send.mock.calls[0]![0])).not.toContain("Alıcı Makina");
    });

    it("opening announcement of a draft's AI invitee uses the same text (one path)", async () => {
      const { service } = makeService();
      const { owner, listing } = await setup({ number: "ROT-000835", status: "DRAFT", publishedAt: null });
      const seller = await categorySeller("Bağlantı Ltd");
      await service.inviteDiscoveredMembers(owner.auth, listing.id, [seller.company.id]);
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "OPEN", publishedAt: new Date() } });
      await service.notifyListingInvitees(listing.id, "invitation");
      await settle(async () => !!(await inApp(listing.id, seller.company.id)));
      expect((await inApp(listing.id, seller.company.id))!.body).toBe(
        `Alıcı Makina AŞ sizi “${listing.title}” (ROT-000835) alım talebine davet etti.`,
      );
    });
  });

  // Round 5, AI-MAIL-1: the member invitation subject carries the company name
  // only; a very long name must not make an over-long subject.
  it("member invitation subject stays within 110 characters with a very long company name; the body row keeps the full name", async () => {
    const longName =
      "Kuzey Marmara Ağır Sanayi Makine İmalat Taahhüt İnşaat Turizm Gıda Sanayi ve Dış Ticaret Anonim Şirketi";
    const { service, email } = makeService();
    const { owner, listing } = await setup();
    await prisma.company.update({ where: { id: owner.company.id }, data: { name: longName } });
    const seller = await categorySeller("Bağlantı Ltd");
    await service.inviteDiscoveredMembers(owner.auth, listing.id, [seller.company.id]);
    await settle(() => email.send.mock.calls.length >= 1);
    const sent = email.send.mock.calls[0]![0] as { subject: string; templateData: unknown };
    expect([...sent.subject].length).toBeLessThanOrEqual(110);
    expect(sent.subject).toMatch(/^Kuzey Marmara Ağır Sanayi .+… sizi bir alım talebine davet etti$/);
    expect(JSON.stringify(sent.templateData)).toContain(longName);
    // A short name is not touched.
    email.send.mockClear();
    await prisma.company.update({ where: { id: owner.company.id }, data: { name: "Alıcı Makina AŞ" } });
    const other = await categorySeller("Diğer Ltd");
    await service.inviteDiscoveredMembers(owner.auth, listing.id, [other.company.id]);
    await settle(() => email.send.mock.calls.length >= 1);
    expect((email.send.mock.calls[0]![0] as { subject: string }).subject).toBe("Alıcı Makina AŞ sizi bir alım talebine davet etti");
  });
});

/**
 * E-posta akışları incelemesi (2026-10-05): taslak/embargolu talebe eklenen AI
 * davetlisi açılışta da AI daveti (`listing_invitation_ai`, DISCOVERY — tek tık
 * çıkış başlığıyla) olarak duyurulur; elle eklenen davetli `listing_invitation`
 * (ACTIVITY). Hatırlatma da aynı ayrımla.
 */
describe("açılış duyurusu — AI davetlisinin e-posta sınıfı zamanlamaya bağlı değil", () => {
  it("taslakta AI daveti → yayınla → AI daveti (DISCOVERY, çıkış başlıklı); elle davetli ACTIVITY", async () => {
    const { streamForContext, carriesOneClickUnsubscribe } = await import("../../src/modules/email/email-streams");
    const { service, email } = makeService();
    const { owner, listing } = await setup({ status: "DRAFT", publishedAt: null });
    const ai = await categorySeller("AI Önerisi AŞ");
    const manual = await categorySeller("Elle Davetli AŞ");
    const { results } = await service.inviteDiscoveredMembers(owner.auth, listing.id, [ai.company.id]);
    expect(results).toEqual([{ companyId: ai.company.id, status: "INVITED" }]);
    await prisma.listingInvitation.create({
      data: { listingId: listing.id, invitedCompanyId: manual.company.id, invitedById: owner.user.id },
    });
    // Taslakta e-posta gitmez.
    await new Promise((r) => setTimeout(r, 100));
    expect(email.send).not.toHaveBeenCalled();

    await prisma.listing.update({ where: { id: listing.id }, data: { status: "OPEN", publishedAt: new Date() } });
    await service.notifyListingInvitees(listing.id, "invitation");
    await settle(() => email.send.mock.calls.length >= 2);
    const byTo = new Map(
      email.send.mock.calls.map((c) => [c[0].to.email as string, c[0] as { context: { type: string }; templateData: unknown }]),
    );
    const aiMail = byTo.get(ai.user.email)!;
    expect(aiMail.context.type).toBe("listing_invitation_ai");
    expect(carriesOneClickUnsubscribe(streamForContext(aiMail.context.type))).toBe(true);
    // Gerekçe davet satırından (`aiReason`) okunur.
    expect(JSON.stringify(aiMail.templateData)).toContain("kategori");
    const manualMail = byTo.get(manual.user.email)!;
    expect(manualMail.context.type).toBe("listing_invitation");
    expect(streamForContext(manualMail.context.type)).toBe("ACTIVITY");
    // Davet başına tek bildirim: ikisi de damgalı, zil ikisine de.
    expect(await prisma.listingInvitation.count({ where: { listingId: listing.id, notifiedAt: null } })).toBe(0);
    await settle(async () => (await prisma.notification.count({ where: { type: "listing_invitation", listingId: listing.id } })) >= 2);
    expect(await prisma.notification.count({ where: { type: "listing_invitation", listingId: listing.id } })).toBe(2);

    // Hatırlatma: AI davetlisine keşif sınıfında, elle davetliye ACTIVITY.
    email.send.mockClear();
    await service.notifyListingInvitees(listing.id, "reminder");
    await settle(() => email.send.mock.calls.length >= 2);
    const reminders = new Map(email.send.mock.calls.map((c) => [c[0].to.email as string, c[0].context.type as string]));
    expect(reminders.get(ai.user.email)).toBe("listing_reminder_ai");
    expect(reminders.get(manual.user.email)).toBe("listing_reminder");
    expect(streamForContext("listing_reminder_ai")).toBe("NOTIFICATION");
  });

  it("açılışta AI davetlisi de günde 3 tavanına girer (fazlası akşam özeti)", async () => {
    const { service, email } = makeService();
    const { owner, listing } = await setup({ status: "DRAFT", publishedAt: null });
    const busy = await categorySeller("Yoğun AŞ");
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
    await service.inviteDiscoveredMembers(owner.auth, listing.id, [busy.company.id]);
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "OPEN", publishedAt: new Date() } });
    await service.notifyListingInvitees(listing.id, "invitation");
    await settle(async () => (await prisma.emailDigestItem.count({ where: { kind: "INVITATION" } })) > 0);
    expect(email.send).not.toHaveBeenCalled();
    expect(await prisma.emailDigestItem.count({ where: { kind: "INVITATION", listingId: listing.id } })).toBe(1);
  });
});

describe("CompanyListingsService.notifyHiddenAiMatches — alıcıya gösterilmeyen ücretsiz firmaya çağrı", () => {
  async function freeSeller(name: string, status: "VERIFIED" | "UNVERIFIED" | "PENDING") {
    const s = await makeCompanyWithUser(prisma, { tier: "STANDART", name, companyVerificationStatus: status });
    await prisma.company.update({
      where: { id: s.company.id },
      data: { sellerCategoryIds: ["31000000"], sellerSubCategoryIds: ["31161600"] },
    });
    return s;
  }

  it("herkese açık talep: doğrulanmamışa doğrulama, incelemedekine onay bekleme çağrısı; paket adı, alıcı kimliği ve talep bağlantısı yok; doğrulanmış firmaya gitmez", async () => {
    const { service, email } = makeService();
    const { listing } = await setup({ visibility: "PUBLIC" });
    const unverified = await freeSeller("Belgesiz AŞ", "UNVERIFIED");
    const pending = await freeSeller("İncelemede AŞ", "PENDING");
    // Ücretsiz dönem: doğrulanmış firma (saklı STANDART olsa da) alıcıya ZATEN
    // önerilir → "gösterilmeyen firma" çağrısı almaz.
    const verified = await freeSeller("Doğrulanmış AŞ", "VERIFIED");
    const paid = await categorySeller("Silver AŞ");

    const sent = await service.notifyHiddenAiMatches(listing.id, [
      unverified.company.id,
      pending.company.id,
      verified.company.id,
      paid.company.id,
    ]);
    expect(sent).toBe(2);
    await settle(() => email.send.mock.calls.length >= 2);
    const byTo = new Map(email.send.mock.calls.map((c) => [c[0].to.email, c[0]]));
    const u = JSON.stringify(byTo.get(unverified.user.email).templateData);
    expect(byTo.get(unverified.user.email).context).toEqual({ type: "listing_ai_match_locked", id: listing.id });
    expect(u).toContain("/company/ayarlar/dogrulama");
    expect(u).toContain("ücretsiz doğrulayın");
    const p = JSON.stringify(byTo.get(pending.user.email).templateData);
    expect(p).toContain("incelemede");
    expect(p).toContain("/company/ayarlar/dogrulama");
    for (const body of [u, p]) {
      expect(body).not.toContain("/company/ilan/");
      expect(body).not.toContain("/company/premium");
      expect(body).not.toMatch(/Silver|Gold|paket/i);
      expect(body).not.toContain("Alıcı Makina AŞ");
    }
    expect(byTo.has(verified.user.email)).toBe(false);
    expect(byTo.has(paid.user.email)).toBe(false);
    await settle(async () => (await prisma.notification.count({ where: { type: "listing_ai_match_locked" } })) >= 2);
    expect(await prisma.notification.count({ where: { type: "listing_ai_match_locked" } })).toBe(2);
    expect(
      await prisma.notification.count({
        where: { type: "listing_ai_match_locked", companyId: { in: [verified.company.id, paid.company.id] } },
      }),
    ).toBe(0);
  });

  it("arayüz testi O-056: paketli ama doğrulanmamış firmaya paket metni gitmez — incelemedekine talep bağlantısı, doğrulanmamışa doğrulama", async () => {
    const { service, email } = makeService();
    const { listing } = await setup({ visibility: "PUBLIC" });
    const mk = async (name: string, status: "PENDING" | "UNVERIFIED") => {
      const s = await makeCompanyWithUser(prisma, { tier: "SILVER", name, companyVerificationStatus: status });
      await prisma.company.update({
        where: { id: s.company.id },
        data: { sellerCategoryIds: ["31000000"], sellerSubCategoryIds: ["31161600"] },
      });
      return s;
    };
    const pending = await mk("İncelemede Silver AŞ", "PENDING");
    const unverified = await mk("Belgesiz Silver AŞ", "UNVERIFIED");

    const sent = await service.notifyHiddenAiMatches(listing.id, [pending.company.id, unverified.company.id]);
    expect(sent).toBe(2);
    await settle(() => email.send.mock.calls.length >= 2);
    const byTo = new Map(email.send.mock.calls.map((c) => [c[0].to.email, c[0]]));
    const p = JSON.stringify(byTo.get(pending.user.email).templateData);
    const u = JSON.stringify(byTo.get(unverified.user.email).templateData);
    for (const body of [p, u]) {
      expect(body).not.toContain("Ücretsiz pakette");
      expect(body).not.toContain("/company/premium");
      expect(body).not.toContain("Alıcı Makina AŞ");
    }
    expect(p).toContain("incelemede");
    expect(p).toContain(`/company/ilan/${listing.id}`);
    expect(u).toContain("/company/ayarlar/dogrulama");
    expect(u).not.toContain("/company/ilan/");

    await settle(async () => (await prisma.notification.count({ where: { type: "listing_ai_match_locked" } })) >= 2);
    const inApp = await prisma.notification.findMany({
      where: { type: "listing_ai_match_locked", companyId: { in: [pending.company.id, unverified.company.id] } },
      select: { companyId: true, body: true, ctaUrl: true },
    });
    const pIn = inApp.find((n) => n.companyId === pending.company.id)!;
    const uIn = inApp.find((n) => n.companyId === unverified.company.id)!;
    expect(pIn.body).not.toContain("Silver");
    expect(pIn.ctaUrl).toContain(`/company/ilan/${listing.id}`);
    expect(uIn.body).not.toContain("Silver");
    expect(uIn.ctaUrl).toContain("/company/ayarlar/dogrulama");
  });

  it("özel talepte gitmez; bu talep için kategori duyurusu almış adrese ikinci e-posta gitmez", async () => {
    const { service, email } = makeService();
    const { listing: priv } = await setup();
    // Doğrulanmamış firma = alıcıya gösterilmeyen firma (doğrulanmış firma zaten
    // hiç çağrı almaz; test yanlış sebeple yeşil kalmasın).
    const a = await freeSeller("A AŞ", "UNVERIFIED");
    expect(await service.notifyHiddenAiMatches(priv.id, [a.company.id])).toBe(0);

    const { listing: pub } = await setup({ visibility: "PUBLIC" });
    await prisma.emailLog.create({
      data: {
        template: "notification",
        toEmail: a.user.email,
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "listing_category_match",
        contextId: pub.id,
      },
    });
    expect(await service.notifyHiddenAiMatches(pub.id, [a.company.id])).toBe(0);
    expect(email.send).not.toHaveBeenCalled();
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

  it("tur platform üyelerini bulur (gerekçeli); web'de adresi üyeyle eşleşen aynı satıra katılır; tur üyeyi talebe kendisi davet eder", async () => {
    const { owner, listing } = await setup({ aiDiscovery: true, visibility: "PUBLIC" });
    const member = await categorySeller("Bağlantı Ltd");
    // An address found on the web matches a member only through an account
    // whose e-mail is VERIFIED (authsec-4); the factory leaves it unverified.
    await prisma.companyUser.update({ where: { id: member.user.id }, data: { emailVerifiedAt: new Date() } });
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
    // Üye aynı turda doğrudan talebe davet edildi (onay yok).
    expect(m).toMatchObject({ status: "INVITED", invite: "INVITED", source: "BOTH", email: null });
    expect(m.matchedCategories).toEqual(["Vidalar"]);
    expect(cands.filter((c) => c.name === "Bağlantı Ltd")).toHaveLength(1);
    expect(cands.find((c) => c.email === "satis@civata.com.tr")).toMatchObject({ status: "INVITED", invite: "QUEUED" });
    expect(
      await prisma.listingInvitation.findFirst({ where: { listingId: listing.id, invitedCompanyId: member.company.id }, select: { origin: true } }),
    ).toEqual({ origin: "AI" });
    // Üyenin adresine ayrıca e-posta daveti kuyruğa girmez.
    expect(
      (await prisma.externalListingInvite.findMany({ where: { listingId: listing.id }, select: { email: true, source: true } })),
    ).toEqual([{ email: "satis@civata.com.tr", source: "AI_AUTO" }]);
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
    // Model çağrısı olmadan bulunan üye de aynı turda davet edilir.
    expect(run.candidates.map((c) => [c.name, c.status, c.source])).toEqual([["Bağlantı Ltd", "INVITED", "PLATFORM"]]);
    expect(ai.callAiSystem).not.toHaveBeenCalled();

    const { listing: l2 } = await setup({ aiDiscovery: true, visibility: "PUBLIC", categoryIds: ["43211500"] });
    await prisma.listingItem.updateMany({ where: { listingId: l2.id }, data: { name: "Dizüstü bilgisayar" } });
    const id2 = await runs.enqueue(l2.id, "PUBLISH");
    await runs.process(id2!);
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: id2! } })).state).toBe("FAILED");
  });
});
