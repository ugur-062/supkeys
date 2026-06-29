import { Injectable, NotFoundException } from "@nestjs/common";
import { CompanyAddressType, Prisma } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { UpsertAddressDto } from "./dto/company-address.dto";

@Injectable()
export class CompanyAddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.companyAddress.findMany({
      where: { companyId },
      orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(user: AuthenticatedCompanyUser, dto: UpsertAddressDto) {
    const type = dto.type as CompanyAddressType;
    const address = await this.prisma.$transaction(async (tx) => {
      const created = await tx.companyAddress.create({
        data: {
          companyId: user.companyId,
          type,
          title: dto.title.trim(),
          contactName: dto.contactName?.trim() || null,
          phone: dto.phone?.trim() || null,
          country: dto.country?.trim() || "TR",
          city: dto.city?.trim() || null,
          district: dto.district?.trim() || null,
          addressLine: dto.addressLine.trim(),
          postalCode: dto.postalCode?.trim() || null,
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (created.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, type, created.id);
      }
      return created;
    });
    return address;
  }

  async update(
    user: AuthenticatedCompanyUser,
    id: string,
    dto: UpsertAddressDto,
  ) {
    await this.requireOwn(user.companyId, id);
    const type = dto.type as CompanyAddressType;
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.companyAddress.update({
        where: { id },
        data: {
          type,
          title: dto.title.trim(),
          contactName: dto.contactName?.trim() || null,
          phone: dto.phone?.trim() || null,
          country: dto.country?.trim() || "TR",
          city: dto.city?.trim() || null,
          district: dto.district?.trim() || null,
          addressLine: dto.addressLine.trim(),
          postalCode: dto.postalCode?.trim() || null,
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (u.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, type, u.id);
      }
      return u;
    });
    return updated;
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    await this.requireOwn(user.companyId, id);
    await this.prisma.companyAddress.delete({ where: { id } });
    return { ok: true };
  }

  private async requireOwn(companyId: string, id: string) {
    const a = await this.prisma.companyAddress.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!a || a.companyId !== companyId) {
      throw new NotFoundException("Adres bulunamadı");
    }
    return a;
  }

  /** Aynı tipte diğer adreslerin varsayılanını kaldır (tek varsayılan). */
  private async clearOtherDefaults(
    tx: Prisma.TransactionClient,
    companyId: string,
    type: CompanyAddressType,
    keepId: string,
  ) {
    await tx.companyAddress.updateMany({
      where: { companyId, type, id: { not: keepId }, isDefault: true },
      data: { isDefault: false },
    });
  }
}
