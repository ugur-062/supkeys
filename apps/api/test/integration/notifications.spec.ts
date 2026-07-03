/**
 * Uygulama-içi bildirim motoru (NotificationService) + kategori-eşleşme wiring.
 * Kullanıcı bazında fan-out, tercih filtresi, transactional bypass, okundu akışı.
 */
import { CompanyRole } from "@supkeys/db";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { makeService } from "./make-service";

function svc() {
  return new NotificationService(prisma as never);
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("pushToCompany / pushToCompanies — fan-out", () => {
  it("firmanın TÜM aktif kullanıcılarına satır yazar, pasif/silinmiş atlanır", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const u1 = await makeUser(prisma, co.id, [CompanyRole.SATISCI]);
    const u2 = await makeUser(prisma, co.id, [CompanyRole.SATIN_ALMACI]);
    await makeUser(prisma, co.id, [CompanyRole.SATISCI], { isActive: false });
    await makeUser(prisma, co.id, [CompanyRole.SATISCI], {
      deletedAt: new Date(),
    });

    const count = await n.pushToCompany(co.id, {
      type: "listing_invitation",
      title: "Davet",
      body: "İhaleye davet edildiniz",
    });
    expect(count).toBe(2);
    const rows = await prisma.notification.findMany({
      where: { companyId: co.id },
    });
    expect(rows.map((r) => r.companyUserId).sort()).toEqual(
      [u1.id, u2.id].sort(),
    );
  });

  it("kullanıcı tercihi kapalıysa o kullanıcı atlanır (categoryMatch=false)", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const off = await makeUser(prisma, co.id, [CompanyRole.SATISCI], {
      notificationPrefs: { categoryMatch: false },
    });
    const on = await makeUser(prisma, co.id, [CompanyRole.SATISCI]);

    const count = await n.pushToCompany(co.id, {
      type: "listing_category_match",
      title: "Eşleşme",
      body: "Kategorinize uygun ilan",
    });
    expect(count).toBe(1);
    const rows = await prisma.notification.findMany({
      where: { companyId: co.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].companyUserId).toBe(on.id);
    void off;
  });

  it("transactional tip (order_status_changed) tercihe bakılmaksızın gider", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    await makeUser(prisma, co.id, [CompanyRole.SATISCI], {
      notificationPrefs: { categoryMatch: false, reminder: false },
    });
    const count = await n.pushToCompany(co.id, {
      type: "order_status_changed",
      title: "Sipariş",
      body: "Durum değişti",
    });
    expect(count).toBe(1);
  });
});

describe("pushToUser", () => {
  it("aktif kullanıcıya yazar; pasifse yazmaz", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const u = await makeUser(prisma, co.id, [CompanyRole.ONAYLAYICI]);
    expect(
      await n.pushToUser(u.id, {
        type: "approval_pending",
        title: "Onay",
        body: "Onayınız bekleniyor",
      }),
    ).toBe(1);

    const passive = await makeUser(prisma, co.id, [CompanyRole.ONAYLAYICI], {
      isActive: false,
    });
    expect(
      await n.pushToUser(passive.id, {
        type: "approval_pending",
        title: "Onay",
        body: "x",
      }),
    ).toBe(0);
  });
});

describe("liste / okundu akışı", () => {
  it("listForUser + unreadCount + markRead + markAllRead", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const u = await makeUser(prisma, co.id, [CompanyRole.SATISCI]);
    for (let i = 0; i < 3; i++) {
      await n.pushToUser(u.id, {
        type: "listing_invitation",
        title: `Davet ${i}`,
        body: "x",
      });
    }
    expect(await n.unreadCount(u.id)).toBe(3);
    const list = await n.listForUser(u.id);
    expect(list).toHaveLength(3);

    // Birini okundu işaretle.
    const marked = await n.markRead(u.id, [list[0].id]);
    expect(marked).toBe(1);
    expect(await n.unreadCount(u.id)).toBe(2);

    // Başka kullanıcının id'siyle işaretlenemez (sahiplik).
    const other = await makeUser(prisma, co.id, [CompanyRole.SATISCI]);
    expect(await n.markRead(other.id, [list[1].id])).toBe(0);
    expect(await n.unreadCount(u.id)).toBe(2);

    // Hepsini okundu.
    await n.markAllRead(u.id);
    expect(await n.unreadCount(u.id)).toBe(0);

    // unreadOnly filtresi.
    expect(await n.listForUser(u.id, { unreadOnly: true })).toHaveLength(0);
  });
});

describe("wiring: kategori eşleşmesi in-app kayıt üretir", () => {
  it("PUBLIC ALIM ilanı → eşleşen satıcının kullanıcısına in-app bildirim", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: ["10000000"], billingEmail: "s@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: ["10101500"],
    });

    await service.notifyCategoryMatchedCompanies(listing.id);

    const rows = await prisma.notification.findMany({
      where: { companyUserId: seller.user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("listing_category_match");
    expect(rows[0].listingId).toBe(listing.id);
    expect(rows[0].readAt).toBeNull();
  });
});

describe("portal ayrımı — satış/satınalma bildirimleri karışmaz", () => {
  it("portal=satis yalnız SATISCI/YÖNETİCİ'ye; saf satın almacı almaz", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const seller = await makeUser(prisma, co.id, [CompanyRole.SATISCI]);
    const manager = await makeUser(prisma, co.id, [CompanyRole.YONETICI]);
    const buyer = await makeUser(prisma, co.id, [CompanyRole.SATIN_ALMACI]);

    const count = await n.pushToCompany(co.id, {
      type: "listing_invitation",
      portal: "satis",
      title: "Davet",
      body: "İhaleye davet edildiniz",
    });
    expect(count).toBe(2);
    const rows = await prisma.notification.findMany({
      where: { companyId: co.id },
    });
    const uids = rows.map((r) => r.companyUserId).sort();
    expect(uids).toEqual([seller.id, manager.id].sort());
    expect(uids).not.toContain(buyer.id);
    expect(rows.every((r) => r.portal === "satis")).toBe(true);
  });

  it("portal=satinalma yalnız SATIN_ALMACI/YÖNETİCİ'ye; saf satışçı almaz", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const buyer = await makeUser(prisma, co.id, [CompanyRole.SATIN_ALMACI]);
    await makeUser(prisma, co.id, [CompanyRole.SATISCI]);

    const count = await n.pushToCompany(co.id, {
      type: "listing_closed_owner",
      portal: "satinalma",
      title: "Karar",
      body: "Kazandırma zamanı",
    });
    expect(count).toBe(1);
    const rows = await prisma.notification.findMany({
      where: { companyId: co.id },
    });
    expect(rows.map((r) => r.companyUserId)).toEqual([buyer.id]);
  });

  it("SATIN_ALMACI + SATISCI çift rollü kullanıcı HER İKİ portalı da alır", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const both = await makeUser(prisma, co.id, [
      CompanyRole.SATIN_ALMACI,
      CompanyRole.SATISCI,
    ]);
    await n.pushToCompany(co.id, {
      type: "listing_invitation",
      portal: "satis",
      title: "S",
      body: "b",
    });
    await n.pushToCompany(co.id, {
      type: "listing_closed_owner",
      portal: "satinalma",
      title: "A",
      body: "b",
    });
    const rows = await prisma.notification.findMany({
      where: { companyUserId: both.id },
    });
    expect(rows.map((r) => r.portal).sort()).toEqual(["satinalma", "satis"]);
  });

  it("liste + okunmamış sayısı AKTİF portal (+ ortak) ile süzülür", async () => {
    const n = svc();
    const co = await makeCompany(prisma, {});
    const u = await makeUser(prisma, co.id, [
      CompanyRole.SATIN_ALMACI,
      CompanyRole.SATISCI,
    ]);
    // 1 satış, 1 satınalma, 1 ortak (bağlantı) bildirim.
    await n.pushToUser(u.id, {
      type: "listing_invitation",
      portal: "satis",
      title: "S",
      body: "b",
    });
    await n.pushToUser(u.id, {
      type: "listing_closed_owner",
      portal: "satinalma",
      title: "A",
      body: "b",
    });
    await n.pushToUser(u.id, {
      type: "connection_request",
      title: "Bağlantı",
      body: "b",
    });

    // Satınalma portalı → satınalma + ortak = 2 (satış görünmez).
    const buyList = await n.listForUser(u.id, { portal: "satinalma" });
    expect(buyList).toHaveLength(2);
    expect(buyList.every((r) => r.portal !== "satis")).toBe(true);
    expect(await n.unreadCount(u.id, "satinalma")).toBe(2);

    // Satış portalı → satış + ortak = 2.
    expect(await n.unreadCount(u.id, "satis")).toBe(2);

    // Tümünü okundu (satınalma) → yalnız satınalma+ortak okunur; satış açık kalır.
    await n.markAllRead(u.id, "satinalma");
    expect(await n.unreadCount(u.id, "satinalma")).toBe(0);
    // Satış hâlâ okunmamış (1 satış); ortak ise satınalma ile okundu → satış=1.
    expect(await n.unreadCount(u.id, "satis")).toBe(1);
  });
});
