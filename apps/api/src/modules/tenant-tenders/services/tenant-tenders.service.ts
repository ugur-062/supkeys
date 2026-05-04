import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@supkeys/db";
import { generateTenderNumber } from "@supkeys/shared";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { CancelTenderDto } from "../dto/cancel-tender.dto";
import { CreateTenderDto } from "../dto/create-tender.dto";
import { ListTendersDto } from "../dto/list-tenders.dto";
import { UpdateTenderDto } from "../dto/update-tender.dto";

@Injectable()
export class TenantTendersService {
  private readonly logger = new Logger(TenantTendersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // READ — list / detail / stats (mevcut)
  // ============================================================

  async list(tenantId: string, query: ListTendersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.TenderWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { tenderNumber: { contains: term, mode: "insensitive" } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tender.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          type: true,
          status: true,
          primaryCurrency: true,
          bidsCloseAt: true,
          publishedAt: true,
          createdAt: true,
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { items: true, invitations: true, bids: true },
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
        type: t.type,
        status: t.status,
        primaryCurrency: t.primaryCurrency,
        bidsCloseAt: t.bidsCloseAt,
        publishedAt: t.publishedAt,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
        itemCount: t._count.items,
        invitationCount: t._count.invitations,
        bidCount: t._count.bids,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          orderBy: { orderIndex: "asc" },
        },
        invitations: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
                membership: true,
                taxNumber: true,
              },
            },
          },
          orderBy: { invitedAt: "asc" },
        },
        attachments: {
          orderBy: { uploadedAt: "asc" },
        },
        _count: {
          select: { bids: true },
        },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");

    const bidStats = await this.prisma.bid.groupBy({
      by: ["status"],
      where: { tenderId: tender.id },
      _count: { _all: true },
    });
    const byStatus = bidStats.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      ...tender,
      bidStats: {
        total:
          (byStatus.SUBMITTED ?? 0) +
          (byStatus.WITHDRAWN ?? 0) +
          (byStatus.AWARDED_FULL ?? 0) +
          (byStatus.AWARDED_PARTIAL ?? 0) +
          (byStatus.LOST ?? 0),
        submitted: byStatus.SUBMITTED ?? 0,
        draft: byStatus.DRAFT ?? 0,
        withdrawn: byStatus.WITHDRAWN ?? 0,
        invitedCount: tender.invitations.length,
      },
    };
  }

  async stats(tenantId: string) {
    const grouped = await this.prisma.tender.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    });
    const total = await this.prisma.tender.count({ where: { tenantId } });

    const byStatus = grouped.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      draft: byStatus.DRAFT ?? 0,
      openForBids: byStatus.OPEN_FOR_BIDS ?? 0,
      inAward: byStatus.IN_AWARD ?? 0,
      awarded: byStatus.AWARDED ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      closedNoAward: byStatus.CLOSED_NO_AWARD ?? 0,
    };
  }

  // ============================================================
  // READ — bids (alıcı izleme paneli, E.4)
  // ============================================================

  /**
   * "Teklifler" tab — İhale Bazlı Sıralama.
   * Tüm bid'leri dolu/eksik gruplarına ayırır, totalAmount'a göre sıralar.
   */
  async getBids(tenantId: string, tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        items: {
          select: { id: true, name: true, quantity: true, unit: true },
        },
        _count: { select: { items: true, invitations: true } },
      },
    });

    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    if (tender.status === "DRAFT")
      throw new ConflictException("Taslak ihalede teklif olmaz");

    const totalItems = tender._count.items;

    const bids = await this.prisma.bid.findMany({
      where: {
        tenderId,
        status: {
          in: [
            "SUBMITTED",
            "AWARDED_FULL",
            "AWARDED_PARTIAL",
            "LOST",
            "WITHDRAWN",
          ],
        },
      },
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            taxNumber: true,
            city: true,
            membership: true,
          },
        },
        submittedBy: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
        items: {
          select: {
            id: true,
            tenderItemId: true,
            unitPrice: true,
            totalPrice: true,
            currency: true,
            customAnswer: true,
          },
        },
        attachments: { select: { id: true, fileName: true, fileSize: true } },
      },
      orderBy: { totalAmount: "asc" },
    });

    // Ranking: WITHDRAWN dışında kalan bid'lere totalAmount sırasına göre 1..N
    let rankCursor = 0;
    const enriched = bids.map((bid) => {
      const isComplete = bid.items.length === totalItems;
      const isWithdrawn = bid.status === "WITHDRAWN";
      const rank = isWithdrawn ? null : ++rankCursor;
      return {
        ...bid,
        rank,
        itemsBidCount: bid.items.length,
        totalItems,
        isComplete,
      };
    });

    const complete = enriched.filter(
      (b) => b.isComplete && b.status !== "WITHDRAWN",
    );
    const incomplete = enriched.filter(
      (b) => !b.isComplete && b.status !== "WITHDRAWN",
    );
    const withdrawn = enriched.filter((b) => b.status === "WITHDRAWN");

    return {
      tender: {
        id: tender.id,
        tenderNumber: tender.tenderNumber,
        title: tender.title,
        status: tender.status,
        bidsCloseAt: tender.bidsCloseAt,
        primaryCurrency: tender.primaryCurrency,
        totalItems,
        invitedCount: tender._count.invitations,
      },
      summary: {
        total: enriched.filter((b) => b.status !== "WITHDRAWN").length,
        complete: complete.length,
        incomplete: incomplete.length,
        withdrawn: withdrawn.length,
      },
      complete,
      incomplete,
      withdrawn,
    };
  }

  /**
   * "Teklifler" tab — Kalem Bazlı Sıralama.
   * Her kalem için tüm geçerli teklifler + en düşük unit price'lı bid.
   */
  async getBidComparison(tenantId: string, tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        items: { orderBy: { orderIndex: "asc" } },
        bids: {
          where: {
            status: {
              in: ["SUBMITTED", "AWARDED_FULL", "AWARDED_PARTIAL"],
            },
          },
          include: {
            supplier: {
              select: { id: true, companyName: true, membership: true },
            },
            items: true,
          },
        },
      },
    });

    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    if (tender.status === "DRAFT")
      throw new ConflictException("Taslak ihalede teklif olmaz");

    const items = tender.items.map((item) => {
      const bidsForItem = tender.bids.flatMap((bid) => {
        const bi = bid.items.find((x) => x.tenderItemId === item.id);
        if (!bi || bi.unitPrice == null) return [];
        return [
          {
            bidId: bid.id,
            supplierId: bid.supplier.id,
            supplierName: bid.supplier.companyName,
            membership: bid.supplier.membership,
            unitPrice: bi.unitPrice,
            totalPrice: bi.totalPrice,
            currency: bi.currency,
          },
        ];
      });

      const best =
        bidsForItem.length > 0
          ? bidsForItem.reduce((min, curr) =>
              Number(curr.unitPrice) < Number(min.unitPrice) ? curr : min,
            )
          : null;

      return {
        tenderItem: {
          id: item.id,
          orderIndex: item.orderIndex,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          targetUnitPrice: item.targetUnitPrice,
        },
        allBids: bidsForItem,
        bestBid: best,
      };
    });

    return {
      tender: {
        id: tender.id,
        title: tender.title,
        tenderNumber: tender.tenderNumber,
        status: tender.status,
        primaryCurrency: tender.primaryCurrency,
      },
      items,
    };
  }

  /**
   * Tek bir teklifin tüm detayı + bu ihaledeki sıralama bilgisi.
   */
  async getBidDetail(tenantId: string, tenderId: string, bidId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        primaryCurrency: true,
        items: { select: { id: true } },
      },
    });

    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");

    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        supplier: true,
        submittedBy: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
        items: {
          include: {
            tenderItem: {
              select: {
                id: true,
                orderIndex: true,
                name: true,
                quantity: true,
                unit: true,
                customQuestion: true,
                targetUnitPrice: true,
              },
            },
          },
          orderBy: { tenderItem: { orderIndex: "asc" } },
        },
        attachments: true,
      },
    });

    if (!bid || bid.tenderId !== tenderId)
      throw new NotFoundException("Teklif bulunamadı");

    const totalItems = tender.items.length;

    // Ranking: sadece SUBMITTED + AWARDED bid'ler arasında, totalAmount asc
    const ranked = await this.prisma.bid.findMany({
      where: {
        tenderId,
        status: { in: ["SUBMITTED", "AWARDED_FULL", "AWARDED_PARTIAL"] },
      },
      select: { id: true },
      orderBy: { totalAmount: "asc" },
    });

    const rankIdx = ranked.findIndex((b) => b.id === bidId);
    const rank = rankIdx >= 0 ? rankIdx + 1 : null;

    return {
      ...bid,
      rank,
      totalBids: ranked.length,
      totalItems,
      itemsBidCount: bid.items.length,
      isComplete: bid.items.length === totalItems,
      isDifferentCurrency: bid.currency !== tender.primaryCurrency,
      primaryCurrency: tender.primaryCurrency,
    };
  }

  // ============================================================
  // WRITE — createDraft / updateDraft / publish / cancel / delete
  // ============================================================

  async createDraft(
    tenantId: string,
    userId: string,
    dto: CreateTenderDto,
  ) {
    this.validateBusinessRules(dto);

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveSuppliers(tx, tenantId, dto.invitedSupplierIds);

      const tenderNumber = await generateTenderNumber(tx);

      const tender = await tx.tender.create({
        data: {
          tenderNumber,
          tenantId,
          createdById: userId,
          type: dto.type,
          status: "DRAFT",
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          termsAndConditions: dto.termsAndConditions?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          isSealedBid: dto.isSealedBid,
          requireAllItems: dto.requireAllItems,
          requireBidDocument: dto.requireBidDocument,
          primaryCurrency: dto.primaryCurrency,
          allowedCurrencies: dto.allowedCurrencies,
          decimalPlaces: dto.decimalPlaces,
          deliveryTerm: dto.deliveryTerm ?? null,
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          paymentTerm: dto.paymentTerm,
          paymentDays:
            dto.paymentTerm === "DEFERRED" ? (dto.paymentDays ?? null) : null,
          bidsCloseAt: new Date(dto.bidsCloseAt),
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          items: {
            create: dto.items.map((item, idx) => ({
              orderIndex: idx + 1,
              name: item.name.trim(),
              description: item.description?.trim() || null,
              quantity: item.quantity,
              unit: item.unit.trim(),
              materialCode: item.materialCode?.trim() || null,
              requiredByDate: item.requiredByDate
                ? new Date(item.requiredByDate)
                : null,
              targetUnitPrice: item.targetUnitPrice ?? null,
              customQuestion: item.customQuestion?.trim() || null,
            })),
          },
          invitations: {
            create: dto.invitedSupplierIds.map((supplierId) => ({
              supplierId,
              status: "PENDING" as const,
            })),
          },
          attachments:
            dto.attachments && dto.attachments.length > 0
              ? {
                  create: dto.attachments.map((att) => ({
                    fileName: att.fileName,
                    fileSize: att.fileSize,
                    mimeType: att.mimeType,
                    fileUrl: att.fileUrl,
                  })),
                }
              : undefined,
        },
        select: { id: true },
      });

      return { id: tender.id, tenderNumber };
    });
  }

  async updateDraft(
    tenantId: string,
    tenderId: string,
    dto: UpdateTenderDto,
  ) {
    this.validateBusinessRules(dto);

    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        select: { id: true, tenantId: true, status: true, tenderNumber: true },
      });

      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      if (tender.status !== "DRAFT")
        throw new ConflictException(
          "Sadece taslak durumdaki ihaleler düzenlenebilir",
        );

      await this.assertActiveSuppliers(tx, tenantId, dto.invitedSupplierIds);

      // Items + invitations + attachments full-replace (V1 yaklaşımı)
      await tx.tenderItem.deleteMany({ where: { tenderId } });
      await tx.tenderInvitation.deleteMany({ where: { tenderId } });
      await tx.tenderAttachment.deleteMany({ where: { tenderId } });

      await tx.tender.update({
        where: { id: tenderId },
        data: {
          type: dto.type,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          termsAndConditions: dto.termsAndConditions?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          isSealedBid: dto.isSealedBid,
          requireAllItems: dto.requireAllItems,
          requireBidDocument: dto.requireBidDocument,
          primaryCurrency: dto.primaryCurrency,
          allowedCurrencies: dto.allowedCurrencies,
          decimalPlaces: dto.decimalPlaces,
          deliveryTerm: dto.deliveryTerm ?? null,
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          paymentTerm: dto.paymentTerm,
          paymentDays:
            dto.paymentTerm === "DEFERRED" ? (dto.paymentDays ?? null) : null,
          bidsCloseAt: new Date(dto.bidsCloseAt),
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          items: {
            create: dto.items.map((item, idx) => ({
              orderIndex: idx + 1,
              name: item.name.trim(),
              description: item.description?.trim() || null,
              quantity: item.quantity,
              unit: item.unit.trim(),
              materialCode: item.materialCode?.trim() || null,
              requiredByDate: item.requiredByDate
                ? new Date(item.requiredByDate)
                : null,
              targetUnitPrice: item.targetUnitPrice ?? null,
              customQuestion: item.customQuestion?.trim() || null,
            })),
          },
          invitations: {
            create: dto.invitedSupplierIds.map((supplierId) => ({
              supplierId,
              status: "PENDING" as const,
            })),
          },
          attachments:
            dto.attachments && dto.attachments.length > 0
              ? {
                  create: dto.attachments.map((att) => ({
                    fileName: att.fileName,
                    fileSize: att.fileSize,
                    mimeType: att.mimeType,
                    fileUrl: att.fileUrl,
                  })),
                }
              : undefined,
        },
      });

      return { id: tender.id, tenderNumber: tender.tenderNumber };
    });
  }

  async publish(tenantId: string, tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        items: { select: { id: true } },
        invitations: {
          include: {
            supplier: {
              select: {
                id: true,
                isActive: true,
                isBlocked: true,
                users: {
                  where: { isActive: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: {
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        tenant: { select: { name: true } },
      },
    });

    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    if (tender.status !== "DRAFT")
      throw new ConflictException(
        "Sadece taslak durumdaki ihaleler yayınlanabilir",
      );
    if (tender.items.length === 0)
      throw new BadRequestException(
        "Yayınlamak için en az 1 kalem eklenmiş olmalı",
      );
    if (tender.invitations.length === 0)
      throw new BadRequestException(
        "Yayınlamak için en az 1 tedarikçi davet edilmiş olmalı",
      );
    if (tender.bidsCloseAt <= new Date())
      throw new BadRequestException(
        "Kapanış tarihi geçmişte, yayınlamadan önce güncelleyin",
      );

    const now = new Date();

    const published = await this.prisma.tender.update({
      where: { id: tenderId },
      data: {
        status: "OPEN_FOR_BIDS",
        publishedAt: now,
        bidsOpenAt: tender.bidsOpenAt ?? now,
      },
      select: {
        id: true,
        tenderNumber: true,
        title: true,
        bidsCloseAt: true,
      },
    });

    // Fire-and-forget: davetli tedarikçilerin primary user'ına e-posta
    this.dispatchInvitationEmails(tender, published).catch((err) => {
      this.logger.error(
        `Tender ${published.tenderNumber} publish e-posta dispatch hatası: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      id: published.id,
      tenderNumber: published.tenderNumber,
      status: "OPEN_FOR_BIDS" as const,
    };
  }

  async cancel(
    tenantId: string,
    tenderId: string,
    dto: CancelTenderDto,
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");

    const cancellable: typeof tender.status[] = ["OPEN_FOR_BIDS", "IN_AWARD"];
    if (!cancellable.includes(tender.status))
      throw new ConflictException("Bu durumdaki ihale iptal edilemez");

    return this.prisma.tender.update({
      where: { id: tenderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: dto.reason.trim(),
      },
      select: { id: true, status: true },
    });
  }

  async deleteDraft(tenantId: string, tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    if (tender.status !== "DRAFT")
      throw new ConflictException("Sadece taslak ihaleler silinebilir");

    // Cascade delete: items, invitations, attachments otomatik silinir
    await this.prisma.tender.delete({ where: { id: tenderId } });
    return { id: tender.id };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private validateBusinessRules(dto: CreateTenderDto) {
    if (!dto.allowedCurrencies.includes(dto.primaryCurrency)) {
      throw new BadRequestException(
        "Ana para birimi izin verilen para birimleri arasında olmalı",
      );
    }
    if (
      dto.paymentTerm === "DEFERRED" &&
      (!dto.paymentDays || dto.paymentDays < 1)
    ) {
      throw new BadRequestException(
        "Vadeli ödeme için gün sayısı belirtilmelidir",
      );
    }
    const closeAt = new Date(dto.bidsCloseAt);
    if (Number.isNaN(closeAt.getTime()) || closeAt <= new Date()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    if (dto.bidsOpenAt) {
      const openAt = new Date(dto.bidsOpenAt);
      if (Number.isNaN(openAt.getTime()) || openAt >= closeAt) {
        throw new BadRequestException(
          "Açılış tarihi kapanış tarihinden önce olmalı",
        );
      }
    }
    // Davetli tedarikçi listesinde duplicate olmasın
    const set = new Set(dto.invitedSupplierIds);
    if (set.size !== dto.invitedSupplierIds.length) {
      throw new BadRequestException("Davetli tedarikçi listesinde tekrar var");
    }
  }

  /**
   * Davetli tedarikçilerin tamamı bu tenant'ın ACTIVE ilişkisinde olmalı.
   * Engelli/pending/yabancı tedarikçi → 400.
   */
  private async assertActiveSuppliers(
    tx: Prisma.TransactionClient,
    tenantId: string,
    supplierIds: string[],
  ) {
    if (supplierIds.length === 0) return;

    const relations = await tx.supplierTenantRelation.findMany({
      where: {
        tenantId,
        supplierId: { in: supplierIds },
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    const activeSet = new Set(relations.map((r) => r.supplierId));
    const invalid = supplierIds.filter((id) => !activeSet.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Davet edilen tedarikçilerin ${invalid.length} tanesi onaylı/aktif listenizde değil`,
      );
    }
  }

  private async dispatchInvitationEmails(
    tender: {
      id: string;
      tenderNumber: string;
      title: string;
      bidsCloseAt: Date;
      tenant: { name: string };
      invitations: Array<{
        id: string;
        supplier: {
          id: string;
          users: Array<{
            email: string;
            firstName: string;
            lastName: string;
          }>;
        };
      }>;
    },
    published: { tenderNumber: string; bidsCloseAt: Date },
  ) {
    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    // itemCount'u kalemler include edilmediği için ayrıca çekelim
    const itemCount = await this.prisma.tenderItem.count({
      where: { tenderId: tender.id },
    });

    for (const invitation of tender.invitations) {
      const primary = invitation.supplier.users[0];
      if (!primary) {
        this.logger.warn(
          `Invitation ${invitation.id}: aktif primary user yok, e-posta atlandı`,
        );
        continue;
      }

      try {
        await this.emailQueue.enqueue({
          to: { email: primary.email, name: `${primary.firstName} ${primary.lastName}` },
          templateData: {
            template: "tender_invitation",
            data: {
              supplierUserName: `${primary.firstName} ${primary.lastName}`,
              tenantName: tender.tenant.name,
              tenderNumber: published.tenderNumber,
              tenderTitle: tender.title,
              tenderUrl: `${webUrl}/supplier/ihaleler/${tender.id}`,
              itemCount,
              bidsCloseAtFormatted: format(
                published.bidsCloseAt,
                "d MMMM yyyy, HH:mm",
                { locale: tr },
              ),
            },
          },
          context: { type: "tender_invitation", id: invitation.id },
          subject: `🎯 Yeni İhale Daveti: ${tender.title} — Supkeys`,
        });

        await this.prisma.tenderInvitation.update({
          where: { id: invitation.id },
          data: { emailSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(
          `Invitation ${invitation.id} e-posta gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
