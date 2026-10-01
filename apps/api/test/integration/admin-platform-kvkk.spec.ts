/**
 * Faz 8-9 — KVKK export/silme-anonimleştirme + suppression aklama marker'ı.
 * Kural: siparişsiz firma HARD delete; siparişli firma ANONİMLEŞTİRİLİR
 * (finansal kayıt korunur). Aklama append-only marker'dır.
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";

function rig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const audit = new AuditService(prisma as never);
  const service = new AdminCompaniesService(
    prisma as never,
    {} as never,
    email as never,
    notifications as never,
    config as never,
    audit,
    new EmailSuppressionService(prisma as never),
  );
  return { service };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("KVKK — export + silme/anonimleştirme", () => {
  it("exportData firmanın tüm ilişkili verisini döner", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const dump = await service.exportData(co.company.id);
    const c = dump.company as { id: string; users: unknown[] };
    expect(c.id).toBe(co.company.id);
    expect(c.users).toHaveLength(1);
    expect(dump.exportedAt).toBeTruthy();
  });

  it("exportData çok-relation + iç-içe veriyi (cursor-batch fluent) eksiksiz döner", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const other = await makeCompanyWithUser(prisma, {});
    await connect(prisma, co.company.id, other.company.id, co.user.id);
    // Firmanın ilanı (item + davet) — listings.items / listings.invitations.
    const listing = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    const item = await makeItem(prisma, listing.id);
    await invite(prisma, listing.id, other.company.id, co.user.id);
    // Firmanın verdiği teklif (item) — bidsPlaced.items.
    await makeBid(prisma, {
      listingId: (await makeListing(prisma, {
        companyId: other.company.id,
        createdById: other.user.id,
        type: "ALIM",
        status: "OPEN",
      })).id,
      bidderCompanyId: co.company.id,
      createdById: co.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    // Alıcı olduğu sipariş (item + payment) — ordersAsBuyer.items/payments.
    await prisma.companyOrder.create({
      data: {
        buyerCompanyId: co.company.id,
        sellerCompanyId: other.company.id,
        amount: 250,
        currency: "TRY",
        status: "DELIVERED",
        items: { create: [{ name: "Çelik", quantity: 5, unit: "ton", unitPrice: 50 }] },
        payments: {
          create: [
            {
              amount: 250,
              status: "CONFIRMED",
              recordedByCompanyId: co.company.id,
              confirmedAt: new Date(),
            },
          ],
        },
      },
    });

    const dump = await service.exportData(co.company.id);
    const c = dump.company as {
      listings: { items: unknown[]; invitations: unknown[] }[];
      bidsPlaced: { items: unknown[] }[];
      ordersAsBuyer: { items: unknown[]; payments: unknown[] }[];
      connectionsInitiated: unknown[];
    };
    expect(c.listings).toHaveLength(1);
    expect(c.listings[0]!.items).toHaveLength(1);
    expect(c.listings[0]!.invitations).toHaveLength(1);
    expect(c.bidsPlaced).toHaveLength(1);
    expect(c.bidsPlaced[0]!.items).toHaveLength(1);
    expect(c.ordersAsBuyer).toHaveLength(1);
    expect(c.ordersAsBuyer[0]!.items).toHaveLength(1);
    expect(c.ordersAsBuyer[0]!.payments).toHaveLength(1);
    expect(c.connectionsInitiated).toHaveLength(1);
  });

  it("siparişsiz firma HARD silinir + Supabase hesapları silinir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await prisma.companyUser.update({
      where: { id: co.user.id },
      data: { authId: "auth-del-1" },
    });
    const deleteUser = jest.fn().mockResolvedValue(undefined);
    const res = await service.deleteOrAnonymize(
      co.company.id,
      "admin-1",
      deleteUser,
    );
    expect(res.mode).toBe("deleted");
    expect(deleteUser).toHaveBeenCalledWith("auth-del-1");
    expect(
      await prisma.company.findUnique({ where: { id: co.company.id } }),
    ).toBeNull();
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.company.deleted", entityId: co.company.id },
    });
    expect(log).not.toBeNull();
  });

  // Derin denetim MU-03 (S010/X18): karsi tarafin kaydini cascade ile silen
  // ama eskiden sayilmayan izler — her biri tek basina sert silmeyi durdurur.
  describe("MU-03 — karsi tarafin kaydi sert silmeyi durdurur", () => {
    async function expectAnonymized(targetId: string) {
      const { service } = rig();
      const res = await service.deleteOrAnonymize(
        targetId,
        "admin-1",
        jest.fn().mockResolvedValue(undefined),
      );
      expect(res.mode).toBe("anonymized");
      expect(
        await prisma.company.findUnique({ where: { id: targetId } }),
      ).not.toBeNull();
    }

    it("alicinin yazip tedarikcinin hic yanitlamadigi thread + mesajlar korunur", async () => {
      const buyer = await makeCompanyWithUser(prisma, {});
      const seller = await makeCompanyWithUser(prisma, {});
      const thread = await prisma.messageThread.create({
        data: {
          buyerCompanyId: buyer.company.id,
          sellerCompanyId: seller.company.id,
          lastMessageAt: new Date(),
          messages: {
            create: [
              {
                senderCompanyId: buyer.company.id,
                senderUserId: buyer.user.id,
                senderName: "Buyer",
                body: "hello",
              },
            ],
          },
        },
      });
      await expectAnonymized(seller.company.id);
      expect(
        await prisma.message.count({ where: { threadId: thread.id } }),
      ).toBe(1);
    });

    it("baska firmanin talebindeki davet kaydi korunur", async () => {
      const buyer = await makeCompanyWithUser(prisma, {});
      const seller = await makeCompanyWithUser(prisma, {});
      const listing = await makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        type: "ALIM",
        status: "OPEN",
      });
      const inv = await invite(prisma, listing.id, seller.company.id, buyer.user.id);
      await expectAnonymized(seller.company.id);
      expect(
        await prisma.listingInvitation.findUnique({ where: { id: inv.id } }),
      ).not.toBeNull();
    });

    it("kayitli alicinin bilgi talebi korunur; anonim ziyaretci talebi tek basina tutmaz", async () => {
      const buyer = await makeCompanyWithUser(prisma, {});
      const seller = await makeCompanyWithUser(prisma, {});
      const product = await prisma.companyItem.create({
        data: {
          companyId: seller.company.id,
          createdById: seller.user.id,
          name: "Panel",
          unit: "adet",
          slug: "panel-mu03",
        },
      });
      const mk = (tokenHash: string, claimedCompanyId: string | null) =>
        prisma.publicInquiry.create({
          data: {
            companyId: seller.company.id,
            productId: product.id,
            name: "Visitor",
            email: `${tokenHash}@example.com`,
            message: "price?",
            tokenHash,
            expiresAt: new Date(),
            verifiedAt: new Date(),
            claimedCompanyId,
          },
        });
      // Yalniz anonim talep: sert silme serbest.
      await mk("mu03-anon", null);
      const { service } = rig();
      const other = await makeCompanyWithUser(prisma, {});
      const otherItem = await prisma.companyItem.create({
        data: {
          companyId: other.company.id,
          createdById: other.user.id,
          name: "Panel",
          unit: "adet",
          slug: "panel-mu03-b",
        },
      });
      await prisma.publicInquiry.create({
        data: {
          companyId: other.company.id,
          productId: otherItem.id,
          name: "Visitor",
          email: "anon2@example.com",
          message: "price?",
          tokenHash: "mu03-anon-2",
          expiresAt: new Date(),
        },
      });
      const del = await service.deleteOrAnonymize(
        other.company.id,
        "admin-1",
        jest.fn().mockResolvedValue(undefined),
      );
      expect(del.mode).toBe("deleted");
      // Kayitli aliciya bagli talep: anonimlestirme.
      const claimed = await mk("mu03-claimed", buyer.company.id);
      await expectAnonymized(seller.company.id);
      expect(
        await prisma.publicInquiry.findUnique({ where: { id: claimed.id } }),
      ).not.toBeNull();
    });
  });

  it("anonimleştirme banka hesaplarını, davetleri, çevirileri siler; adres kişisini karartır (MU-03)", async () => {
    const { service } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        amount: 500,
        currency: "TRY",
        status: "COMPLETED",
      },
    });
    const id = buyer.company.id;
    await prisma.company.update({
      where: { id },
      data: {
        slug: "person-trade-mu03",
        linkedinUrl: "https://linkedin.com/in/person",
        instagramUrl: "https://instagram.com/person",
        bankName: "Bank",
        bankSwiftBic: "TGBATRIS",
        legalFormLocal: "Sole",
        services: ["consulting"],
        searchTextI18n: "person trade",
      },
    });
    await prisma.companyBankAccount.create({
      data: {
        companyId: id,
        title: "TRY",
        accountHolder: "Person Name",
        iban: "TR330006100519786457841326",
      },
    });
    await prisma.companyUserInvitation.create({
      data: {
        companyId: id,
        email: "invitee@example.com",
        token: "mu03-invite-token",
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: buyer.user.id,
      },
    });
    await prisma.contentTranslation.create({
      data: {
        entityType: "COMPANY",
        entityId: id,
        locale: "en",
        sourceHash: "h",
        fields: { aboutText: "About person" },
        status: "DONE",
      },
    });
    const addr = await prisma.companyAddress.create({
      data: {
        companyId: id,
        type: "FATURA",
        title: "HQ",
        contactName: "Person Name",
        phone: "+905320000000",
        city: "Istanbul",
        district: "Kadikoy",
        addressLine: "Home street 1",
        postalCode: "34000",
        taxOffice: "Kadikoy",
        taxNumber: "12345678901",
      },
    });

    const res = await service.deleteOrAnonymize(
      id,
      "admin-1",
      jest.fn().mockResolvedValue(undefined),
    );
    expect(res.mode).toBe("anonymized");
    const after = await prisma.company.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({
      slug: null,
      linkedinUrl: null,
      instagramUrl: null,
      bankName: null,
      bankSwiftBic: null,
      legalFormLocal: null,
      services: [],
      searchTextI18n: "",
    });
    expect(await prisma.companyBankAccount.count({ where: { companyId: id } })).toBe(0);
    expect(await prisma.companyUserInvitation.count({ where: { companyId: id } })).toBe(0);
    expect(
      await prisma.contentTranslation.count({ where: { entityType: "COMPANY", entityId: id } }),
    ).toBe(0);
    const a = await prisma.companyAddress.findUniqueOrThrow({ where: { id: addr.id } });
    expect(a).toMatchObject({
      contactName: null,
      phone: null,
      addressLine: "",
      district: null,
      postalCode: null,
      taxOffice: null,
      taxNumber: null,
      city: "Istanbul",
    });
  });

  it("siparişli firma ANONİMLEŞTİRİLİR — sipariş korunur, PII gider", async () => {
    const { service } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const order = await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        amount: 500,
        currency: "TRY",
        status: "COMPLETED",
      },
    });
    const oldEmail = buyer.user.email;
    const res = await service.deleteOrAnonymize(
      buyer.company.id,
      "admin-1",
      jest.fn().mockResolvedValue(undefined),
    );
    expect(res.mode).toBe("anonymized");
    // Sipariş duruyor.
    expect(
      await prisma.companyOrder.findUnique({ where: { id: order.id } }),
    ).not.toBeNull();
    // Firma kimliği anonim + pasif.
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: buyer.company.id },
    });
    expect(after.name).toContain("Silinmiş Firma");
    expect(after.taxNumber).toBeNull();
    expect(after.isActive).toBe(false);
    expect(after.isBlocked).toBe(true);
    // Kullanıcı karartıldı — eski e-posta artık bulunamaz.
    expect(
      await prisma.companyUser.findUnique({ where: { email: oldEmail } }),
    ).toBeNull();
    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { id: buyer.user.id },
    });
    expect(user.email).toContain("@anon.rothern.local");
    expect(user.deletedAt).not.toBeNull();
    expect(user.isActive).toBe(false);
  });

  it("D-143/D-216: siparişsiz ama üyelik geçmişli firma — yanıt gerçek nedeni döner; ürünler vitrinden ve onay kuyruğundan düşer", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await prisma.companyMembershipEvent.create({
      data: { companyId: co.company.id, action: "GRANT", months: 1 },
    });
    const mkItem = (slug: string, extra: Record<string, unknown>) =>
      prisma.companyItem.create({
        data: {
          companyId: co.company.id,
          createdById: co.user.id,
          name: slug,
          unit: "adet",
          slug,
          ...extra,
        },
      });
    const pending = await mkItem("bekleyen", { reviewStatus: "PENDING", submittedAt: new Date() });
    const live = await mkItem("yayinda", { reviewStatus: "APPROVED", isPublic: true });
    const res = await service.deleteOrAnonymize(
      co.company.id,
      "admin-1",
      jest.fn().mockResolvedValue(undefined),
    );
    expect(res.mode).toBe("anonymized");
    expect(res).toMatchObject({ retainedBecause: { membershipEvents: 1 } });
    expect(
      (res as { retainedBecause?: Record<string, number> }).retainedBecause,
    ).not.toHaveProperty("ordersAsBuyer");
    for (const id of [pending.id, live.id]) {
      const it = await prisma.companyItem.findUniqueOrThrow({ where: { id } });
      expect(it).toMatchObject({ isPublic: false, isActive: false, reviewStatus: "DRAFT" });
    }
  });
});

describe("e-posta suppression aklama (append-only marker)", () => {
  it("hard-bounce sonrası marker eklenirse eski kayıt suppression tetiklemez", async () => {
    // Bu, email.service.send'in suppression sorgusuyla AYNI mantığın
    // veri-seviyesinde doğrulaması: marker'dan eski bounce'lar sayılmaz.
    const email = "bounce@test.local";
    await prisma.emailLog.create({
      data: {
        template: "notification",
        toEmail: email,
        subject: "x",
        provider: "resend",
        status: "BOUNCED",
        bounceType: "hard",
      },
    });
    // Marker öncesi: suppress edilmeli.
    const before = await prisma.emailLog.findFirst({
      where: {
        toEmail: email,
        OR: [
          { status: "COMPLAINED" },
          { status: "BOUNCED", bounceType: "hard" },
        ],
      },
    });
    expect(before).not.toBeNull();
    // Aklama marker'ı.
    await prisma.emailLog.create({
      data: {
        template: "suppression_clear",
        toEmail: email,
        subject: "suppression clear (admin)",
        provider: "internal",
        status: "SENT",
        sentAt: new Date(),
      },
    });
    const marker = await prisma.emailLog.findFirst({
      where: { toEmail: email, template: "suppression_clear" },
      orderBy: { queuedAt: "desc" },
    });
    const afterClear = await prisma.emailLog.findFirst({
      where: {
        toEmail: email,
        queuedAt: { gt: marker!.queuedAt },
        OR: [
          { status: "COMPLAINED" },
          { status: "BOUNCED", bounceType: "hard" },
        ],
      },
    });
    expect(afterClear).toBeNull();
    // Marker SONRASI yeni bounce yeniden suppress eder.
    await prisma.emailLog.create({
      data: {
        template: "notification",
        toEmail: email,
        subject: "y",
        provider: "resend",
        status: "BOUNCED",
        bounceType: "hard",
        queuedAt: new Date(Date.now() + 1000),
      },
    });
    const reSuppressed = await prisma.emailLog.findFirst({
      where: {
        toEmail: email,
        queuedAt: { gt: marker!.queuedAt },
        OR: [
          { status: "COMPLAINED" },
          { status: "BOUNCED", bounceType: "hard" },
        ],
      },
    });
    expect(reSuppressed).not.toBeNull();
  });
});
