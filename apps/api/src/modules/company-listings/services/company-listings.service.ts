import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CompanyRole,
  type Currency,
  ListingType,
  type ListingFormat,
  type ListingVisibility,
} from "@supkeys/db";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CreateListingDto } from "../dto/create-listing.dto";
import { PlaceBidDto } from "../dto/place-bid.dto";

@Injectable()
export class CompanyListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: CompanyBlocksService,
  ) {}

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

    // Tipe göre format / fiyat doğrulama.
    let format: ListingFormat | null = null;
    let minPrice: number | null = null;
    let buyNowPrice: number | null = null;

    if (type === "ALIM") {
      if (!dto.format) {
        throw new BadRequestException("Alım ilanı için format seçin (RFQ / İngiliz Usulü)");
      }
      format = dto.format as ListingFormat;
    } else {
      // SATIS: taban fiyat zorunlu, hemen-al opsiyonel (≥ taban).
      if (!dto.minPrice || dto.minPrice <= 0) {
        throw new BadRequestException("Satış ilanı için taban fiyat girin");
      }
      minPrice = dto.minPrice;
      if (dto.buyNowPrice != null) {
        if (dto.buyNowPrice < dto.minPrice) {
          throw new BadRequestException(
            "Hemen-al fiyatı taban fiyattan düşük olamaz",
          );
        }
        buyNowPrice = dto.buyNowPrice;
      }
    }

    const number = await this.nextListingNumber();

    // Davet edilecek firmaları çöz: supkeysId → companyId, bağlı olmalı.
    let inviteCompanyIds: string[] = [];
    if (dto.invitations?.length) {
      const connectedIds = await this.connectedCompanyIds(user.companyId);
      const codes = dto.invitations
        .map((c) => normalizeShortCode(c))
        .filter((c) => validateShortCode(c));
      const targets = await this.prisma.company.findMany({
        where: { supkeysId: { in: codes } },
        select: { id: true },
      });
      inviteCompanyIds = targets
        .map((t) => t.id)
        .filter((id) => id !== user.companyId && connectedIds.includes(id));
    }

    const listing = await this.prisma.$transaction(async (tx) => {
      const l = await tx.listing.create({
        data: {
          number,
          companyId: user.companyId,
          type,
          isInternational: dto.isInternational ?? false,
          format,
          minPrice,
          buyNowPrice,
          visibility: (dto.visibility as ListingVisibility) ?? "CONNECTIONS",
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
          createdById: user.userId,
          status: "OPEN",
          keywords: dto.keywords ?? [],
          terms: dto.terms?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          requireAllItems: dto.requireAllItems ?? false,
          requireBidDocument: dto.requireBidDocument ?? false,
          primaryCurrency: (dto.primaryCurrency as Currency) ?? "TRY",
          allowedCurrencies: (dto.allowedCurrencies as Currency[]) ?? [],
        },
      });
      if (dto.items?.length) {
        await tx.listingItem.createMany({
          data: dto.items.map((it, i) => ({
            listingId: l.id,
            lineNo: i + 1,
            name: it.name.trim(),
            description: it.description?.trim() || null,
            quantity: it.quantity,
            unit: it.unit.trim(),
            targetPrice: it.targetPrice ?? null,
          })),
        });
      }
      if (inviteCompanyIds.length) {
        await tx.listingInvitation.createMany({
          data: inviteCompanyIds.map((cid) => ({
            listingId: l.id,
            invitedCompanyId: cid,
            invitedById: user.userId,
          })),
          skipDuplicates: true,
        });
      }
      return l;
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
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    const isPremium = user.tier === "PAKET";

    const rows = await this.prisma.listing.findMany({
      where: {
        status: "OPEN",
        companyId: { notIn: [user.companyId, ...blockedIds] },
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

    // İngiliz Usulü açık eksiltme: güncel en düşük teklif herkese görünür.
    let english:
      | { isEnglishAuction: true; currentBest: string | null; bidCount: number }
      | null = null;
    if (listing.format === "ENGLISH_AUCTION") {
      const agg = await this.prisma.listingBid.aggregate({
        where: { listingId: id, status: "SUBMITTED" },
        _min: { amount: true },
        _count: true,
      });
      english = {
        isEnglishAuction: true,
        currentBest: agg._min.amount ? agg._min.amount.toString() : null,
        bidCount: agg._count,
      };
    }

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
        english,
        bids: bids.map((b) => ({
          id: b.id,
          bidderName: b.bidderCompany.name,
          amount: b.amount.toString(),
          note: b.note,
          isBuyNow: b.isBuyNow,
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
      english,
      myBid: myBid
        ? { amount: myBid.amount.toString(), note: myBid.note, status: myBid.status }
        : null,
    };
  }

  /** Görülebilen bir ilana teklif ver/güncelle (firma başına tek teklif). */
  async placeBid(user: AuthenticatedCompanyUser, id: string, dto: PlaceBidDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        type: true,
        format: true,
        visibility: true,
        status: true,
      },
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

    // İngiliz Usulü (açık eksiltme): yeni teklif mevcut en düşüğün ALTINDA olmalı.
    if (listing.format === "ENGLISH_AUCTION") {
      const agg = await this.prisma.listingBid.aggregate({
        where: { listingId: id, status: "SUBMITTED" },
        _min: { amount: true },
      });
      const min = agg._min.amount;
      if (min !== null && Number(dto.amount) >= Number(min)) {
        throw new BadRequestException(
          `İngiliz usulü: teklifin mevcut en düşük ${Number(min).toLocaleString("tr-TR")} ₺'nin altında olmalı`,
        );
      }
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

  /**
   * Hemen-Al — SATIS ilanında tavan (buyNow) fiyattan teklif oluşturur.
   * DİREKT SİPARİŞ DEĞİL: sahip yine onaylar (kazandırır). isBuyNow=true bayraklı.
   */
  async buyNow(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        visibility: true,
        status: true,
        buyNowPrice: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.type !== "SATIS" || !listing.buyNowPrice) {
      throw new BadRequestException("Bu ilanda hemen-al seçeneği yok");
    }
    if (listing.companyId === user.companyId) {
      throw new BadRequestException("Kendi ilanınız");
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
      throw new ForbiddenException("Bu ilana teklif için premium gerekir");
    }
    if (!user.roles.includes(CompanyRole.SATIN_ALMACI)) {
      throw new ForbiddenException("Hemen-Al için Satın Almacı rolü gerekir");
    }

    const bid = await this.prisma.listingBid.upsert({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      create: {
        listingId,
        bidderCompanyId: user.companyId,
        amount: listing.buyNowPrice,
        isBuyNow: true,
        createdById: user.userId,
        status: "SUBMITTED",
      },
      update: {
        amount: listing.buyNowPrice,
        isBuyNow: true,
        status: "SUBMITTED",
      },
    });
    return { id: bid.id, amount: bid.amount.toString(), isBuyNow: true };
  }

  /**
   * Kazandır — ilan sahibi bir teklifi seçer → Sipariş oluşur (satıcı→alıcı
   * normalleşir), ilan AWARDED, kazanan WON, diğerleri LOST.
   * ALIM ilanı: satıcı=kazanan teklifçi, alıcı=ilan sahibi.
   * SATIS ilanı: satıcı=ilan sahibi, alıcı=kazanan teklifçi.
   */
  async award(user: AuthenticatedCompanyUser, listingId: string, bidId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, type: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan zaten kapalı veya kazandırılmış");
    }
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        listingId: true,
        bidderCompanyId: true,
        amount: true,
        status: true,
      },
    });
    if (!bid || bid.listingId !== listingId || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geçersiz teklif");
    }

    const sellerCompanyId =
      listing.type === "ALIM" ? bid.bidderCompanyId : listing.companyId;
    const buyerCompanyId =
      listing.type === "ALIM" ? listing.companyId : bid.bidderCompanyId;

    const number = await this.nextOrderNumber();
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { status: "AWARDED" },
      });
      await tx.listingBid.update({
        where: { id: bidId },
        data: { status: "WON" },
      });
      await tx.listingBid.updateMany({
        where: { listingId, id: { not: bidId }, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
      return tx.companyOrder.create({
        data: {
          number,
          listingId,
          sellerCompanyId,
          buyerCompanyId,
          amount: bid.amount,
          status: "CREATED",
        },
      });
    });
    return { orderId: order.id, number: order.number };
  }

  /** İlan sahibi açık ilanı iptal eder (kazandırmadan kapatır). */
  async cancel(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi iptal edebilir");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("Sadece açık ilan iptal edilebilir");
    }
    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listingId },
        data: { status: "CANCELLED" },
      }),
      this.prisma.listingBid.updateMany({
        where: { listingId, status: "SUBMITTED" },
        data: { status: "LOST" },
      }),
    ]);
    return { ok: true };
  }

  /** Teklif veren kendi teklifini geri çeker. */
  async withdrawBid(user: AuthenticatedCompanyUser, listingId: string) {
    const bid = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      select: { id: true, status: true },
    });
    if (!bid || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geri çekilebilir teklif yok");
    }
    await this.prisma.listingBid.update({
      where: { id: bid.id },
      data: { status: "WITHDRAWN" },
    });
    return { ok: true };
  }

  private async nextOrderNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT nextval('order_number_seq') AS n
    `;
    return `ROT-ORD-${String(rows[0].n).padStart(6, "0")}`;
  }

  private detail(
    l: {
      id: string;
      number: string | null;
      type: ListingType;
      isInternational: boolean;
      format: ListingFormat | null;
      minPrice: { toString(): string } | null;
      buyNowPrice: { toString(): string } | null;
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
      isInternational: l.isInternational,
      format: l.format,
      minPrice: l.minPrice?.toString() ?? null,
      buyNowPrice: l.buyNowPrice?.toString() ?? null,
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
    isInternational: boolean;
    format: ListingFormat | null;
    minPrice: { toString(): string } | null;
    buyNowPrice: { toString(): string } | null;
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
      isInternational: l.isInternational,
      format: l.format,
      minPrice: l.minPrice?.toString() ?? null,
      buyNowPrice: l.buyNowPrice?.toString() ?? null,
      visibility: l.visibility,
      title: l.title,
      description: l.description,
      status: l.status,
      closesAt: l.closesAt,
      createdAt: l.createdAt,
    };
  }
}
