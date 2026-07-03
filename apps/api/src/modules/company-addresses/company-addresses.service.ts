import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
    // AKTİF ilanda kullanılan adres silinemez — Listing.deliveryAddressId/
    // billingAddressId düz String (FK yok); silinirse açık ilan sarkan id'ye
    // işaret eder ve teklifçiler teslimat adresini göremez olurdu.
    const activeUse = await this.prisma.listing.count({
      where: {
        companyId: user.companyId,
        status: { in: ["DRAFT", "IN_APPROVAL", "OPEN", "CLOSED", "IN_AWARD_APPROVAL"] },
        OR: [{ deliveryAddressId: id }, { billingAddressId: id }],
      },
    });
    if (activeUse > 0) {
      throw new BadRequestException(
        `Bu adres ${activeUse} aktif ilanda kullanılıyor — önce ilanlardaki adresi değiştirin`,
      );
    }
    await this.prisma.$transaction([
      // Sonuçlanmış (AWARDED/iptal) ilanlardaki sarkan referansları temizle
      // (sipariş adresi zaten award anında snapshot'landı).
      this.prisma.listing.updateMany({
        where: { companyId: user.companyId, deliveryAddressId: id },
        data: { deliveryAddressId: null },
      }),
      this.prisma.listing.updateMany({
        where: { companyId: user.companyId, billingAddressId: id },
        data: { billingAddressId: null },
      }),
      // deleteMany + companyId: requireOwn sonrası TOCTOU penceresini kapatır.
      this.prisma.companyAddress.deleteMany({
        where: { id, companyId: user.companyId },
      }),
    ]);
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
