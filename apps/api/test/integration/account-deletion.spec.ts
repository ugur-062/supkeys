/**
 * Self-service account deletion (`POST company-auth/delete-account`).
 * Contract: password proves the request; a member is anonymised and their
 * live requests go to the Founder; the Founder with other members must hand
 * over first; the last member closes the company unless work is still open;
 * a provider failure changes nothing.
 */
import { CompanyRole } from "@rothern/db";
import { ServiceUnavailableException } from "@nestjs/common";
import { AuditService } from "../../src/modules/audit/audit.service";
import { AccountDeletionService } from "../../src/modules/company-auth/services/account-deletion.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

function rig() {
  const supabase = {
    verifyPassword: jest.fn(async (_email: string, password: string) => {
      if (password !== "dogru") throw new Error("invalid credentials");
      return { authId: "x", email: _email };
    }),
    deleteUserStrict: jest.fn(async () => undefined),
  };
  const seo = { companyChanged: jest.fn() };
  const service = new AccountDeletionService(
    prisma as never,
    supabase as never,
    new AuditService(prisma as never),
    seo as never,
  );
  return { service, supabase, seo };
}

async function withDevice(userId: string, companyId: string, token: string) {
  return prisma.pushDevice.create({
    data: { token, platform: "android", companyUserId: userId, companyId },
  });
}

async function withAuth(userId: string) {
  return prisma.companyUser.update({
    where: { id: userId },
    data: { authId: `auth-${userId}`, phone: "+905551112233" },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("AccountDeletionService", () => {
  it("wrong password: 403 and nothing changes", async () => {
    const { user } = await makeCompanyWithUser(prisma);
    await withAuth(user.id);
    const { service, supabase } = rig();
    await expect(service.deleteOwnAccount(user.id, "yanlis")).rejects.toMatchObject({ status: 403 });
    expect(supabase.deleteUserStrict).not.toHaveBeenCalled();
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.deletedAt).toBeNull();
  });

  it("provider outage while checking the password is passed through, not reported as a wrong password", async () => {
    const { user } = await makeCompanyWithUser(prisma);
    await withAuth(user.id);
    const { service, supabase } = rig();
    supabase.verifyPassword.mockRejectedValueOnce(new ServiceUnavailableException());
    await expect(service.deleteOwnAccount(user.id, "dogru")).rejects.toMatchObject({ status: 503 });
  });

  it("member: anonymised at once, live requests go to the Founder, company stays", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATIN_ALMACI]);
    await withAuth(member.id);
    await withDevice(member.id, owner.company.id, "tok-member");
    await withDevice(owner.user.id, owner.company.id, "tok-owner");
    const listing = await makeListing(prisma, { companyId: owner.company.id, createdById: member.id });
    const { service, supabase, seo } = rig();

    const result = await service.deleteOwnAccount(member.id, "dogru");

    expect(result).toEqual({ ok: true, companyClosed: false });
    expect(supabase.deleteUserStrict).toHaveBeenCalledWith(`auth-${member.id}`);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.email).toBe(`deleted-${member.id}@deleted.rothern`);
    expect(row.email).not.toBe(member.email);
    expect(row.firstName).not.toBe(member.firstName);
    expect(row.phone).toBeNull();
    expect(row.authId).toBeNull();
    expect(row.isActive).toBe(false);
    expect(row.deletedAt).not.toBeNull();
    expect(row.tokenVersion).toBe(member.tokenVersion + 1);
    // Push devices (2026-10-14): the deleted account's phone stops getting
    // pushes; the other members' devices stay.
    expect(await prisma.pushDevice.findMany({ select: { token: true } })).toEqual([
      { token: "tok-owner" },
    ]);
    const moved = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(moved.createdById).toBe(owner.user.id);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(company.isBlocked).toBe(false);
    expect(seo.companyChanged).not.toHaveBeenCalled();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.self_deleted" },
    });
    expect(audit.tenantId).toBe(owner.company.id);
    expect(JSON.stringify(audit.metadata)).not.toContain(member.email);
  });

  it("Founder with other members must hand the company over first", async () => {
    const owner = await makeCompanyWithUser(prisma);
    await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(owner.user.id);
    const { service, supabase } = rig();
    await expect(service.deleteOwnAccount(owner.user.id, "dogru")).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: "ACCOUNT_OWNER_MUST_TRANSFER" }),
    });
    expect(supabase.deleteUserStrict).not.toHaveBeenCalled();
  });

  it("last member: the company closes with the account and leaves the public surface", async () => {
    const owner = await makeCompanyWithUser(prisma);
    await withAuth(owner.user.id);
    await prisma.company.update({ where: { id: owner.company.id }, data: { publicEnabled: true } });
    const { service, seo } = rig();

    const result = await service.deleteOwnAccount(owner.user.id, "dogru");

    expect(result).toEqual({ ok: true, companyClosed: true });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(company.isBlocked).toBe(true);
    expect(company.publicEnabled).toBe(false);
    expect(company.blockedAt).not.toBeNull();
    expect(seo.companyChanged).toHaveBeenCalledWith(owner.company.id);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: owner.user.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it("last member with an open request cannot close the company", async () => {
    const owner = await makeCompanyWithUser(prisma);
    await withAuth(owner.user.id);
    await makeListing(prisma, { companyId: owner.company.id, createdById: owner.user.id });
    const { service, supabase } = rig();
    await expect(service.deleteOwnAccount(owner.user.id, "dogru")).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: "ACCOUNT_HAS_OPEN_WORK" }),
    });
    expect(supabase.deleteUserStrict).not.toHaveBeenCalled();
    const company = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(company.isBlocked).toBe(false);
  });

  it("identity provider failure rolls the whole deletion back", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(member.id);
    await withDevice(member.id, owner.company.id, "tok-member");
    const { service, supabase } = rig();
    supabase.deleteUserStrict.mockRejectedValueOnce(new Error("provider down"));
    await expect(service.deleteOwnAccount(member.id, "dogru")).rejects.toThrow("provider down");
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.deletedAt).toBeNull();
    expect(row.email).toBe(member.email);
    expect(row.authId).toBe(`auth-${member.id}`);
    expect(await prisma.pushDevice.count({ where: { companyUserId: member.id } })).toBe(1);
  });

  it("a deleted account cannot be deleted again", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(member.id);
    const { service } = rig();
    await service.deleteOwnAccount(member.id, "dogru");
    await expect(service.deleteOwnAccount(member.id, "dogru")).rejects.toMatchObject({ status: 401 });
  });

  it("member: AI usage rows keep the cost but lose the address; team invitations lose the address; consents reset", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], {
      profileImprovementConsent: true,
      marketingConsent: true,
    });
    await withAuth(member.id);
    await prisma.aiUsage.create({
      data: {
        companyId: owner.company.id,
        userId: member.id,
        userEmail: member.email,
        feature: "assistant",
        model: "m",
        status: "SETTLED",
        costUsd: "0.010000",
      },
    });
    // Davet adresleri küçük harfle saklanır (`CompanyUsersService.invite`).
    const invitation = await prisma.companyUserInvitation.create({
      data: {
        companyId: owner.company.id,
        email: member.email,
        token: `tok-${member.id}`,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: owner.user.id,
        acceptedAt: new Date(),
      },
    });
    const { service } = rig();

    await service.deleteOwnAccount(member.id, "dogru");

    const usage = await prisma.aiUsage.findFirstOrThrow({ where: { userId: member.id } });
    expect(usage.userEmail).toBeNull();
    expect(usage.costUsd.toString()).toBe("0.01");
    const inv = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(inv.email).toBe(`deleted-${member.id}@deleted.rothern`);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.marketingConsent).toBe(false);
    expect(row.profileImprovementConsent).toBe(false);
  });

  /* İnceleme 2026-10-16: davet temizliği `equals + mode: insensitive` idi —
     Prisma bunu kaçışsız ILIKE'a çevirir, "_" tek karakter eşler. "a_b@" silinince
     iş arkadaşının "a.b@" daveti yer tutucuya dönüyor, kabul edilemez oluyordu. */
  it("invitation scrub is an EXACT match: a look-alike colleague's invitation ('_' / '%') stays untouched", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], {
      email: "a_b%x@corp.com",
    });
    await withAuth(member.id);
    const inv = (email: string, status: "PENDING" | "ACCEPTED") =>
      prisma.companyUserInvitation.create({
        data: {
          companyId: owner.company.id,
          email,
          token: `tok-${email}`,
          status,
          expiresAt: new Date(Date.now() + 86_400_000),
          invitedById: owner.user.id,
          ...(status === "ACCEPTED" ? { acceptedAt: new Date() } : {}),
        },
      });
    const own = await inv("a_b%x@corp.com", "ACCEPTED");
    // Kaçışsız ILIKE'ta ikisi de eşleşirdi: "_" → ".", "X"; "%" → "zz", "YYY".
    const lookAlike = await inv("a.bzzx@corp.com", "PENDING");
    const lookAlike2 = await inv("aXbYYYx@corp.com", "PENDING");
    const { service } = rig();

    await service.deleteOwnAccount(member.id, "dogru");

    expect((await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: own.id } })).email).toBe(
      `deleted-${member.id}@deleted.rothern`,
    );
    for (const other of [lookAlike, lookAlike2]) {
      const row = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: other.id } });
      expect(row.email).toBe(other.email);
      expect(row.status).toBe("PENDING");
    }
  });

  it("closing the company cancels its pending team invitations (nobody joins a closed company)", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    await withAuth(user.id);
    const pending = await prisma.companyUserInvitation.create({
      data: {
        companyId: company.id,
        email: "yeni@firma.com",
        token: "tok-pending",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: user.id,
      },
    });
    const { service } = rig();

    const result = await service.deleteOwnAccount(user.id, "dogru");

    expect(result.companyClosed).toBe(true);
    const row = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: pending.id } });
    expect(row.status).toBe("CANCELLED");
    // Başka kişinin adresi silmenin konusu değil: firma silmesine kalır.
    expect(row.email).toBe("yeni@firma.com");
  });
});

/**
 * KVKK erasure by an administrator (2026-10-16): the privacy texts promise the
 * KVKK address to someone who cannot sign in. Same rules and erasure as the
 * self-service path, no password; a member a manager already removed loses the
 * name and phone that removal left behind.
 */
describe("AccountDeletionService.eraseByAdmin", () => {
  it("live member: erased without a password, written to the audit as an admin action", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { isActive: false });
    await withAuth(member.id);
    const { service, supabase } = rig();

    const result = await service.eraseByAdmin(owner.company.id, member.id, "admin-1");

    expect(result).toEqual({ ok: true, companyClosed: false, alreadyRemoved: false });
    expect(supabase.verifyPassword).not.toHaveBeenCalled();
    expect(supabase.deleteUserStrict).toHaveBeenCalledWith(`auth-${member.id}`);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.email).toBe(`deleted-${member.id}@deleted.rothern`);
    expect(row.firstName).toBe("Silinmiş");
    expect(row.lastName).toBe("Kullanıcı");
    expect(row.phone).toBeNull();
    expect(row.deletedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.user.erased" } });
    expect(audit).toMatchObject({
      actorType: "admin",
      actorId: "admin-1",
      tenantId: owner.company.id,
      entityId: member.id,
    });
  });

  it("member removed by a manager: the leftover name and phone go, the removal date stays", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const removedAt = new Date("2026-09-01T10:00:00.000Z");
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], {
      isActive: false,
      deletedAt: removedAt,
      phone: "+905551112233",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      authId: "auth-leftover",
    });
    await prisma.companyUser.update({
      where: { id: member.id },
      data: { email: `deleted-${member.id}@deleted.rothern` },
    });
    const { service, supabase } = rig();

    const result = await service.eraseByAdmin(owner.company.id, member.id, "admin-1");

    expect(result).toEqual({ ok: true, companyClosed: false, alreadyRemoved: true });
    expect(supabase.deleteUserStrict).toHaveBeenCalledWith("auth-leftover");
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.firstName).toBe("Silinmiş");
    expect(row.lastName).toBe("Kullanıcı");
    expect(row.phone).toBeNull();
    expect(row.authId).toBeNull();
    expect(row.deletedAt?.toISOString()).toBe(removedAt.toISOString());
  });

  it("the Founder rule applies to the administrator too", async () => {
    const owner = await makeCompanyWithUser(prisma);
    await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(owner.user.id);
    // Giriş yapabilen hesap zaten reddedilir; kural pasif Kurucuda sınanır.
    await prisma.companyUser.update({ where: { id: owner.user.id }, data: { isActive: false } });
    const { service, supabase } = rig();
    await expect(service.eraseByAdmin(owner.company.id, owner.user.id, "admin-1")).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: "ACCOUNT_OWNER_MUST_TRANSFER" }),
    });
    expect(supabase.deleteUserStrict).not.toHaveBeenCalled();
  });

  it("a user of another company is not found", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const { service } = rig();
    await expect(service.eraseByAdmin(a.company.id, b.user.id, "admin-1")).rejects.toMatchObject({ status: 404 });
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: b.user.id } });
    expect(row.deletedAt).toBeNull();
  });
});


/**
 * İnceleme 2026-10-16 — yöneticinin KVKK silmesinin retleri (409, hiçbir şey
 * yazılmaz) ve onay penceresinin ön bilgisi.
 */
describe("AccountDeletionService.eraseByAdmin — refusals", () => {
  const SUSPENSION = "Şikayet üzerine askıya alındı: sahte vergi levhası";
  const SUSPENDED_AT = new Date("2026-09-01T10:00:00.000Z");

  it("an account that can still sign in is refused (the person deletes it in the app)", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(member.id);
    const { service, supabase } = rig();

    await expect(service.eraseByAdmin(owner.company.id, member.id, "admin-1")).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "ACCOUNT_CAN_SIGN_IN" }),
    });
    expect(supabase.deleteUserStrict).not.toHaveBeenCalled();
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.deletedAt).toBeNull();
    expect(row.email).toBe(member.email);
    expect(await prisma.auditLog.count({ where: { action: "admin.user.erased" } })).toBe(0);
  });

  it("the last user of a company an administrator suspended: refused, the suspension reason and date stay", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    await withAuth(user.id);
    await prisma.company.update({
      where: { id: company.id },
      data: { isBlocked: true, blockedReason: SUSPENSION, blockedAt: SUSPENDED_AT },
    });
    const { service, supabase } = rig();

    await expect(service.eraseByAdmin(company.id, user.id, "admin-1")).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "ACCOUNT_COMPANY_SUSPENDED" }),
    });
    expect(supabase.deleteUserStrict).not.toHaveBeenCalled();
    const c = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(c.blockedReason).toBe(SUSPENSION);
    expect(c.blockedAt?.toISOString()).toBe(SUSPENDED_AT.toISOString());
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.deletedAt).toBeNull();
  });

  it("a non-last user of a suspended company is erased; the suspension record is untouched", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(member.id);
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { isBlocked: true, blockedReason: SUSPENSION, blockedAt: SUSPENDED_AT },
    });
    const { service } = rig();

    const result = await service.eraseByAdmin(owner.company.id, member.id, "admin-1");

    expect(result).toEqual({ ok: true, companyClosed: false, alreadyRemoved: false });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.blockedReason).toBe(SUSPENSION);
    expect(c.blockedAt?.toISOString()).toBe(SUSPENDED_AT.toISOString());
  });

  it("an anonymised company: refused", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { isActive: false });
    await prisma.company.update({ where: { id: owner.company.id }, data: { isActive: false, isBlocked: true } });
    const { service } = rig();
    await expect(service.eraseByAdmin(owner.company.id, member.id, "admin-1")).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "COMPANY_ANONYMIZED" }),
    });
  });

  it("a company already closed by its last user keeps its closure date (the 30-day clock does not restart)", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const closedAt = new Date(Date.now() - 12 * 86_400_000);
    // Kapanmış firmada kalmış canlı (pasif) bir hesap — örn. eski bir yarıştan.
    await prisma.companyUser.update({
      where: { id: owner.user.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    const leftover = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { isActive: false });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: {
        isBlocked: true,
        blockedReason: "Hesap sahibi sildi - KVKK silme bekliyor",
        blockedAt: closedAt,
        publicEnabled: false,
      },
    });
    const { service } = rig();

    const result = await service.eraseByAdmin(owner.company.id, leftover.id, "admin-1");

    expect(result.companyClosed).toBe(true);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.blockedAt?.toISOString()).toBe(closedAt.toISOString());
  });
});

describe("AccountDeletionService.adminErasurePreview", () => {
  it("removed member: the placeholder address is hidden, the address last used comes from the audit log; same-name rows are counted", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const removedAt = new Date("2026-09-01T10:00:00.000Z");
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], {
      isActive: false,
      deletedAt: removedAt,
      firstName: "Ayşe",
      lastName: "Yılmaz",
    });
    await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], { firstName: "ayşe", lastName: "Yılmaz" });
    const audit = new AuditService(prisma as never);
    await audit.log({
      action: "company.listing.created",
      actorType: "company",
      actorId: member.id,
      actorEmail: "ayse.yilmaz@firma.com",
      tenantId: owner.company.id,
      entityType: "listing",
      entityId: "l-1",
    });
    await prisma.companyUser.update({
      where: { id: member.id },
      data: { email: `deleted-${member.id}@deleted.rothern` },
    });
    const { service } = rig();

    const preview = await service.adminErasurePreview(owner.company.id, member.id);

    expect(preview).toMatchObject({
      name: "Ayşe Yılmaz",
      email: null,
      lastKnownEmail: "ayse.yilmaz@firma.com",
      nothingLeft: false,
      closesCompany: false,
      companySuspension: null,
      sameNameCount: 1,
      blocker: null,
    });
    expect(preview.removedAt?.toISOString()).toBe(removedAt.toISOString());
  });

  it("states the refusal the erasure would give: can sign in / suspended company's last user", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const { service } = rig();
    expect((await service.adminErasurePreview(owner.company.id, owner.user.id)).blocker).toBe("ACCOUNT_CAN_SIGN_IN");

    await prisma.company.update({
      where: { id: owner.company.id },
      data: { isBlocked: true, blockedReason: "Yönetici tarafından askıya alındı", blockedAt: new Date() },
    });
    const preview = await service.adminErasurePreview(owner.company.id, owner.user.id);
    expect(preview.blocker).toBe("ACCOUNT_COMPANY_SUSPENDED");
    expect(preview.closesCompany).toBe(true);
    expect(preview.companySuspension?.reason).toBe("Yönetici tarafından askıya alındı");
  });

  it("a user of another company is not found", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const { service } = rig();
    await expect(service.adminErasurePreview(a.company.id, b.user.id)).rejects.toMatchObject({ status: 404 });
  });
});

/* SAKLAMA VE İMHA POLİTİKASI satır 1 (inceleme 2026-10-16): üyelik bitince hesap
   verisi gider. Yöneticinin ekipten çıkardığı kişide telefon, iki adımlı
   doğrulama, bildirim tercihleri, izinler, bekleyen bağlantı / kodlar,
   bildirimler, asistan sohbetleri ve adres (AI kullanım kaydı, ekip daveti)
   çıkarılınca silinir; AD firma kaydı süresince kalır (işlemi yapan görünür). */
describe("CompanyUsersService.remove — the removed member's account data goes at removal", () => {
  it("phone, two-step data, preferences, consents, links, codes, notifications, chats and addresses go; the name stays", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI], {
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: "+905551112233",
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date(),
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorRecoveryCodes: ["hash-1", "hash-2"],
      notificationPrefs: { categoryMatch: false },
      marketingConsent: true,
      profileImprovementConsent: true,
    });
    const colleague = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await prisma.passwordResetToken.create({
      data: { companyUserId: member.id, tokenHash: `h-${member.id}`, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.emailVerificationCode.create({
      data: { companyUserId: member.id, codeHash: "c", expiresAt: new Date(Date.now() + 900_000) },
    });
    for (const userId of [member.id, colleague.id]) {
      await prisma.notification.create({
        data: { companyUserId: userId, companyId: owner.company.id, type: "listing_invitation", title: "t", body: "b" },
      });
    }
    await prisma.aiChatSession.create({ data: { companyId: owner.company.id, userId: member.id, title: "Sohbet" } });
    await prisma.aiUsage.create({
      data: {
        companyId: owner.company.id,
        userId: member.id,
        userEmail: member.email,
        feature: "assistant",
        model: "m",
        status: "SETTLED",
        costUsd: "0.010000",
      },
    });
    const invite = (email: string, token: string) =>
      prisma.companyUserInvitation.create({
        data: {
          companyId: owner.company.id,
          email,
          token,
          status: "ACCEPTED",
          expiresAt: new Date(Date.now() + 86_400_000),
          invitedById: owner.user.id,
          acceptedAt: new Date(),
        },
      });
    const memberInvitation = await invite(member.email, `tok-${member.id}`);
    const colleagueInvitation = await invite(colleague.email, `tok-${colleague.id}`);
    const before = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    const svc = new CompanyUsersService(
      prisma as never,
      { deleteUser: jest.fn(async () => undefined) } as never,
      {} as never,
      { send: jest.fn() } as never,
      { get: () => undefined } as never,
      new AuditService(prisma as never),
    );

    await expect(svc.remove(owner.auth, member.id)).resolves.toEqual({ ok: true });

    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row).toMatchObject({
      firstName: "Ayşe",
      lastName: "Yılmaz",
      email: `deleted-${member.id}@deleted.rothern`,
      isActive: false,
      phone: null,
      twoFactorEnabled: false,
      twoFactorEnabledAt: null,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
      notificationPrefs: null,
      marketingConsent: false,
      profileImprovementConsent: false,
      tokenVersion: before.tokenVersion + 1,
    });
    expect(row.deletedAt).not.toBeNull();
    expect(await prisma.passwordResetToken.count({ where: { companyUserId: member.id } })).toBe(0);
    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: member.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { companyUserId: member.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { companyUserId: colleague.id } })).toBe(1);
    expect(await prisma.aiChatSession.count({ where: { userId: member.id } })).toBe(0);
    const usage = await prisma.aiUsage.findFirstOrThrow({ where: { userId: member.id } });
    expect(usage.userEmail).toBeNull();
    expect(usage.costUsd.toString()).toBe("0.01");
    expect((await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: memberInvitation.id } })).email).toBe(
      `deleted-${member.id}@deleted.rothern`,
    );
    expect((await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: colleagueInvitation.id } })).email).toBe(
      colleague.email,
    );
  });
});
