import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyBlocksService {
  constructor(private readonly prisma: PrismaService) {}

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
    supkeysIdRaw: string,
    reason?: string,
  ) {
    const code = normalizeShortCode(supkeysIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz firma kodu");
    }
    const target = await this.prisma.company.findUnique({
      where: { supkeysId: code },
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
    return { ok: true, name: target.name };
  }

  async unblock(actor: AuthenticatedCompanyUser, targetCompanyId: string) {
    await this.prisma.companyBlock.deleteMany({
      where: {
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
        blocked: { select: { id: true, name: true, supkeysId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({ company: r.blocked, createdAt: r.createdAt }));
  }
}
