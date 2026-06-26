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
  type ListingDeliveryTerm,
  type ListingPaymentTerm,
  type ListingPaymentTiming,
  type ListingBidVisibility,
  type ListingDecrementType,
  type ListingDecrementBasis,
  type ListingQuestionAnswerType,
  Prisma,
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
          categoryIds: dto.categoryIds ?? [],
          keywords: dto.keywords ?? [],
          terms: dto.terms?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          requireAllItems: dto.requireAllItems ?? false,
          requireBidDocument: dto.requireBidDocument ?? false,
          primaryCurrency: (dto.primaryCurrency as Currency) ?? "TRY",
          allowedCurrencies: (dto.allowedCurrencies as Currency[]) ?? [],
          // ── Wizard zenginleştirme ──
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          isSealedBid: dto.isSealedBid ?? true,
          isLogistics: dto.isLogistics ?? false,
          logistics: dto.logistics
            ? (dto.logistics as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          deliveryTerm: (dto.deliveryTerm as ListingDeliveryTerm) ?? null,
          paymentTerm: (dto.paymentTerm as ListingPaymentTerm) ?? "CASH",
          paymentDays: dto.paymentDays ?? null,
          paymentTiming:
            (dto.paymentTiming as ListingPaymentTiming) ?? "AFTER_DELIVERY",
          bidVisibility:
            (dto.bidVisibility as ListingBidVisibility) ?? "OWN_ONLY",
          priceDecrementType:
            (dto.priceDecrementType as ListingDecrementType) ?? null,
          priceDecrementValue: dto.priceDecrementValue ?? null,
          priceDecrementBasis:
            (dto.priceDecrementBasis as ListingDecrementBasis) ?? null,
          decimalPlaces: dto.decimalPlaces ?? 2,
          sendClosingReminder: dto.sendClosingReminder ?? false,
          reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
          autoExtendOnLateBid: dto.autoExtendOnLateBid ?? false,
          autoExtendThresholdMin: dto.autoExtendThresholdMin ?? null,
          autoExtendByMinutes: dto.autoExtendByMinutes ?? null,
        },
      });
      if (dto.items?.length) {
        // Kalemleri tek tek oluştur (soru ekleyebilmek için id gerekiyor).
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i]!;
          const item = await tx.listingItem.create({
            data: {
              listingId: l.id,
              lineNo: i + 1,
              name: it.name.trim(),
              description: it.description?.trim() || null,
              quantity: it.quantity,
              unit: it.unit.trim(),
              targetPrice: it.targetPrice ?? null,
              materialCode: it.materialCode?.trim() || null,
              requiredByDate: it.requiredByDate
                ? new Date(it.requiredByDate)
                : null,
            },
          });
          if (it.questions?.length) {
            await tx.listingItemQuestion.createMany({
              data: it.questions.map((q) => ({
                itemId: item.id,
                text: q.text.trim(),
                answerType: q.answerType as ListingQuestionAnswerType,
                required: q.required ?? false,
              })),
            });
          }
        }
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
   * Firmanın başka firmaların ilanlarına verdiği TÜM teklifler — Tekliflerim
   * ekranı. İlan özeti (başlık/no/tür/durum/kapanış) ile birlikte döner.
   */
  async listMyBids(companyId: string) {
    const bids = await this.prisma.listingBid.findMany({
      where: { bidderCompanyId: companyId },
      include: {
        listing: {
          select: {
            id: true,
            number: true,
            title: true,
            type: true,
            status: true,
            closesAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return bids.map((b) => ({
      id: b.id,
      amount: b.amount.toString(),
      currency: b.currency,
      status: b.status,
      round: b.round,
      isBuyNow: b.isBuyNow,
      createdAt: b.createdAt,
      listing: {
        id: b.listing.id,
        number: b.listing.number,
        title: b.listing.title,
        type: b.listing.type,
        status: b.listing.status,
        closesAt: b.listing.closesAt,
      },
    }));
  }

  /**
   * İhalelerim listesi (ALIM) — zengin: açan kişi + davetli/teklif sayısı +
   * kategoriler. Eski tenders-table'ın ihtiyaç duyduğu alanlar. Filtre/sıralama
   * frontend'de (client-side) yapılır.
   */
  async listTenders(companyId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { companyId, type: "ALIM" },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        format: true,
        status: true,
        categoryIds: true,
        createdById: true,
        createdAt: true,
        closesAt: true,
        _count: { select: { invitations: true, bids: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const users = await this.prisma.companyUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const umap = new Map(users.map((u) => [u.id, u]));

    return rows.map((r) => {
      const u = umap.get(r.createdById);
      return {
        id: r.id,
        tenderNumber: r.number ?? "—",
        title: r.title,
        type: r.type,
        format: r.format,
        status: r.status,
        categoryIds: r.categoryIds,
        createdById: r.createdById,
        createdBy: {
          firstName: u?.firstName ?? "—",
          lastName: u?.lastName ?? "",
        },
        invitationCount: r._count.invitations,
        bidCount: r._count.bids,
        publishedAt: r.createdAt,
        bidsCloseAt: r.closesAt,
        createdAt: r.createdAt,
      };
    });
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
      | {
          isEnglishAuction: true;
          currentBest: string | null;
          bidCount: number;
          currentRound: number;
        }
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
        currentRound: listing.currentRound,
      };
    }

    const isOwner = listing.companyId === user.companyId;
    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";

    // Kalemler (herkese görünür — teklif vermek için gerekli).
    const items = await this.prisma.listingItem.findMany({
      where: { listingId: id },
      orderBy: { lineNo: "asc" },
    });
    const itemsOut = items.map((it) => ({
      id: it.id,
      lineNo: it.lineNo,
      name: it.name,
      description: it.description,
      quantity: it.quantity.toString(),
      unit: it.unit,
      targetPrice: it.targetPrice?.toString() ?? null,
    }));

    if (isOwner) {
      const bids = await this.prisma.listingBid.findMany({
        where: { listingId: id, status: { in: ["SUBMITTED", "WON", "LOST"] } },
        include: {
          bidderCompany: { select: { name: true } },
          items: true,
        },
      });
      bids.sort((a, b) =>
        listing.type === "ALIM"
          ? Number(a.amount) - Number(b.amount) // ALIM: düşük iyi
          : Number(b.amount) - Number(a.amount), // SATIS: yüksek iyi
      );
      const invitations = await this.prisma.listingInvitation.findMany({
        where: { listingId: id },
        include: {
          invitedCompany: { select: { name: true, supkeysId: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return {
        ...this.detail(listing, false),
        isOwner: true,
        english,
        internalNotes: listing.internalNotes,
        items: itemsOut,
        invitations: invitations.map((iv) => ({
          companyName: iv.invitedCompany.name,
          supkeysId: iv.invitedCompany.supkeysId,
          createdAt: iv.createdAt,
        })),
        bids: bids.map((b) => ({
          id: b.id,
          bidderName: b.bidderCompany.name,
          amount: b.amount.toString(),
          currency: b.currency,
          note: b.note,
          isBuyNow: b.isBuyNow,
          status: b.status,
          round: b.round,
          createdAt: b.createdAt,
          items: b.items.map((bi) => ({
            itemId: bi.itemId,
            unitPrice: bi.unitPrice.toString(),
          })),
        })),
      };
    }

    const isInvited =
      listing.visibility === "PRIVATE"
        ? (await this.prisma.listingInvitation.count({
            where: { listingId: id, invitedCompanyId: user.companyId },
          })) > 0
        : false;
    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PRIVATE" && isInvited);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    const masked = listing.visibility === "PUBLIC" && !connected && !isPremium;
    const canBid =
      (listing.visibility === "PRIVATE" && isInvited) ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PUBLIC" && (connected || isPremium));
    const myBid = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId: id,
          bidderCompanyId: user.companyId,
        },
      },
      include: { items: true },
    });
    return {
      ...this.detail(listing, masked),
      isOwner: false,
      masked,
      canBid,
      english,
      items: masked ? [] : itemsOut,
      myBid: myBid
        ? {
            amount: myBid.amount.toString(),
            note: myBid.note,
            status: myBid.status,
            items: myBid.items.map((bi) => ({
              itemId: bi.itemId,
              unitPrice: bi.unitPrice.toString(),
            })),
          }
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
        requireAllItems: true,
        currentRound: true,
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
    const isInvited =
      listing.visibility === "PRIVATE"
        ? (await this.prisma.listingInvitation.count({
            where: { listingId: id, invitedCompanyId: user.companyId },
          })) > 0
        : false;
    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PRIVATE" && isInvited);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    const canBid =
      (listing.visibility === "PRIVATE" && isInvited) ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PUBLIC" && (connected || isPremium));
    if (!canBid) {
      throw new ForbiddenException(
        listing.visibility === "PRIVATE"
          ? "Bu özel ihaleye yalnızca davetli firmalar teklif verebilir"
          : "Bu ilana teklif vermek için premium üyelik gerekir",
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

    // Kalem-bazlı vs tek-tutar teklif. İhalede kalem varsa kalem teklifi zorunlu;
    // toplam = Σ(birim fiyat × kalem miktarı).
    const listingItems = await this.prisma.listingItem.findMany({
      where: { listingId: id },
      select: { id: true, quantity: true },
    });

    let amount: number;
    let bidItemsData: { itemId: string; unitPrice: number }[] = [];

    if (listingItems.length > 0) {
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException(
          "Bu ihale kalem-bazlı; en az bir kaleme birim fiyat girin",
        );
      }
      const qtyById = new Map(
        listingItems.map((i) => [i.id, Number(i.quantity)]),
      );
      const provided = dto.items.filter((bi) => qtyById.has(bi.itemId));
      if (provided.length === 0) {
        throw new BadRequestException("Geçerli kalem teklifi yok");
      }
      if (
        listing.requireAllItems &&
        provided.length < listingItems.length
      ) {
        throw new BadRequestException(
          "Bu ihalede tüm kalemlere teklif vermelisiniz",
        );
      }
      amount = provided.reduce(
        (sum, bi) => sum + bi.unitPrice * (qtyById.get(bi.itemId) ?? 0),
        0,
      );
      bidItemsData = provided.map((bi) => ({
        itemId: bi.itemId,
        unitPrice: bi.unitPrice,
      }));
    } else {
      if (dto.amount == null || dto.amount <= 0) {
        throw new BadRequestException("Geçerli bir tutar girin");
      }
      amount = dto.amount;
    }

    // İngiliz Usulü (açık eksiltme): yeni teklif mevcut en düşüğün ALTINDA olmalı.
    if (listing.format === "ENGLISH_AUCTION") {
      const agg = await this.prisma.listingBid.aggregate({
        where: { listingId: id, status: "SUBMITTED" },
        _min: { amount: true },
      });
      const min = agg._min.amount;
      if (min !== null && amount >= Number(min)) {
        throw new BadRequestException(
          `İngiliz usulü: teklifin mevcut en düşük ${Number(min).toLocaleString("tr-TR")} ₺'nin altında olmalı`,
        );
      }
    }

    const bid = await this.prisma.$transaction(async (tx) => {
      const b = await tx.listingBid.upsert({
        where: {
          listingId_bidderCompanyId: {
            listingId: id,
            bidderCompanyId: user.companyId,
          },
        },
        create: {
          listingId: id,
          bidderCompanyId: user.companyId,
          amount,
          note: dto.note?.trim() || null,
          createdById: user.userId,
          status: "SUBMITTED",
          round: listing.currentRound,
        },
        update: {
          amount,
          note: dto.note?.trim() || null,
          status: "SUBMITTED",
          round: listing.currentRound,
        },
      });
      if (listingItems.length > 0) {
        // Kalem tekliflerini yenile (eskileri sil → yeniden yaz).
        await tx.listingBidItem.deleteMany({ where: { bidId: b.id } });
        await tx.listingBidItem.createMany({
          data: bidItemsData.map((bi) => ({
            bidId: b.id,
            itemId: bi.itemId,
            unitPrice: bi.unitPrice,
          })),
        });
      }
      return b;
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
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        requireBidDocument: true,
      },
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
        items: { select: { itemId: true, unitPrice: true } },
      },
    });
    if (!bid || bid.listingId !== listingId || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geçersiz teklif");
    }

    if (listing.requireBidDocument) {
      const docCount = await this.prisma.listingBidDocument.count({
        where: { bidId },
      });
      if (docCount === 0) {
        throw new BadRequestException(
          "Bu ihale teklif belgesi zorunlu kılıyor; kazanan teklifin belgesi yok",
        );
      }
    }

    // Sipariş kalemleri snapshot (ilanda kalem varsa, kazanan teklifin fiyatları).
    const listingItems = await this.prisma.listingItem.findMany({
      where: { listingId },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    const orderItems = listingItems
      .map((li) => {
        const bi = bid.items.find((x) => x.itemId === li.id);
        return bi
          ? {
              name: li.name,
              quantity: li.quantity,
              unit: li.unit,
              unitPrice: bi.unitPrice,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

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
      const o = await tx.companyOrder.create({
        data: {
          number,
          listingId,
          sellerCompanyId,
          buyerCompanyId,
          amount: bid.amount,
          status: "CREATED",
        },
      });
      if (orderItems.length > 0) {
        await tx.companyOrderItem.createMany({
          data: orderItems.map((it) => ({ orderId: o.id, ...it })),
        });
      }
      return o;
    });
    return { orderId: order.id, number: order.number };
  }

  /**
   * Kalem-bazlı kazandırma — her kalem ayrı teklife verilir; kazanan tedarikçi
   * başına bir sipariş oluşur. Yalnızca ALIM + kalemli ihale.
   */
  async awardByItem(
    user: AuthenticatedCompanyUser,
    listingId: string,
    itemAwards: { itemId: string; bidId: string }[],
  ) {
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
    if (listing.type !== "ALIM") {
      throw new BadRequestException(
        "Kalem-bazlı kazandırma yalnızca alım ihalelerinde",
      );
    }
    if (!user.roles.includes(CompanyRole.SATIN_ALMACI)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    const items = await this.prisma.listingItem.findMany({
      where: { listingId },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    if (items.length === 0) {
      throw new BadRequestException("Bu ihalede kalem yok");
    }
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const awardedItemIds = new Set(itemAwards.map((a) => a.itemId));
    if (items.some((it) => !awardedItemIds.has(it.id))) {
      throw new BadRequestException("Her kalem için kazanan teklif seçin");
    }

    const bidIds = [...new Set(itemAwards.map((a) => a.bidId))];
    const bids = await this.prisma.listingBid.findMany({
      where: { id: { in: bidIds }, listingId, status: "SUBMITTED" },
      select: {
        id: true,
        bidderCompanyId: true,
        items: { select: { itemId: true, unitPrice: true } },
      },
    });
    const bidMap = new Map(bids.map((b) => [b.id, b]));

    // Kazanan firma başına grupla (firma → sipariş kalemleri + tutar + bidId'ler).
    const groups = new Map<
      string,
      {
        orderItems: {
          name: string;
          quantity: (typeof items)[number]["quantity"];
          unit: string;
          unitPrice: (typeof bids)[number]["items"][number]["unitPrice"];
        }[];
        amount: number;
        bidIds: Set<string>;
      }
    >();
    for (const a of itemAwards) {
      const bid = bidMap.get(a.bidId);
      const li = itemMap.get(a.itemId);
      if (!bid || !li) throw new BadRequestException("Geçersiz kalem/teklif");
      const bi = bid.items.find((x) => x.itemId === a.itemId);
      if (!bi) {
        throw new BadRequestException(
          `Seçilen teklifin "${li.name}" kalemi için fiyatı yok`,
        );
      }
      let g = groups.get(bid.bidderCompanyId);
      if (!g) {
        g = { orderItems: [], amount: 0, bidIds: new Set() };
        groups.set(bid.bidderCompanyId, g);
      }
      g.bidIds.add(bid.id);
      g.orderItems.push({
        name: li.name,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: bi.unitPrice,
      });
      g.amount += Number(bi.unitPrice) * Number(li.quantity);
    }

    // Sipariş numaralarını tx öncesi üret (sequence non-transactional).
    const groupArr = [...groups.entries()];
    const numbers: string[] = [];
    for (let i = 0; i < groupArr.length; i++) {
      numbers.push(await this.nextOrderNumber());
    }
    const winningBidIds = [...new Set(itemAwards.map((a) => a.bidId))];

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { status: "AWARDED" },
      });
      await tx.listingBid.updateMany({
        where: { listingId, id: { in: winningBidIds }, status: "SUBMITTED" },
        data: { status: "WON" },
      });
      await tx.listingBid.updateMany({
        where: { listingId, id: { notIn: winningBidIds }, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
      const orders: { id: string; number: string | null }[] = [];
      for (let i = 0; i < groupArr.length; i++) {
        const [sellerCompanyId, g] = groupArr[i]!;
        const o = await tx.companyOrder.create({
          data: {
            number: numbers[i],
            listingId,
            sellerCompanyId,
            buyerCompanyId: listing.companyId,
            amount: g.amount,
            status: "CREATED",
            items: {
              create: g.orderItems.map((it) => ({
                name: it.name,
                quantity: it.quantity,
                unit: it.unit,
                unitPrice: it.unitPrice,
              })),
            },
          },
        });
        orders.push({ id: o.id, number: o.number });
      }
      return orders;
    });
    return { orders: created, count: created.length };
  }

  /**
   * Yeni tur — İngiliz Usulü eksiltmede ilan sahibi turu ilerletir. Tedarikçiler
   * yeni turda daha düşük teklif verir; teklifler turla damgalanır.
   */
  async startNewRound(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, format: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi yeni tur başlatabilir");
    }
    if (listing.format !== "ENGLISH_AUCTION") {
      throw new BadRequestException("Yeni tur yalnızca İngiliz Usulü eksiltmede");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan teklife kapalı");
    }
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { currentRound: { increment: 1 } },
      select: { currentRound: true },
    });
    return { currentRound: updated.currentRound };
  }

  /**
   * Eleme — ilan sahibi tek bir SUBMITTED teklifi LOST yapar (kazandırmadan).
   * Elenen tedarikçi yeniden teklif verebilir (placeBid SUBMITTED'a döndürür).
   */
  async eliminate(
    user: AuthenticatedCompanyUser,
    listingId: string,
    bidId: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi eleme yapabilir");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan teklife kapalı");
    }
    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: { id: true, listingId: true, status: true },
    });
    if (!bid || bid.listingId !== listingId || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geçersiz teklif");
    }
    await this.prisma.listingBid.update({
      where: { id: bidId },
      data: { status: "LOST" },
    });
    return { ok: true };
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
      categoryIds: string[];
      keywords: string[];
      terms: string | null;
      requireAllItems: boolean;
      requireBidDocument: boolean;
      primaryCurrency: Currency;
      allowedCurrencies: Currency[];
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
      categoryIds: l.categoryIds,
      keywords: l.keywords,
      terms: masked ? null : l.terms,
      requireAllItems: l.requireAllItems,
      requireBidDocument: l.requireBidDocument,
      primaryCurrency: l.primaryCurrency,
      allowedCurrencies: l.allowedCurrencies,
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
