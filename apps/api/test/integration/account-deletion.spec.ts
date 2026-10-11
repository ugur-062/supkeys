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
    const { service, supabase } = rig();
    supabase.deleteUserStrict.mockRejectedValueOnce(new Error("provider down"));
    await expect(service.deleteOwnAccount(member.id, "dogru")).rejects.toThrow("provider down");
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.deletedAt).toBeNull();
    expect(row.email).toBe(member.email);
    expect(row.authId).toBe(`auth-${member.id}`);
  });

  it("a deleted account cannot be deleted again", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await withAuth(member.id);
    const { service } = rig();
    await service.deleteOwnAccount(member.id, "dogru");
    await expect(service.deleteOwnAccount(member.id, "dogru")).rejects.toMatchObject({ status: 401 });
  });
});
