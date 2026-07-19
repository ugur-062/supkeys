import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { normalizeShortCode, validateShortCode } from "@rothern/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Karşılıklı görünmezlik: ben engelledim VEYA beni engelledi → tüm id'ler. */
  async blockedCompanyIds(companyId: string): Promise<string[]> {
    const rows = await this.prisma.companyBlock.findMany({
      where: {
        OR: [
          { blockerCompanyId: companyId },
          { blockedCompanyId: companyId },
        ],
      },
      select: { blockerCompanyId: true, blockedCompanyId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(
        r.blockerCompanyId === companyId
          ? r.blockedCompanyId
          : r.blockerCompanyId,
      );
    }
    return [...ids];
  }

  async block(
    actor: AuthenticatedCompanyUser,
    rothernIdRaw: string,
    reason?: string,
  ) {
    const code = normalizeShortCode(rothernIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz firma kodu");
    }
    const target = await this.prisma.company.findUnique({
      where: { rothernId: code },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException("Firma bulunamadı");
    if (target.id === actor.companyId) {
      throw new BadRequestException("Kendinizi engelleyemezsiniz");
    }

    await this.prisma.$transaction([
      this.prisma.companyBlock.upsert({
        where: {
          blockerCompanyId_blockedCompanyId: {
            blockerCompanyId: actor.companyId,
            blockedCompanyId: target.id,
          },
        },
        create: {
          blockerCompanyId: actor.companyId,
          blockedCompanyId: target.id,
          reason: reason?.trim() || null,
        },
        update: { reason: reason?.trim() || null },
      }),
      // Mevcut bağlantı/davet varsa kaldır (iki yön).
      this.prisma.companyConnection.deleteMany({
        where: {
          OR: [
            { inviterCompanyId: actor.companyId, inviteeCompanyId: target.id },
            { inviterCompanyId: target.id, inviteeCompanyId: actor.companyId },
          ],
        },
      }),
    ]);
    // INV-AUDIT-1 (dalga 3): engelleme ilişkiyi de koparır → uyuşmazlıkta delil.
    await this.audit.log({
      action: "company.connection.blocked",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_block",
      entityId: target.id,
      metadata: {
        blockerCompanyId: actor.companyId,
        blockedCompanyId: target.id,
        reason: reason?.trim() || null,
      },
    });
    return { ok: true, name: target.name };
  }

  async unblock(actor: AuthenticatedCompanyUser, targetCompanyId: string) {
    await this.prisma.companyBlock.deleteMany({
      where: {
        blockerCompanyId: actor.companyId,
        blockedCompanyId: targetCompanyId,
      },
    });
    // INV-AUDIT-1 (dalga 3): engel kaldırma, uyuşmazlıkta delil.
    await this.audit.log({
      action: "company.connection.unblocked",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_block",
      entityId: targetCompanyId,
      metadata: {
        blockerCompanyId: actor.companyId,
        blockedCompanyId: targetCompanyId,
      },
    });
    return { ok: true };
  }

  async list(actor: AuthenticatedCompanyUser) {
    const rows = await this.prisma.companyBlock.findMany({
      where: { blockerCompanyId: actor.companyId },
      include: {
        blocked: { select: { id: true, name: true, rothernId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({ company: r.blocked, createdAt: r.createdAt }));
  }
}
