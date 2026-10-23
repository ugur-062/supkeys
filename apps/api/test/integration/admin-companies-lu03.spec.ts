/**
 * Derin denetim 2026-09-29 LU-03 — admin firma uclari (dusuk):
 *  - KYC kuyruk yasi firma basina EN SON gonderimden olculur
 *  - admin vergi no duzeltmesi onboarding ile ayni normalize/dogrulama
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

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
  return { service, notifications };
}

const DAY = 86_400_000;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("stats.oldestPendingSince", () => {
  it("reddedilip yeniden gonderen firmada ilk degil SON gonderim sayilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { companyVerificationStatus: "PENDING" });
    const first = new Date(Date.now() - 59 * DAY);
    const resubmit = new Date(Date.now() - 2 * 3600_000);
    await prisma.auditLog.createMany({
      data: [first, resubmit].map((createdAt) => ({
        action: "company.docs.submitted",
        actorType: "company",
        entityType: "company",
        entityId: co.company.id,
        createdAt,
      })),
    });
    const stats = await service.stats();
    expect(new Date(stats.oldestPendingSince as Date).getTime()).toBe(resubmit.getTime());
  });

  it("kuyruk yasi firma bazli son girislerin en eskisi", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, { companyVerificationStatus: "PENDING" });
    const b = await makeCompanyWithUser(prisma, { companyVerificationStatus: "PENDING" });
    const aLast = new Date(Date.now() - 5 * DAY);
    const bLast = new Date(Date.now() - 1 * DAY);
    await prisma.auditLog.createMany({
      data: [
        { entityId: a.company.id, createdAt: new Date(Date.now() - 30 * DAY) },
        { entityId: a.company.id, createdAt: aLast },
        { entityId: b.company.id, createdAt: bLast },
      ].map((r) => ({
        action: "company.docs.submitted",
        actorType: "company",
        entityType: "company",
        ...r,
      })),
    });
    const stats = await service.stats();
    expect(new Date(stats.oldestPendingSince as Date).getTime()).toBe(aLast.getTime());
  });
});

describe("updateProfile taxNumber", () => {
  it("ulke onegi/etiket atilarak normalize saklanir; normalize esi baska firmadaysa 409", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, { country: "DE" });
    const b = await makeCompanyWithUser(prisma, { country: "DE" });
    await service.updateProfile(a.company.id, { taxNumber: "DE811569869" }, "admin-1");
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: a.company.id },
      select: { taxNumber: true },
    });
    expect(after.taxNumber).toBe("811569869");
    const err = await service
      .updateProfile(b.company.id, { taxNumber: "DE 811569869" }, "admin-1")
      .catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(409);
  });

  it("TR firmada gecersiz vergi no 400 ile reddedilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const err = await service
      .updateProfile(co.company.id, { taxNumber: "12345" }, "admin-1")
      .catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(400);
  });

  it("normalize degeri mevcutla ayniysa degisiklik sayilmaz", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { country: "DE" });
    await prisma.company.update({ where: { id: co.company.id }, data: { taxNumber: "811569869" } });
    const res = await service.updateProfile(co.company.id, { taxNumber: "DE811569869" }, "admin-1");
    expect(res.changed).toEqual([]);
  });
});

// Yeniden doğrulama api1-02 (D-115 ailesi): notifyCompany portalı in-app
// satıra taşır; verilmezse portal-nötr kalır (hesap/doğrulama bildirimleri).
describe("notifyCompany portal", () => {
  it("portal verilirse in-app yükte aynen geçer, verilmezse boş kalır", async () => {
    const { service, notifications } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await service.notifyCompany(co.company.id, {
      type: "admin_listing_closed",
      subject: "x",
      portal: "satinalma",
    });
    await service.notifyCompany(co.company.id, { type: "company_verified", subject: "y" });
    expect(notifications.pushToCompany).toHaveBeenNthCalledWith(
      1,
      co.company.id,
      expect.objectContaining({ type: "admin_listing_closed", portal: "satinalma" }),
    );
    expect(notifications.pushToCompany.mock.calls[1][1].portal).toBeUndefined();
  });
});
