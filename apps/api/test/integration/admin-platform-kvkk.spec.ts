/**
 * Faz 8-9 — KVKK export/silme-anonimleştirme + suppression aklama marker'ı.
 * Kural: siparişsiz firma HARD delete; siparişli firma ANONİMLEŞTİRİLİR
 * (finansal kayıt korunur). Aklama append-only marker'dır.
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
