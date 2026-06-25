import { ForbiddenException, Injectable } from "@nestjs/common";
import { CompanyRole, ListingType } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CreateListingDto } from "../dto/create-listing.dto";

@Injectable()
export class CompanyListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * İlan oluştur. Rol-korumalı: ALIM → SATIN_ALMACI, SATIS → SATISCI.
   * TODO(tier): ilan açmak PAKET üyelik gerektirecek (upgrade akışı gelince).
   */
  async create(user: AuthenticatedCompanyUser, dto: CreateListingDto) {
    const type = dto.type as ListingType;
    const neededRole =
      type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;

    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException(
        type === "ALIM"
          ? "Alım ilanı açmak için Satın Almacı rolü gerekir"
          : "Satış ilanı açmak için Satışçı rolü gerekir",
      );
    }

    const listing = await this.prisma.listing.create({
      data: {
        companyId: user.companyId,
        type,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        createdById: user.userId,
        status: "OPEN",
      },
    });
    return this.serialize(listing);
  }

  /** Firmanın kendi ilanları (açtıkları). */
  async listMine(companyId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => this.serialize(r));
  }

  private serialize(l: {
    id: string;
    type: ListingType;
    title: string;
    description: string | null;
    status: string;
    closesAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: l.id,
      type: l.type,
      title: l.title,
      description: l.description,
      status: l.status,
      closesAt: l.closesAt,
      createdAt: l.createdAt,
    };
  }
}
