import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/**
 * Tedarikçi Şablonları — sık birlikte davet edilen bağlı firma gruplarını
 * şablonlar; ihale sihirbazından tek tıkla tüm grubu davet eder.
 * Üyeler: bağlı (ACTIVE connection) firma id'leri.
 */
@Injectable()
export class CompanySupplierTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bu firmanın ACTIVE bağlantılarındaki karşı firma id'leri. */
  private async connectedCompanyIds(companyId: string): Promise<Set<string>> {
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ inviterCompanyId: companyId }, { inviteeCompanyId: companyId }],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      set.add(
        r.inviterCompanyId === companyId
          ? r.inviteeCompanyId
          : r.inviterCompanyId,
      );
    }
    return set;
  }

  private async assertMembersConnected(companyId: string, ids: string[]) {
    if (ids.length === 0) return;
    const connected = await this.connectedCompanyIds(companyId);
    const missing = [...new Set(ids)].filter((id) => !connected.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Bağlantınız olmayan firma: ${missing.length} kayıt`,
      );
    }
  }

  async list(companyId: string) {
    const rows = await this.prisma.supplierTemplate.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isPublic: r.isPublic,
      memberCount: r.memberCompanyIds.length,
      isOwnedByMe: true,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Şablon detayı — üye firmalar (ad + rothernId + tier) ile. */
  async findOne(companyId: string, id: string) {
    const tpl = await this.prisma.supplierTemplate.findFirst({
      where: { id, companyId },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    const members = await this.prisma.company.findMany({
      where: { id: { in: tpl.memberCompanyIds } },
      select: { id: true, name: true, rothernId: true, tier: true },
    });
    return {
      id: tpl.id,
      name: tpl.name,
      isPublic: tpl.isPublic,
      members,
    };
  }

  async create(
    user: AuthenticatedCompanyUser,
    dto: { name: string; isPublic?: boolean; memberCompanyIds: string[] },
  ) {
    await this.assertMembersConnected(user.companyId, dto.memberCompanyIds);
    const tpl = await this.prisma.supplierTemplate.create({
      data: {
        companyId: user.companyId,
        createdById: user.userId,
        name: dto.name.trim(),
        isPublic: dto.isPublic ?? true,
        memberCompanyIds: [...new Set(dto.memberCompanyIds)],
      },
    });
    return { id: tpl.id };
  }

  async update(
    user: AuthenticatedCompanyUser,
    id: string,
    dto: { name?: string; isPublic?: boolean; memberCompanyIds?: string[] },
  ) {
    const tpl = await this.prisma.supplierTemplate.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (dto.memberCompanyIds) {
      await this.assertMembersConnected(user.companyId, dto.memberCompanyIds);
    }
    await this.prisma.supplierTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
        ...(dto.memberCompanyIds
          ? { memberCompanyIds: [...new Set(dto.memberCompanyIds)] }
          : {}),
      },
    });
    return { ok: true };
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    const tpl = await this.prisma.supplierTemplate.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    await this.prisma.supplierTemplate.delete({ where: { id } });
    return { id };
  }
}
