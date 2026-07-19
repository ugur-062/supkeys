/**
 * INV-AUDIT-1 (dalga 3) — Bağlantı aksiyonları denetim izi.
 * İstek/kabul/ret/koparma + engelle/engel-kaldır her biri audit_logs'a bir kayıt
 * düşürür (actor + zaman + ilgili firma id'leri). Uyuşmazlıkta delil.
 * Aksiyonların kendi davranışı connections.spec'te — burada yalnız EK iz.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

let codeSeq = 100;
async function giveRothernId(companyId: string): Promise<string> {
  const code = `TEST-${String(codeSeq++).padStart(4, "0")}`;
  await prisma.company.update({
    where: { id: companyId },
    data: { rothernId: code },
  });
  return code;
}

function rig() {
  const audit = new AuditService(prisma as never);
  const blocks = new CompanyBlocksService(prisma as never, audit);
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = {
    pushToCompany: jest.fn().mockResolvedValue(1),
    pushToUser: jest.fn().mockResolvedValue(1),
  };
  const service = new CompanyConnectionsService(
    prisma as never,
    blocks,
    email as never,
    config as never,
    notifications as never,
    audit,
  );
  return { service, blocks };
}

async function twoCompanies() {
  const a = await makeCompanyWithUser(prisma, { tier: "PAKET" });
  const b = await makeCompanyWithUser(prisma, { tier: "PAKET" });
  const bCode = await giveRothernId(b.company.id);
  return { a, b, bCode };
}

describe("bağlantı aksiyonları audit'i", () => {
  it("davet → company.connection.requested iz (actor=davet eden, inviter/invitee)", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();

    const res = await service.invite(a.auth, bCode);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.connection.requested", entityId: res.id },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(a.user.id);
    expect(row.tenantId).toBe(a.company.id);
    expect(row.entityType).toBe("company_connection");
    expect(row.metadata).toMatchObject({
      inviterCompanyId: a.company.id,
      inviteeCompanyId: b.company.id,
      origin: "PREMIUM",
    });
  });

  it("kabul → company.connection.accepted iz (actor=kabul eden/invitee)", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const req = await service.invite(a.auth, bCode);

    await service.accept(b.auth, req.id);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.connection.accepted", entityId: req.id },
    });
    expect(row.actorId).toBe(b.user.id);
    expect(row.tenantId).toBe(b.company.id);
    expect(row.metadata).toMatchObject({
      inviterCompanyId: a.company.id,
      inviteeCompanyId: b.company.id,
    });
  });

  it("ret → company.connection.rejected iz (karşı taraf=inviter metadata'da)", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const req = await service.invite(a.auth, bCode);

    await service.reject(b.auth, req.id);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.connection.rejected", entityId: req.id },
    });
    expect(row.actorId).toBe(b.user.id);
    expect(row.metadata).toMatchObject({
      inviterCompanyId: a.company.id,
      inviteeCompanyId: b.company.id,
    });
  });

  it("koparma → company.connection.disconnected iz (actor + counterparty)", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const req = await service.invite(a.auth, bCode);
    await service.accept(b.auth, req.id);

    // Davet eden (a) ilişkiyi koparır → karşı taraf b.
    await service.disconnect(a.auth, req.id);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.connection.disconnected", entityId: req.id },
    });
    expect(row.actorId).toBe(a.user.id);
    expect(row.tenantId).toBe(a.company.id);
    expect(row.metadata).toMatchObject({
      actorCompanyId: a.company.id,
      counterpartyCompanyId: b.company.id,
    });
  });

  it("engelle → company.connection.blocked iz (blocker/blocked + reason)", async () => {
    const { blocks } = rig();
    const { a, b, bCode } = await twoCompanies();

    await blocks.block(a.auth, bCode, "spam davet");

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.connection.blocked", entityId: b.company.id },
    });
    expect(row.actorId).toBe(a.user.id);
    expect(row.tenantId).toBe(a.company.id);
    expect(row.entityType).toBe("company_block");
    expect(row.metadata).toMatchObject({
      blockerCompanyId: a.company.id,
      blockedCompanyId: b.company.id,
      reason: "spam davet",
    });
  });

  it("engel kaldır → company.connection.unblocked iz", async () => {
    const { blocks } = rig();
    const { a, b, bCode } = await twoCompanies();
    await blocks.block(a.auth, bCode);

    await blocks.unblock(a.auth, b.company.id);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.connection.unblocked", entityId: b.company.id },
    });
    expect(row.actorId).toBe(a.user.id);
    expect(row.metadata).toMatchObject({
      blockerCompanyId: a.company.id,
      blockedCompanyId: b.company.id,
    });
  });
});
