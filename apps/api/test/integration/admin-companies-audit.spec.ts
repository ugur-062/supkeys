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

describe("updateProfile — kimlik düzeltme (Faz 2)", () => {
  it("yalnız gönderilen+değişen alanlar güncellenir, öncesi/sonrası audit'e yazılır", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const res = await service.updateProfile(
      co.company.id,
      { taxOffice: "Kadıköy", city: "İstanbul" },
      "admin-1",
    );
    expect(res.changed.sort()).toEqual(["city", "taxOffice"]);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
      select: { taxOffice: true, city: true, name: true },
    });
    expect(after.taxOffice).toBe("Kadıköy");
    expect(after.city).toBe("İstanbul");
    // Ad gönderilmedi → dokunulmadı.
    expect(after.name).toBe(co.company.name);
    const log = await prisma.auditLog.findFirst({
      where: {
        action: "admin.company.profile_updated",
        entityId: co.company.id,
      },
    });
    expect(log).not.toBeNull();
    expect(log!.actorId).toBe("admin-1");
    const changes = (log!.metadata as { changes: Record<string, unknown> })
      .changes;
    expect(Object.keys(changes).sort()).toEqual(["city", "taxOffice"]);
  });

  it("değişiklik yoksa update/audit atlanır; ülke koda normalize edilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const noop = await service.updateProfile(
      co.company.id,
      { country: "TR" },
      "admin-1",
    );
    expect(noop.changed).toEqual([]);
    const res = await service.updateProfile(
      co.company.id,
      { country: "de" },
      "admin-1",
    );
    expect(res.changed).toEqual(["country"]);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
      select: { country: true },
    });
    expect(after.country).toBe("DE");
  });

  it("firma adı boşa çekilemez", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await expect(
      service.updateProfile(co.company.id, { name: "  " }, "admin-1"),
    ).rejects.toThrow("Firma adı boş olamaz");
  });
});

describe("list — sayfalama + kuyruk sıralaması (Faz 1-2)", () => {
  it("paged shape döner; sort=oldest updatedAt artan sıralar", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    // b'yi daha eski güncellenmiş yap (kuyrukta önce gelmeli).
    await prisma.company.update({
      where: { id: b.company.id },
      data: { updatedAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    const res = await service.list({ sort: "oldest", page: 1, pageSize: 10 });
    expect(res.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.items)).toBe(true);
    const ids = res.items.map((r) => r.id);
    expect(ids.indexOf(b.company.id)).toBeLessThan(ids.indexOf(a.company.id));
    // Kuyruk yaşı alanı mevcut.
    expect(res.items[0]!.updatedAt).toBeInstanceOf(Date);
  });

  it("stats funnel adımlarını döner", async () => {
    const { service } = rig();
    await makeCompanyWithUser(prisma, {});
    const stats = await service.stats();
    expect(stats.funnel.signedUp).toBeGreaterThanOrEqual(1);
    expect(stats.funnel).toHaveProperty("onboarded");
    expect(stats.funnel).toHaveProperty("kycSubmitted");
    expect(stats.funnel).toHaveProperty("verified");
  });
});
