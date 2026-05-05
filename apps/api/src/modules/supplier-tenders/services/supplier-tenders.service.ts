import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, TenderStatus } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreateOrUpdateBidDto } from "../dto/bid.dto";
import {
  ListSupplierTendersDto,
  SupplierTenderFilter,
} from "../dto/list-tenders.dto";

const ACTIVE_STATUSES: TenderStatus[] = ["OPEN_FOR_BIDS", "IN_AWARD"];
const PAST_STATUSES: TenderStatus[] = [
  "AWARDED",
  "CANCELLED",
  "CLOSED_NO_AWARD",
];
// Tedarikçi ASLA DRAFT'taki ihaleleri görmemeli — yayınlanmamış kayıtlar gizli
const VISIBLE_STATUSES: TenderStatus[] = [
  "OPEN_FOR_BIDS",
  "IN_AWARD",
  "AWARDED",
  "CANCELLED",
  "CLOSED_NO_AWARD",
];

@Injectable()
export class SupplierTendersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(supplierId: string, query: ListSupplierTendersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const filter = query.filter ?? SupplierTenderFilter.ALL;

    let statuses: TenderStatus[];
    if (filter === SupplierTenderFilter.ACTIVE) statuses = ACTIVE_STATUSES;
    else if (filter === SupplierTenderFilter.PAST) statuses = PAST_STATUSES;
    else statuses = VISIBLE_STATUSES;

    const where: Prisma.TenderWhereInput = {
      status: { in: statuses },
      // Sadece bu tedarikçinin TenderInvitation'a sahip olduğu kayıtlar
      invitations: { some: { supplierId } },
    };
    if (query.search) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { tenderNumber: { contains: term, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tender.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ bidsCloseAt: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          status: true,
          primaryCurrency: true,
          bidsCloseAt: true,
          publishedAt: true,
          tenant: { select: { name: true } },
          _count: { select: { items: true } },
          invitations: {
            where: { supplierId },
            select: { status: true },
            take: 1,
          },
          bids: {
            where: { supplierId },
            select: { status: true, version: true },
            take: 1,
          },
        },
      }),
      this.prisma.tender.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        tenderNumber: t.tenderNumber,
        title: t.title,
        status: t.status,
        primaryCurrency: t.primaryCurrency,
        bidsCloseAt: t.bidsCloseAt,
        publishedAt: t.publishedAt,
        tenant: t.tenant,
        itemCount: t._count.items,
        invitationStatus: t.invitations[0]?.status ?? null,
        myBidStatus: t.bids[0]?.status ?? null,
        myBidVersion: t.bids[0]?.version ?? null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(supplierId: string, id: string) {
    // Önce davet kontrolü (yetki) — DRAFT olan kayıtları da bu kontrolün
    // dışında 404 olarak gösteriyoruz; tedarikçi için "yok" gibi.
    const tender = await this.prisma.tender.findFirst({
      where: {
        id,
        status: { in: VISIBLE_STATUSES },
      },
      include: {
        tenant: { select: { id: true, name: true } },
        items: { orderBy: { orderIndex: "asc" } },
        attachments: { orderBy: { uploadedAt: "asc" } },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");

    // Davet kontrolü
    const invitation = await this.prisma.tenderInvitation.findUnique({
      where: { tenderId_supplierId: { tenderId: tender.id, supplierId } },
      select: { status: true, invitedAt: true },
    });
    if (!invitation) {
      // Davet edilmediyse 404 — varlığını sızdırmamak adına Forbidden yerine
      // NotFound dönüyoruz
      throw new NotFoundException("İhale bulunamadı");
    }

    // KAPALI ZARF: bu tedarikçinin kendi teklifi (varsa) gösterilebilir;
    // başka tedarikçilerin davet veya tekliflerini ASLA döndürmüyoruz
    const myBid = await this.prisma.bid.findUnique({
      where: { tenderId_supplierId: { tenderId: tender.id, supplierId } },
      select: {
        id: true,
        status: true,
        currency: true,
        totalAmount: true,
        version: true,
        submittedAt: true,
        notes: true,
      },
    });

    return {
      id: tender.id,
      tenderNumber: tender.tenderNumber,
      type: tender.type,
      status: tender.status,
      title: tender.title,
      description: tender.description,
      termsAndConditions: tender.termsAndConditions,
      isSealedBid: tender.isSealedBid,
      requireAllItems: tender.requireAllItems,
      requireBidDocument: tender.requireBidDocument,
      primaryCurrency: tender.primaryCurrency,
      allowedCurrencies: tender.allowedCurrencies,
      decimalPlaces: tender.decimalPlaces,
      deliveryTerm: tender.deliveryTerm,
      deliveryAddress: tender.deliveryAddress,
      paymentTerm: tender.paymentTerm,
      paymentDays: tender.paymentDays,
      publishedAt: tender.publishedAt,
      bidsOpenAt: tender.bidsOpenAt,
      bidsCloseAt: tender.bidsCloseAt,
      awardedAt: tender.awardedAt,
      cancelledAt: tender.cancelledAt,
      tenant: tender.tenant,
      items: tender.items,
      attachments: tender.attachments,
      myInvitation: invitation,
      myBid,
    };
  }

  async stats(supplierId: string) {
    const [activeInvitations, submittedBids, wonBidsAgg, ongoingOrders] =
      await Promise.all([
        // Aktif ihalelere yapılan davetler (PENDING/ACCEPTED + tender açık)
        this.prisma.tenderInvitation.count({
          where: {
            supplierId,
            status: { in: ["PENDING", "ACCEPTED"] },
            tender: { status: { in: ACTIVE_STATUSES } },
          },
        }),
        this.prisma.bid.count({
          where: { supplierId, status: "SUBMITTED" },
        }),
        this.prisma.bid.count({
          where: { supplierId, status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] } },
        }),
        this.prisma.order.count({
          where: {
            supplierId,
            status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
          },
        }),
      ]);

    return {
      activeInvitations,
      submittedBids,
      wonTenders: wonBidsAgg,
      ongoingOrders,
    };
  }

  // ============================================================
  // BID CRUD — E.3
  // ============================================================

  /** Tedarikçinin bu ihaledeki kendi teklifi (yoksa null) — kapalı zarf */
  async getMyBid(supplierId: string, tenderId: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, status: { in: VISIBLE_STATUSES } },
      select: { id: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");

    // Davet kontrolü — davetli değilse erişim yok
    const invitation = await this.prisma.tenderInvitation.findUnique({
      where: { tenderId_supplierId: { tenderId, supplierId } },
      select: { id: true },
    });
    if (!invitation) {
      throw new ForbiddenException("Bu ihaleye davetli değilsiniz");
    }

    return this.prisma.bid.findUnique({
      where: { tenderId_supplierId: { tenderId, supplierId } },
      include: {
        items: {
          include: {
            tenderItem: {
              select: {
                id: true,
                orderIndex: true,
                name: true,
                description: true,
                quantity: true,
                unit: true,
                materialCode: true,
                customQuestion: true,
              },
            },
          },
          orderBy: { tenderItem: { orderIndex: "asc" } },
        },
        attachments: { orderBy: { uploadedAt: "asc" } },
      },
    });
  }

  /**
   * Taslak oluştur veya güncelle (upsert).
   * - SUBMITTED bid → 409 (E.5 refactor: revize akışı kaldırıldı; alıcı ele
   *   ederse tedarikçi yeniden teklif verebilir).
   * - LOST bid → düzenleme serbest; submit edildiğinde version++ ve
   *   eliminationReason/eliminatedAt temizlenir.
   * - items / attachments: createMany ile full-replace (V1 basit yaklaşımı).
   */
  async saveOrUpdateBid(
    supplierUserId: string,
    supplierId: string,
    tenderId: string,
    dto: CreateOrUpdateBidDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        include: { items: true },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");

      // Davet kontrolü
      const invitation = await tx.tenderInvitation.findUnique({
        where: { tenderId_supplierId: { tenderId, supplierId } },
        select: { id: true },
      });
      if (!invitation) {
        throw new ForbiddenException("Bu ihaleye davetli değilsiniz");
      }

      // Status + kapanış kontrolü
      if (tender.status !== "OPEN_FOR_BIDS") {
        throw new ConflictException("Bu ihaleye artık teklif verilemez");
      }
      if (tender.bidsCloseAt < new Date()) {
        throw new ConflictException("Teklif kapanış tarihi geçmiş");
      }

      // Para birimi kontrolü
      if (!tender.allowedCurrencies.includes(dto.currency)) {
        throw new BadRequestException(
          `Bu ihale için ${dto.currency} para birimi kabul edilmiyor`,
        );
      }

      // Kalem ID'leri tender'a ait mi?
      const tenderItemMap = new Map(
        tender.items.map((it) => [it.id, it] as const),
      );
      const invalidIds = dto.items.filter(
        (bi) => !tenderItemMap.has(bi.tenderItemId),
      );
      if (invalidIds.length > 0) {
        throw new BadRequestException("Geçersiz kalem ID'leri");
      }

      // Aynı kalem birden fazla gönderilmiş mi?
      const seen = new Set<string>();
      for (const bi of dto.items) {
        if (seen.has(bi.tenderItemId)) {
          throw new BadRequestException(
            "Aynı kalem birden fazla gönderilemez",
          );
        }
        seen.add(bi.tenderItemId);
      }

      // Kalem sorusu cevap zorunluluğu (sadece teklif verilen kalemler için)
      for (const dtoItem of dto.items) {
        if (dtoItem.unitPrice == null) continue;
        const tenderItem = tenderItemMap.get(dtoItem.tenderItemId)!;
        if (
          tenderItem.customQuestion &&
          (!dtoItem.customAnswer || dtoItem.customAnswer.trim().length === 0)
        ) {
          throw new BadRequestException(
            `"${tenderItem.name}" kalemi için soru cevabı zorunlu`,
          );
        }
      }

      const existing = await tx.bid.findUnique({
        where: { tenderId_supplierId: { tenderId, supplierId } },
        select: { id: true, status: true, version: true },
      });

      // E.5 refactor — Revize akışı kaldırıldı:
      //   - SUBMITTED: alıcıyla iletişim gerekli; tedarikçi düzenleyemez
      //   - WITHDRAWN: V1'de yeniden teklif yok (kalıcı)
      //   - REJECTED / AWARDED_FULL / AWARDED_PARTIAL: kapanmış
      //   - LOST: alıcı eledi → tedarikçi yeniden teklif verebilir (status
      //     LOST kalır, submit edilince version++ ile SUBMITTED'a geçer)
      if (existing) {
        if (existing.status === "SUBMITTED") {
          throw new ConflictException(
            "Verilmiş teklif düzenlenemez. Değişiklik için alıcıyla iletişime geçin. Alıcı teklifinizi elerse yeniden teklif verebilirsiniz.",
          );
        }
        if (existing.status === "WITHDRAWN") {
          throw new ConflictException(
            "Geri çekilmiş teklif yeniden açılamaz. Yeni teklif vermek için alıcıyla iletişime geçin.",
          );
        }
        if (
          ["REJECTED", "AWARDED_FULL", "AWARDED_PARTIAL"].includes(
            existing.status,
          )
        ) {
          throw new ConflictException(
            "Bu teklif sonuçlandı, düzenlenemez",
          );
        }
        // DRAFT veya LOST → düzenlemeye izin ver
      }

      // Toplam (sadece teklif verilen kalemler) — backend hesaplar
      const totalAmount = this.calculateTotalAmount(dto.items, tender.items);

      const bid = await tx.bid.upsert({
        where: { tenderId_supplierId: { tenderId, supplierId } },
        create: {
          tenderId,
          supplierId,
          submittedById: supplierUserId,
          status: "DRAFT",
          currency: dto.currency,
          totalAmount,
          notes: dto.notes?.trim() || null,
          version: 1,
        },
        update: {
          currency: dto.currency,
          totalAmount,
          notes: dto.notes?.trim() || null,
          submittedById: supplierUserId,
        },
      });

      // BidItem full-replace
      await tx.bidItem.deleteMany({ where: { bidId: bid.id } });
      const itemsToCreate = dto.items
        .filter((i) => i.unitPrice != null)
        .map((i) => {
          const tenderItem = tenderItemMap.get(i.tenderItemId)!;
          const totalPrice =
            (i.unitPrice ?? 0) * Number(tenderItem.quantity);
          return {
            bidId: bid.id,
            tenderItemId: i.tenderItemId,
            unitPrice: i.unitPrice!,
            totalPrice,
            currency: dto.currency,
            customAnswer: i.customAnswer?.trim() || null,
          };
        });
      if (itemsToCreate.length > 0) {
        await tx.bidItem.createMany({ data: itemsToCreate });
      }

      // BidAttachment full-replace
      await tx.bidAttachment.deleteMany({ where: { bidId: bid.id } });
      if (dto.attachments && dto.attachments.length > 0) {
        await tx.bidAttachment.createMany({
          data: dto.attachments.map((a) => ({
            bidId: bid.id,
            fileName: a.fileName,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
            fileUrl: a.fileUrl,
          })),
        });
      }

      return tx.bid.findUnique({
        where: { id: bid.id },
        include: {
          items: {
            include: {
              tenderItem: {
                select: {
                  id: true,
                  orderIndex: true,
                  name: true,
                  description: true,
                  quantity: true,
                  unit: true,
                  materialCode: true,
                  customQuestion: true,
                },
              },
            },
            orderBy: { tenderItem: { orderIndex: "asc" } },
          },
          attachments: { orderBy: { uploadedAt: "asc" } },
        },
      });
    });
  }

  /**
   * DRAFT → SUBMITTED (ilk gönderim, version=1 kalır).
   * LOST → SUBMITTED (eleme sonrası yeniden teklif, version++ +
   *   eliminationReason/eliminatedAt temizlenir).
   * SUBMITTED → SUBMITTED ARTIK YASAK (E.5 refactor — revize kaldırıldı).
   * Submit öncesi requireAllItems / requireBidDocument validasyonları.
   */
  async submitBid(supplierId: string, tenderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        include: { items: { select: { id: true, name: true } } },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");

      const invitation = await tx.tenderInvitation.findUnique({
        where: { tenderId_supplierId: { tenderId, supplierId } },
        select: { id: true },
      });
      if (!invitation) {
        throw new ForbiddenException("Bu ihaleye davetli değilsiniz");
      }

      if (tender.status !== "OPEN_FOR_BIDS") {
        throw new ConflictException("Bu ihale teklife açık değil");
      }
      if (tender.bidsCloseAt < new Date()) {
        throw new ConflictException("Teklif kapanış tarihi geçmiş");
      }

      const bid = await tx.bid.findUnique({
        where: { tenderId_supplierId: { tenderId, supplierId } },
        include: { items: true, attachments: { select: { id: true } } },
      });
      if (!bid) {
        throw new NotFoundException("Önce bir taslak oluşturmalısınız");
      }
      if (bid.status === "SUBMITTED") {
        throw new ConflictException(
          "Verilmiş teklif yeniden gönderilemez. Değişiklik için alıcıyla iletişime geçin.",
        );
      }
      if (
        ["WITHDRAWN", "REJECTED", "AWARDED_FULL", "AWARDED_PARTIAL"].includes(
          bid.status,
        )
      ) {
        throw new ConflictException(
          "Bu durumdaki teklif tekrar gönderilemez",
        );
      }
      // DRAFT veya LOST geçişi serbest

      if (bid.items.length === 0) {
        throw new BadRequestException(
          "Teklif vermek için en az 1 kaleme fiyat girilmelidir",
        );
      }

      if (tender.requireAllItems) {
        const tenderIds = new Set(tender.items.map((i) => i.id));
        const bidIds = new Set(bid.items.map((i) => i.tenderItemId));
        if (
          bidIds.size !== tenderIds.size ||
          [...tenderIds].some((id) => !bidIds.has(id))
        ) {
          throw new BadRequestException(
            "Bu ihalede tüm kalemlere teklif vermek zorunludur",
          );
        }
      }

      if (tender.requireBidDocument && bid.attachments.length === 0) {
        throw new BadRequestException(
          "Bu ihalede en az 1 teklif dosyası yüklemek zorunludur",
        );
      }

      // LOST → SUBMITTED: eleme sonrası yeniden teklif, version++ ve
      // eliminationReason/eliminatedAt temizlenir.
      const isResubmissionAfterElimination = bid.status === "LOST";

      const updated = await tx.bid.update({
        where: { id: bid.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          version: isResubmissionAfterElimination
            ? bid.version + 1
            : bid.version,
          eliminationReason: isResubmissionAfterElimination ? null : undefined,
          eliminatedAt: isResubmissionAfterElimination ? null : undefined,
        },
        select: {
          id: true,
          status: true,
          version: true,
          submittedAt: true,
          totalAmount: true,
          currency: true,
        },
      });

      return updated;
    });
  }

  /** SUBMITTED → WITHDRAWN. Sadece kapanıştan önce, sadece SUBMITTED'tan. */
  async withdrawBid(supplierId: string, tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, bidsCloseAt: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");

    const invitation = await this.prisma.tenderInvitation.findUnique({
      where: { tenderId_supplierId: { tenderId, supplierId } },
      select: { id: true },
    });
    if (!invitation) {
      throw new ForbiddenException("Bu ihaleye davetli değilsiniz");
    }

    if (tender.status !== "OPEN_FOR_BIDS") {
      throw new ConflictException(
        "Bu durumdaki ihaleden teklif geri çekilemez",
      );
    }
    if (tender.bidsCloseAt < new Date()) {
      throw new ConflictException(
        "Kapanış tarihinden sonra teklif geri çekilemez",
      );
    }

    const bid = await this.prisma.bid.findUnique({
      where: { tenderId_supplierId: { tenderId, supplierId } },
      select: { id: true, status: true },
    });
    if (!bid) throw new NotFoundException("Teklif bulunamadı");
    if (bid.status !== "SUBMITTED") {
      throw new ConflictException("Sadece verilmiş teklifler geri çekilebilir");
    }

    return this.prisma.bid.update({
      where: { id: bid.id },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: new Date(),
      },
      select: { id: true, status: true, withdrawnAt: true },
    });
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  private calculateTotalAmount(
    bidItems: { tenderItemId: string; unitPrice?: number | null }[],
    tenderItems: { id: string; quantity: Prisma.Decimal | number }[],
  ): number {
    return bidItems.reduce((sum, bi) => {
      if (bi.unitPrice == null) return sum;
      const tenderItem = tenderItems.find((ti) => ti.id === bi.tenderItemId);
      if (!tenderItem) return sum;
      return sum + bi.unitPrice * Number(tenderItem.quantity);
    }, 0);
  }
}
