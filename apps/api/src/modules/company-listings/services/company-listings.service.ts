import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CompanyRole, ListingType, type ListingVisibility } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CreateListingDto } from "../dto/create-listing.dto";
import { PlaceBidDto } from "../dto/place-bid.dto";

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

  /**
   * İlan detayı. Sahip → ilan + gelen TÜM teklifler (sıralı). Sahip değil →
   * görünürlük kontrolü (yoksa 404), maskeleme + kendi teklifi (myBid) + canBid.
   * Kapalı zarf: sahip olmayan başkalarının tekliflerini GÖREMEZ.
   */
  async getOne(user: AuthenticatedCompanyUser, id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { company: { select: { name: true } } },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");

    const isOwner = listing.companyId === user.companyId;
    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";

    if (isOwner) {
      const bids = await this.prisma.listingBid.findMany({
        where: { listingId: id, status: { in: ["SUBMITTED", "WON", "LOST"] } },
        include: { bidderCompany: { select: { name: true } } },
      });
      bids.sort((a, b) =>
        listing.type === "ALIM"
          ? Number(a.amount) - Number(b.amount) // ALIM: düşük iyi
          : Number(b.amount) - Number(a.amount), // SATIS: yüksek iyi
      );
      return {
        ...this.detail(listing, false),
        isOwner: true,
        bids: bids.map((b) => ({
          id: b.id,
          bidderName: b.bidderCompany.name,
          amount: b.amount.toString(),
          note: b.note,
          status: b.status,
          createdAt: b.createdAt,
        })),
      };
    }

    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    const masked = listing.visibility === "PUBLIC" && !connected && !isPremium;
    const canBid =
      connected || (listing.visibility === "PUBLIC" && isPremium);
    const myBid = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId: id,
          bidderCompanyId: user.companyId,
        },
      },
    });
    return {
      ...this.detail(listing, masked),
      isOwner: false,
      masked,
      canBid,
      myBid: myBid
        ? { amount: myBid.amount.toString(), note: myBid.note, status: myBid.status }
        : null,
    };
  }

  /** Görülebilen bir ilana teklif ver/güncelle (firma başına tek teklif). */
  async placeBid(user: AuthenticatedCompanyUser, id: string, dto: PlaceBidDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, companyId: true, type: true, visibility: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId === user.companyId) {
      throw new BadRequestException("Kendi ilanınıza teklif veremezsiniz");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan teklife kapalı");
    }

    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";
    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    const canBid =
      connected || (listing.visibility === "PUBLIC" && isPremium);
    if (!canBid) {
      throw new ForbiddenException(
        "Bu ilana teklif vermek için premium üyelik gerekir",
      );
    }

    // Rol (işleme göre): ALIM ilanı → teklifçi SATAR → Satışçı; SATIS → ALIR → Satın Almacı.
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException(
        listing.type === "ALIM"
          ? "Alım ilanına teklif (satış) için Satışçı rolü gerekir"
          : "Satış ilanına teklif (alım) için Satın Almacı rolü gerekir",
      );
    }

    const bid = await this.prisma.listingBid.upsert({
      where: {
        listingId_bidderCompanyId: {
          listingId: id,
          bidderCompanyId: user.companyId,
        },
      },
      create: {
        listingId: id,
        bidderCompanyId: user.companyId,
        amount: dto.amount,
        note: dto.note?.trim() || null,
        createdById: user.userId,
        status: "SUBMITTED",
      },
      update: {
        amount: dto.amount,
        note: dto.note?.trim() || null,
        status: "SUBMITTED",
      },
    });
    return { id: bid.id, amount: bid.amount.toString(), status: bid.status };
  }

  private detail(
    l: {
      id: string;
      number: string | null;
      type: ListingType;
      visibility: ListingVisibility;
      title: string;
      description: string | null;
      status: string;
      closesAt: Date | null;
      createdAt: Date;
      company: { name: string };
    },
    masked: boolean,
  ) {
    return {
      id: l.id,
      number: l.number,
      type: l.type,
      visibility: l.visibility,
      title: l.title,
      description: masked ? null : l.description,
      status: l.status,
      closesAt: l.closesAt,
      createdAt: l.createdAt,
      owner: masked ? null : { name: l.company.name },
    };
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
