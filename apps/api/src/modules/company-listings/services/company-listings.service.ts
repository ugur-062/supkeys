import { ForbiddenException, Injectable } from "@nestjs/common";
import { CompanyRole, ListingType, type ListingVisibility } from "@supkeys/db";
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

    const number = await this.nextListingNumber();
    const listing = await this.prisma.listing.create({
      data: {
        number,
        companyId: user.companyId,
        type,
        visibility: (dto.visibility as ListingVisibility) ?? "CONNECTIONS",
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        createdById: user.userId,
        status: "OPEN",
      },
    });
    return this.serialize(listing);
  }

  /**
   * Sistem-genelinde benzersiz ilan numarası — global Postgres sequence'tan
   * atomik (race-safe). ROT-NNNNNN; sıra büyüdükçe hane artar.
   */
  private async nextListingNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT nextval('listing_number_seq') AS n
    `;
    return `ROT-${String(rows[0].n).padStart(6, "0")}`;
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

  /**
   * Bana açık ilanlar (başka firmaların): PUBLIC + bağlantılı firmaların
   * CONNECTIONS ilanları. PUBLIC ilanı bağlı olmayan STANDART MASKELİ görür
   * (firma gizli, teklif veremez); premium tam görür.
   */
  async browse(user: AuthenticatedCompanyUser) {
    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const isPremium = user.tier === "PAKET";

    const rows = await this.prisma.listing.findMany({
      where: {
        status: "OPEN",
        companyId: { not: user.companyId },
        OR: [
          { visibility: "PUBLIC" },
          { visibility: "CONNECTIONS", companyId: { in: connectedIds } },
        ],
      },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return rows.map((l) => {
      const connected = connectedIds.includes(l.companyId);
      const masked = l.visibility === "PUBLIC" && !connected && !isPremium;
      const canBid = connected || (l.visibility === "PUBLIC" && isPremium);
      return {
        id: l.id,
        number: l.number,
        type: l.type,
        visibility: l.visibility,
        title: l.title,
        description: masked ? null : l.description,
        status: l.status,
        createdAt: l.createdAt,
        owner: masked ? null : { name: l.company.name },
        masked,
        canBid,
      };
    });
  }

  /** Aktif bağlantılı firma id'leri (her iki yön). */
  private async connectedCompanyIds(companyId: string): Promise<string[]> {
    // TODO(premium-düşüş): premium-origin bağlantılar standart düşünce
    // filtrelenecek (şimdilik tüm ACTIVE).
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId },
          { inviteeCompanyId: companyId },
        ],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    return rows.map((r) =>
      r.inviterCompanyId === companyId ? r.inviteeCompanyId : r.inviterCompanyId,
    );
  }

  private serialize(l: {
    id: string;
    number: string | null;
    type: ListingType;
    visibility: ListingVisibility;
    title: string;
    description: string | null;
    status: string;
    closesAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: l.id,
      number: l.number,
      type: l.type,
      visibility: l.visibility,
      title: l.title,
      description: l.description,
      status: l.status,
      closesAt: l.closesAt,
      createdAt: l.createdAt,
    };
  }
}
