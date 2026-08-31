/**
 * Denetim 2026-08-26 Parça 10 (Web/Admin ön yüz) — Dalga A sözleşmeleri.
 * Rapor: docs/audit-2026-08-26-part10-frontend.md
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

function rig() {
  const storage = {
    presignStoredObject: jest.fn().mockResolvedValue(null),
    presignInlinePreview: jest.fn().mockResolvedValue(null),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminCompaniesService(
    prisma as never,
    storage as never,
    { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
    { pushToCompany: jest.fn().mockResolvedValue(1) } as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    new AuditService(prisma as never),
    new EmailSuppressionService(prisma as never),
  );
  return { service };
}

async function makeComplaint(
  againstCompanyId: string,
  complainantCompanyId: string,
  createdById: string,
) {
  return prisma.companyComplaint.create({
    data: {
      againstCompanyId,
      complainantCompanyId,
      createdById,
      reason: "Diğer",
      detail: "test şikayeti",
      status: "OPEN",
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("#2 — şikayet çözme ucundaki `suspend` bayrağı SUPER_ADMIN ister", () => {
  it("SALES askıya alamaz (yan kapı kapalı) ve firma bloke OLMAZ", async () => {
    const { service } = rig();
    const target = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const complainer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const c = await makeComplaint(
      target.company.id,
      complainer.company.id,
      complainer.user.id,
    );

    await expect(
      service.resolveComplaint(
        c.id,
        { status: "RESOLVED", suspend: true, suspendReason: "x" },
        "admin-sales",
        "SALES",
      ),
    ).rejects.toThrow(/yalnız SUPER_ADMIN/i);

    const after = await prisma.company.findUniqueOrThrow({
      where: { id: target.company.id },
      select: { isBlocked: true },
    });
    expect(after.isBlocked).toBe(false);
    // Şikayet de sonuçlanmamış olmalı (kapı yan etkiden ÖNCE).
    const complaint = await prisma.companyComplaint.findUniqueOrThrow({
      where: { id: c.id },
    });
    expect(complaint.status).toBe("OPEN");
  });

  it("SALES askıya ALMADAN şikayeti sonuçlandırabilir", async () => {
    const { service } = rig();
    const target = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const complainer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const c = await makeComplaint(
      target.company.id,
      complainer.company.id,
      complainer.user.id,
    );

    await service.resolveComplaint(
      c.id,
      { status: "RESOLVED", adminNote: "görüşüldü" },
      "admin-sales",
      "SALES",
    );
    const complaint = await prisma.companyComplaint.findUniqueOrThrow({
      where: { id: c.id },
    });
    expect(complaint.status).toBe("RESOLVED");
  });

  it("SUPER_ADMIN askıya alabilir", async () => {
    const { service } = rig();
    const target = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const complainer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const c = await makeComplaint(
      target.company.id,
      complainer.company.id,
      complainer.user.id,
    );

    await service.resolveComplaint(
      c.id,
      { status: "RESOLVED", suspend: true, suspendReason: "spam" },
      "admin-super",
      "SUPER_ADMIN",
    );
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: target.company.id },
      select: { isBlocked: true },
    });
    expect(after.isBlocked).toBe(true);
  });
});
