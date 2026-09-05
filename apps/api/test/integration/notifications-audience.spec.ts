/**
 * Yetki tablosu Faz 2 (2026-09-05) — bildirim ALICI KÜMESİ izne göre.
 *
 * - portal verilen bildirim: o portalı GÖRÜNTÜLEYENLER (buy:view / sell:view);
 *   onaylayıcı-only üye almaz, Kurucu (örtük) alır.
 * - `audience` verilen portal-dışı bildirim (bağlantı isteği, duyuru): yalnız
 *   o izinlerden birini taşıyanlar.
 * - okuma tarafı: çan, kişinin GÜNCEL izniyle süzer — izni kalkan portalın
 *   eski satırları görünmez (silinmez).
 * - e-posta alıcısı: `pickCompanyRecipients` önce tercih edilen izni, sonra
 *   yedek izni, hiçbiri yoksa kimseyi seçmez; billingEmail hep önce.
 */
import { CompanyRole } from "@rothern/db";
import {
  NotificationService,
  pickCompanyRecipients,
} from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const subject = (id: string, roles: string[], isOwner = false, permissions?: string[]) => ({
  userId: id,
  isOwner,
  roles,
  ...(permissions ? { permissions } : {}),
});

describe("pushToCompanies — alıcı kümesi izinden", () => {
  it("portal=satis: Satışçı ve Kurucu alır; onaylayıcı-only ve saf Satın Almacı almaz", async () => {
    const svc = new NotificationService(prisma as never);
    const co = await makeCompanyWithUser(prisma); // kurucu SA+ST
    const seller = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const buyer = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    const n = await svc.pushToCompany(co.company.id, {
      type: "listing_invitation",
      title: "t",
      body: "b",
      portal: "satis",
    });
    expect(n).toBe(2);
    const rows = await prisma.notification.findMany({ where: { companyId: co.company.id } });
    const ids = rows.map((r) => r.companyUserId).sort();
    expect(ids).toEqual([co.user.id, seller.id].sort());
    expect(ids).not.toContain(buyer.id);
    expect(ids).not.toContain(approver.id);
  });

  it("audience=[connections:manage]: Kurucu, Yönetici, Satın Almacı ve Satışçı alır; onaylayıcı-only almaz", async () => {
    const svc = new NotificationService(prisma as never);
    const co = await makeCompanyWithUser(prisma, { roles: ["SAHIP"] as never });
    const manager = await makeUser(prisma, co.company.id, [CompanyRole.YONETICI]);
    const seller = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    const n = await svc.pushToCompany(co.company.id, {
      type: "connection_request",
      title: "t",
      body: "b",
      audience: ["connections:manage"],
    });
    expect(n).toBe(3);
    const ids = (await prisma.notification.findMany({ where: { companyId: co.company.id } })).map(
      (r) => r.companyUserId,
    );
    expect(ids.sort()).toEqual([co.user.id, manager.id, seller.id].sort());
    expect(ids).not.toContain(approver.id);
  });

  it("ne portal ne audience → herkes (hesap/güvenlik sınıfı)", async () => {
    const svc = new NotificationService(prisma as never);
    const co = await makeCompanyWithUser(prisma);
    await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    const n = await svc.pushToCompany(co.company.id, { type: "x", title: "t", body: "b" });
    expect(n).toBe(2);
  });
});

describe("okuma tarafı — çan GÜNCEL izne göre süzer", () => {
  it("izni kalkan portalın eski satırları listelenmez ve sayılmaz; ortak satırlar kalır", async () => {
    const svc = new NotificationService(prisma as never);
    const co = await makeCompanyWithUser(prisma);
    const u = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    await prisma.notification.createMany({
      data: [
        { companyUserId: u.id, companyId: co.company.id, type: "a", portal: "satinalma", title: "alım", body: "b" },
        { companyUserId: u.id, companyId: co.company.id, type: "b", portal: "satis", title: "satış", body: "b" },
        { companyUserId: u.id, companyId: co.company.id, type: "c", portal: null, title: "ortak", body: "b" },
      ],
    });
    // Bugünkü izni yalnız alım görüntüleme.
    const viewer = subject(u.id, [], false, ["buy:view"]);
    const rows = await svc.listForUser(u.id, {}, viewer);
    expect(rows.map((r) => r.title).sort()).toEqual(["alım", "ortak"]);
    expect(await svc.unreadCount(u.id, undefined, viewer)).toBe(2);
    // İstenen portal görülemiyorsa yalnız ortak satırlar döner.
    expect((await svc.listForUser(u.id, { portal: "satis" }, viewer)).map((r) => r.title)).toEqual(["ortak"]);
    // İzin genişleyince eski satış satırı geri gelir (silinmemişti).
    const both = subject(u.id, [], false, ["buy:view", "sell:view"]);
    expect(await svc.unreadCount(u.id, undefined, both)).toBe(3);
    // Viewer verilmezse (eski çağıran) süzgeç yok.
    expect(await svc.unreadCount(u.id)).toBe(3);
  });
});

describe("pickCompanyRecipients — e-posta alıcısı izinden", () => {
  it("önce tercih edilen izin, sonra yedek; billingEmail hep önce", async () => {
    const co = await makeCompanyWithUser(prisma, { roles: ["SAHIP"] as never });
    // Kurucu en eski ama satış GÖNDERME izni yok (koltuksuz); Satışçı sonra eklendi.
    const viewer = await makeUser(prisma, co.company.id, [], { permissions: ["sell:view"] });
    const seller = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const m = await pickCompanyRecipients(
      prisma as never,
      [co.company.id],
      ["sell:bid:submit"],
      ["sell:view"],
    );
    expect(m.get(co.company.id)?.email).toBe(seller.email);
    // Gönderme izni kimsede yoksa yedek (görüntüleme) — kurucu örtük sell:view taşır ve en eski.
    await prisma.companyUser.update({ where: { id: seller.id }, data: { isActive: false } });
    const m2 = await pickCompanyRecipients(prisma as never, [co.company.id], ["sell:bid:submit"], ["sell:view"]);
    expect(m2.get(co.company.id)?.email).toBe(co.user.email);
    void viewer;
    // billingEmail varsa kullanıcı seçilmez.
    await prisma.company.update({ where: { id: co.company.id }, data: { billingEmail: "fatura@x.test" } });
    const m3 = await pickCompanyRecipients(prisma as never, [co.company.id], ["sell:bid:submit"], ["sell:view"]);
    expect(m3.get(co.company.id)).toMatchObject({ email: "fatura@x.test", prefs: null });
  });
});
