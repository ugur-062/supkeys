import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyListingTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    user: AuthenticatedCompanyUser,
    input: { name: string; payload: unknown },
  ) {
    const t = await this.prisma.listingTemplate.create({
      data: {
        companyId: user.companyId,
        name: input.name.trim(),
        payload: input.payload as Prisma.InputJsonValue,
        createdById: user.userId,
      },
    });
    return { id: t.id, name: t.name };
  }

  async list(companyId: string) {
    const rows = await this.prisma.listingTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      payload: t.payload as unknown,
      createdAt: t.createdAt,
    }));
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    const t = await this.prisma.listingTemplate.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!t || t.companyId !== user.companyId) {
      throw new NotFoundException("Şablon bulunamadı");
    }
    await this.prisma.listingTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
