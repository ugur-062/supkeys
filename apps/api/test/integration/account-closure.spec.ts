/**
 * What account deletion leaves behind, and how it stays visible (2026-10-16,
 * privacy texts for the app stores):
 *  - a company closed by its last user waits for the company-level KVKK
 *    erasure; the texts promise 30 days, so a daily job reports the ones that
 *    are 7 days old and the admin list filters them ("KVKK silme bekliyor");
 *  - the company's activity log never shows a deleted account's address: the
 *    texts say the address is removed and the person appears as
 *    "Silinmiş Kullanıcı".
 */
import { CompanyRole } from "@rothern/db";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { AdminCompanyUsersService } from "../../src/modules/admin-companies/admin-company-users.service";
import { CLOSED_BY_OWNER_NOTE } from "../../src/modules/company-auth/account-closure";
import { ClosedCompanyErasureScheduler } from "../../src/modules/company-auth/schedulers/closed-company-erasure.scheduler";
import { AccountDeletionService } from "../../src/modules/company-auth/services/account-deletion.service";
import { makeCompanyWithUser, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const DAY = 24 * 60 * 60 * 1000;

function adminCompanies() {
  return new AdminCompaniesService(
    prisma as never,
    {} as never,
    { send: jest.fn() } as never,
    { pushToCompany: jest.fn() } as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    new AuditService(prisma as never),
    new EmailSuppressionService(prisma as never),
  );
}

async function closedCompany(daysAgo: number, over: { isActive?: boolean } = {}) {
  const { company, user } = await makeCompanyWithUser(prisma);
  // Kapanış son kullanıcının silinmesiyle olur: canlı kullanıcı kalmaz.
  await prisma.companyUser.update({
    where: { id: user.id },
    data: { deletedAt: new Date(), isActive: false, email: `deleted-${user.id}@deleted.rothern` },
  });
  return prisma.company.update({
    where: { id: company.id },
    data: {
      isBlocked: true,
      blockedReason: CLOSED_BY_OWNER_NOTE,
      blockedAt: new Date(Date.now() - daysAgo * DAY),
      publicEnabled: false,
      ...over,
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("ClosedCompanyErasureScheduler", () => {
  it("reports closed companies from day 7, counts the ones past 30 days; younger, erased and other suspensions are left out", async () => {
    await closedCompany(3);
    await closedCompany(8);
    await closedCompany(31);
    await closedCompany(40, { isActive: false }); // already anonymised
    const { company: suspended } = await makeCompanyWithUser(prisma);
    await prisma.company.update({
      where: { id: suspended.id },
      data: { isBlocked: true, blockedReason: "Şikayet üzerine askıya alındı", blockedAt: new Date(Date.now() - 60 * DAY) },
    });
    // Canlı kullanıcısı olan "kapalı" firma kuyrukta değil (firma silmesi o hesabı da silerdi).
    const withLiveUser = await closedCompany(20);
    await makeUser(prisma, withLiveUser.id, [CompanyRole.SATISCI]);
    const job = new ClosedCompanyErasureScheduler(prisma as never);

    expect(await job.check()).toEqual({ waiting: 2, overdue: 1 });
  });

  it("nothing to report: no warning", async () => {
    await closedCompany(1);
    const job = new ClosedCompanyErasureScheduler(prisma as never);
    expect(await job.check()).toEqual({ waiting: 0, overdue: 0 });
  });
});

describe("admin company list: KVKK erasure queue", () => {
  it("blocked=kvkk lists only closed companies waiting for the erasure, oldest first, with the closure date", async () => {
    const newer = await closedCompany(2);
    const older = await closedCompany(12);
    await closedCompany(40, { isActive: false });
    const { company: other } = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: other.id }, data: { isBlocked: true, blockedReason: "x", blockedAt: new Date() } });

    const withLiveUser = await closedCompany(20);
    await makeUser(prisma, withLiveUser.id, [CompanyRole.SATISCI]);

    const res = await adminCompanies().list({ blocked: "kvkk" });

    expect(res.items.map((c) => c.id)).toEqual([older.id, newer.id]);
    expect(res.items[0]!.erasurePendingSince?.toISOString()).toBe(older.blockedAt!.toISOString());
    const all = await adminCompanies().list({});
    expect(all.items.find((c) => c.id === other.id)?.erasurePendingSince).toBeNull();
  });
});

describe("company activity log after account deletion", () => {
  it("shows a deleted actor and the invitation sent to them under the placeholder name, never the old address", async () => {
    const owner = await makeCompanyWithUser(prisma);
    // Yöneticinin silmesi yalnız giriş yapamayan hesapta (burada: pasif).
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { isActive: false });
    await prisma.companyUser.update({ where: { id: member.id }, data: { authId: `auth-${member.id}` } });
    const invitation = await prisma.companyUserInvitation.create({
      data: {
        companyId: owner.company.id,
        email: member.email,
        token: `tok-${member.id}`,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + DAY),
        invitedById: owner.user.id,
        acceptedAt: new Date(),
      },
    });
    const audit = new AuditService(prisma as never);
    await audit.log({
      action: "company.user.invited",
      actorType: "company",
      actorId: owner.user.id,
      actorEmail: owner.user.email,
      tenantId: owner.company.id,
      entityType: "company_user_invitation",
      entityId: invitation.id,
    });
    await audit.log({
      action: "company.listing.created",
      actorType: "company",
      actorId: member.id,
      actorEmail: member.email,
      tenantId: owner.company.id,
      entityType: "listing",
      entityId: "listing-1",
    });
    const deletion = new AccountDeletionService(
      prisma as never,
      { verifyPassword: jest.fn(), deleteUserStrict: jest.fn() } as never,
      audit,
    );
    await deletion.eraseByAdmin(owner.company.id, member.id, "admin-1");

    const log = await audit.queryForTenant(owner.company.id);

    const text = JSON.stringify(log.items);
    expect(text).not.toContain(member.email);
    // Ad + hesabın kimliğinden kısa kod: silinen hesaplar birbirinden ayrılır,
    // aynı hesabın satırları aynı kodu taşır (inceleme 2026-10-16).
    const tag = member.id.slice(-4).toUpperCase();
    const created = log.items.find((r) => r.action === "company.listing.created")!;
    expect(created.actorEmail).toBe(`Silinmiş Kullanıcı · ${tag}`);
    const invited = log.items.find((r) => r.action === "company.user.invited")!;
    expect(invited.actorEmail).toBe(owner.user.email);
    expect(invited.entityLabel).toBe(`Silinmiş Kullanıcı · ${tag}`);
    // The response still carries no actor id / type (sanitised projection).
    expect(Object.keys(created)).not.toContain("actorId");
    expect(Object.keys(created)).not.toContain("actorType");
  });
});

describe("company activity log: two deleted accounts stay apart", () => {
  it("each deleted actor keeps its own short code", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const a = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { isActive: false });
    const b = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { isActive: false });
    const audit = new AuditService(prisma as never);
    for (const u of [a, b]) {
      await audit.log({
        action: "company.listing.awarded",
        actorType: "company",
        actorId: u.id,
        actorEmail: u.email,
        tenantId: owner.company.id,
        entityType: "listing",
        entityId: `l-${u.id}`,
      });
    }
    const deletion = new AccountDeletionService(
      prisma as never,
      { verifyPassword: jest.fn(), deleteUserStrict: jest.fn() } as never,
      audit,
    );
    await deletion.eraseByAdmin(owner.company.id, a.id, "admin-1");
    await deletion.eraseByAdmin(owner.company.id, b.id, "admin-1");

    const log = await audit.queryForTenant(owner.company.id);
    const labels = log.items
      .filter((r) => r.action === "company.listing.awarded")
      .map((r) => r.actorEmail);
    expect(new Set(labels).size).toBe(2);
    for (const l of labels) expect(l).toMatch(/^Silinmiş Kullanıcı · [A-Z0-9]{4}$/);
  });
});

/**
 * İnceleme 2026-10-16: kapanan firmanın tek işareti askı notu. Askıya alma,
 * şikâyetten askıya alma ve askıyı kaldırma notu ezip firmayı KVKK kuyruğundan
 * (30 gün sözü) sessizce düşürüyordu; notu elle yazmak canlı firmayı kuyruğa
 * sokuyordu; admin "Kullanıcı Ekle" kapanmış firmaya canlı hesap açıyordu.
 */
describe("closed company: the marker is not overwritten", () => {
  it("suspend / unsuspend refuse a closed company; the note and the closure date stay", async () => {
    const closed = await closedCompany(5);
    const svc = adminCompanies();
    await expect(svc.suspend(closed.id, "Dolandırıcılık şüphesi", "admin-1")).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "COMPANY_CLOSED_BY_OWNER" }),
    });
    await expect(svc.unsuspend(closed.id, "admin-1")).rejects.toMatchObject({ status: 409 });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: closed.id } });
    expect(c.blockedReason).toBe(CLOSED_BY_OWNER_NOTE);
    expect(c.isBlocked).toBe(true);
    expect(c.blockedAt?.toISOString()).toBe(closed.blockedAt!.toISOString());
  });

  it("the closure note can't be typed as a suspension reason (a live company would enter the erasure queue)", async () => {
    const { company } = await makeCompanyWithUser(prisma);
    await expect(
      adminCompanies().suspend(company.id, "  hesap sahibi sildi -  KVKK silme bekliyor ", "admin-1"),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: "SUSPEND_REASON_RESERVED" }),
    });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(c.isBlocked).toBe(false);
  });

  it("resolving a complaint with suspension on a closed company is refused before anything is written", async () => {
    const closed = await closedCompany(5);
    const { company: complainant, user } = await makeCompanyWithUser(prisma);
    const complaint = await prisma.companyComplaint.create({
      data: {
        complainantCompanyId: complainant.id,
        againstCompanyId: closed.id,
        createdById: user.id,
        reason: "Sahte belge",
        status: "OPEN",
      },
    });
    await expect(
      adminCompanies().resolveComplaint(complaint.id, { status: "RESOLVED", suspend: true }, "admin-1", "SUPER_ADMIN"),
    ).rejects.toMatchObject({ status: 409 });
    const row = await prisma.companyComplaint.findUniqueOrThrow({ where: { id: complaint.id } });
    expect(row.status).toBe("OPEN");
    const c = await prisma.company.findUniqueOrThrow({ where: { id: closed.id } });
    expect(c.blockedReason).toBe(CLOSED_BY_OWNER_NOTE);
  });

  it("admin 'add user' refuses a closed company", async () => {
    const closed = await closedCompany(5);
    const supabase = { createUser: jest.fn(), deleteUser: jest.fn() };
    const svc = new AdminCompanyUsersService(
      prisma as never,
      new AuditService(prisma as never),
      {} as never,
      {} as never,
      supabase as never,
    );
    await expect(
      svc.addUser(closed.id, { email: "yeni@firma.com", firstName: "Yeni", lastName: "Kişi", role: "SATISCI" }, "admin-1"),
    ).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: "COMPANY_CLOSED_BY_OWNER" }) });
    expect(supabase.createUser).not.toHaveBeenCalled();
    expect(await prisma.companyUser.count({ where: { companyId: closed.id, deletedAt: null } })).toBe(0);
  });
});
