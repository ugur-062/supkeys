/**
 * Admin yıkıcı aksiyonları append-only audit_logs'a yazılır (actor kimliğiyle).
 * Denetim izi olmadan firma askıya alınması/tier verilmesi = uyumluluk açığıydı.
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

function rig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
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

describe("Admin aksiyonları audit'lenir", () => {
  it("suspend → audit_log (admin actorId + action + entityId)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await service.suspend(co.company.id, "spam", "admin-123");
    const row = await prisma.auditLog.findFirst({
      where: { action: "admin.company.suspended", entityId: co.company.id },
    });
    expect(row).not.toBeNull();
    expect(row!.actorType).toBe("admin");
    expect(row!.actorId).toBe("admin-123");
  });

  it("setTier → audit_log (actorId + tier metadata)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    await service.setTier(co.company.id, "PAKET", 12, "admin-9");
    const row = await prisma.auditLog.findFirst({
      where: { action: "admin.company.tier_set", entityId: co.company.id },
    });
    expect(row).not.toBeNull();
    expect(row!.actorId).toBe("admin-9");
  });

  it("verification_set → audit_log", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    await service.setVerification(co.company.id, "REJECTED", "admin-7");
    const row = await prisma.auditLog.findFirst({
      where: {
        action: "admin.company.verification_set",
        entityId: co.company.id,
      },
    });
    expect(row).not.toBeNull();
    expect(row!.actorId).toBe("admin-7");
  });
});
