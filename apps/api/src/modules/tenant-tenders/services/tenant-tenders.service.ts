import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";
import type { BidStatus, TenderStatus } from "@supkeys/db";
import { Prisma } from "@supkeys/db";
import { generateOrderNumber, generateTenderNumber } from "@supkeys/shared";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { assertCanActOnTender } from "../../../common/rbac/tender-owner.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import {
  buildBreadcrumb,
  CategoryService,
} from "../../categories/services/category.service";
import { EmailService } from "../../email/email.service";
import {
  formatAddressSnapshotText,
  TenantAddressesService,
  type TenantAddressSnapshot,
} from "../../tenant-addresses/services/tenant-addresses.service";
import {
  APPROVAL_EVENT,
  TenantApprovalRequestsService,
  type ApprovalApprovedEvent,
} from "../../tenant-approval-requests/services/tenant-approval-requests.service";
import {
  AwardItemDecisionDto,
  CloseNoAwardDto,
} from "../dto/award.dto";
import { TenderSchedulerService } from "../../tender-scheduler/tender-scheduler.service";
import { SupplierInvitationsService } from "../../tenant-suppliers/services/supplier-invitations.service";
import { CancelTenderDto } from "../dto/cancel-tender.dto";
import { CreateTenderDto, DecrementBasisDto } from "../dto/create-tender.dto";
import { ListTendersDto } from "../dto/list-tenders.dto";
import { UpdateTenderDto } from "../dto/update-tender.dto";

/**
 * Polish-1 — DTO whitelist'li `sort`. Geçersizse createdAt:desc fallback.
 */
function parseTenderSort(
  sort: string | undefined,
): Prisma.TenderOrderByWithRelationInput {
  const parts = (sort ?? "createdAt:desc").split(":");
  const field = parts[0];
  const dir: Prisma.SortOrder = parts[1] === "asc" ? "asc" : "desc";
  if (field === "bidsCloseAt") return { bidsCloseAt: dir };
  return { createdAt: dir };
}

/**
 * Items'tan tahmini toplam tutar hesaplar (primaryCurrency'de).
 * Bir item'da targetUnitPrice yoksa null döner — tutar aralığı filtresinde
 * "bilinmiyor" olarak değerlendirilir.
 */
function computeEstimatedTotal(
  items: Array<{ quantity: number | string; targetUnitPrice?: number | string | null }>,
): number | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    if (item.targetUnitPrice == null) return null;
    const price = Number(item.targetUnitPrice);
    const qty = Number(item.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return null;
    total += price * qty;
  }
  return total;
}

@Injectable()
export class TenantTendersService {
  private readonly logger = new Logger(TenantTendersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly addressesService: TenantAddressesService,
    private readonly approvalRequests: TenantApprovalRequestsService,
    private readonly categoryService: CategoryService,
    private readonly tenderScheduler: TenderSchedulerService,
    private readonly supplierInvitations: SupplierInvitationsService,
    private readonly audit: AuditService,
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
    // Creator (satın almacı) filtresi
    if (query.createdById) where.createdById = query.createdById;
    // Kategori — tender.categories içinde ≥1 eşleşme
    if (query.categoryId) {
      where.categories = { some: { categoryId: query.categoryId } };
    }
    // Para birimi
    if (query.currency) where.primaryCurrency = query.currency;
    // Tutar aralığı — null estimatedTotal'lar filter dışında kalır
    if (query.amountMin != null || query.amountMax != null) {
      const range: Prisma.DecimalFilter = {};
      if (query.amountMin != null) range.gte = query.amountMin;
      if (query.amountMax != null) range.lte = query.amountMax;
      where.estimatedTotal = range;
    }
    // V2-6 — Tarih aralığı (createdAt.gte). "all" verilirse veya hiç verilmezse
    // varsayılan "3m" uygulanır (kullanıcı açıkça "all" demedikçe son 3 ay).
    const range = query.range ?? "3m";
    if (range !== "all") {
      const now = new Date();
      const since = new Date(now);
      switch (range) {
        case "7d":
          since.setDate(now.getDate() - 7);
          break;
        case "30d":
          since.setDate(now.getDate() - 30);
          break;
        case "3m":
          since.setMonth(now.getMonth() - 3);
          break;
        case "6m":
          since.setMonth(now.getMonth() - 6);
          break;
        case "12m":
          since.setFullYear(now.getFullYear() - 1);
          break;
      }
      where.createdAt = { gte: since };
    }

    const orderBy = parseTenderSort(query.sort);

    // Performans audit P-5 — Kategori 4-seviye `parent.parent.parent.parent`
    // include'u kaldırıldı. Sadece categoryId'leri çekiyoruz, breadcrumb'ı
    // CategoryService.getBreadcrumbsByIds (in-memory cache) ile hidrate
    // ediyoruz. Eski: list başına 4 ek batched join query. Yeni: in-memory
    // O(1) lookup. List latency ~50ms↓.
    const [items, total] = await Promise.all([
      this.prisma.tender.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          type: true,
          isLogistics: true,
          status: true,
          primaryCurrency: true,
          allowedCurrencies: true,
          bidsCloseAt: true,
          publishedAt: true,
          createdAt: true,
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          categories: {
            select: { categoryId: true },
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: { items: true, invitations: true, bids: true },
          },
        },
      }),
      this.prisma.tender.count({ where }),
    ]);

    const categoryIds = Array.from(
      new Set(items.flatMap((t) => t.categories.map((c) => c.categoryId))),
    );
    const breadcrumbMap =
      await this.categoryService.getBreadcrumbsByIds(categoryIds);

    return {
      items: items.map((t) => ({
        id: t.id,
        tenderNumber: t.tenderNumber,
        title: t.title,
        type: t.type,
        isLogistics: t.isLogistics,
        status: t.status,
        primaryCurrency: t.primaryCurrency,
        allowedCurrencies: t.allowedCurrencies,
        bidsCloseAt: t.bidsCloseAt,
        publishedAt: t.publishedAt,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
        categories: t.categories
          .map((tc) => {
            const entry = breadcrumbMap.get(tc.categoryId);
            if (!entry) return null;
            return {
              id: entry.node.id,
              code: entry.node.code,
              nameTr: entry.node.nameTr,
              level: entry.node.level,
              breadcrumb: entry.breadcrumb,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null),
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
        // Performans audit P-5 — categoryId yeterli; breadcrumb cache'ten hidrate.
        categories: {
          select: { categoryId: true },
          orderBy: { createdAt: "asc" },
        },
        invitations: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
                membership: true,
                taxNumber: true,
                city: true,
                district: true,
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
        // E.7.D — IN_APPROVAL/IN_AWARD_APPROVAL banner için aktif onay
        approvalRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            approvalNumber: true,
            type: true,
            initiatedById: true,
          },
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

    const { approvalRequests, categories, ...rest } = tender;
    const breadcrumbMap = await this.categoryService.getBreadcrumbsByIds(
      categories.map((c) => c.categoryId),
    );
    return {
      ...rest,
      categories: categories
        .map((tc) => {
          const entry = breadcrumbMap.get(tc.categoryId);
          if (!entry) return null;
          return {
            id: entry.node.id,
            code: entry.node.code,
            nameTr: entry.node.nameTr,
            level: entry.node.level,
            breadcrumb: entry.breadcrumb,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
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
      activeApprovalRequest: approvalRequests[0] ?? null,
    };
  }

  /**
   * Tenant'ın ihaleleri açan distinct satın almacıları döner —
   * filtre dropdown'u için. tenderCount azalan sırada.
   */
  async distinctBuyers(tenantId: string) {
    const groups = await this.prisma.tender.groupBy({
      by: ["createdById"],
      where: { tenantId },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: groups.map((g) => g.createdById) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const countById = new Map(
      groups.map((g) => [g.createdById, g._count._all]),
    );
    return users
      .map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        tenderCount: countById.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.tenderCount - a.tenderCount);
  }

  /**
   * Tenant'ın ihalelerinde kullanılmış distinct kategorileri döner.
   * Breadcrumb'lı, en sık kullanılan üstte.
   */
  async distinctCategories(tenantId: string) {
    const groups = await this.prisma.tenderCategory.groupBy({
      by: ["categoryId"],
      where: { tender: { tenantId } },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const ids = groups.map((g) => g.categoryId);
    const breadcrumbs = await this.categoryService.getBreadcrumbsByIds(ids);
    const countById = new Map(
      groups.map((g) => [g.categoryId, g._count._all]),
    );
    return Array.from(breadcrumbs.values())
      .map((entry) => ({
        id: entry.node.id,
        breadcrumb: entry.breadcrumb,
        level: entry.node.level,
        tenderCount: countById.get(entry.node.id) ?? 0,
      }))
      .sort((a, b) => b.tenderCount - a.tenderCount);
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
      inApproval: byStatus.IN_APPROVAL ?? 0,
      openForBids: byStatus.OPEN_FOR_BIDS ?? 0,
      inAward: byStatus.IN_AWARD ?? 0,
      inAwardApproval: byStatus.IN_AWARD_APPROVAL ?? 0,
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
        // V2-3 — bid submit anındaki snapshot kuru. TRY bid'lerde null →
        // rate=1; eski (snapshot'sız) USD/EUR bid'lerinde fallback=1
        // (frontend warning gösterir).
        const snap = bid.exchangeRateSnapshot as
          | { rate?: number; rateDate?: string; fetchedAt?: string }
          | null;
        const rate = bi.currency === "TRY" ? 1 : (snap?.rate ?? 1);
        return [
          {
            bidId: bid.id,
            supplierId: bid.supplier.id,
            supplierName: bid.supplier.companyName,
            membership: bid.supplier.membership,
            unitPrice: bi.unitPrice,
            totalPrice: bi.totalPrice,
            currency: bi.currency,
            unitPriceTry: Number(bi.unitPrice) * rate,
            totalPriceTry:
              bi.totalPrice != null ? Number(bi.totalPrice) * rate : null,
            exchangeRate: rate,
            exchangeRateDate: snap?.rateDate ?? null,
          },
        ];
      });

      const best =
        bidsForItem.length > 0
          ? bidsForItem.reduce((min, curr) =>
              // En iyi: TRY equivalent karşılaştırması (cross-currency
              // teklifler arası tutarlı sıralama).
              curr.unitPriceTry < min.unitPriceTry ? curr : min,
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
                questions: true,
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

    // V2-6 — kategoriler (Class veya Commodity) zorunlu; dedup + validate
    const categoryIds = Array.from(new Set(dto.categoryIds));
    await this.categoryService.validateIds(categoryIds, 3);

    // Adres snapshot'larını al (transaction dışında — adres okuma)
    const billingSnapshot = await this.snapshotForType(
      tenantId,
      dto.billingAddressId,
      "FATURA",
    );
    const deliverySnapshot = await this.snapshotForType(
      tenantId,
      dto.deliveryAddressId,
      "TESLIMAT",
    );

    const estimatedTotal = computeEstimatedTotal(dto.items);
    const auctionFields = this.auctionFieldsFor(dto);
    const isLogistics = await this.deriveIsLogistics(categoryIds);
    const logistics = this.normalizeLogistics(isLogistics, dto);

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveSuppliers(tx, tenantId, dto.invitedSupplierIds);

      const tenderNumber = await generateTenderNumber(tx);

      const tender = await tx.tender.create({
        data: {
          tenderNumber,
          tenantId,
          createdById: userId,
          categories: {
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
          type: dto.type,
          status: "DRAFT",
          isLogistics: logistics.isLogistics,
          logisticsDetails: logistics.logisticsDetails,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          keywords: (dto.keywords ?? [])
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
            .slice(0, 10),
          termsAndConditions: dto.termsAndConditions?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          isSealedBid: auctionFields.isSealedBid,
          requireAllItems: dto.requireAllItems,
          requireBidDocument: dto.requireBidDocument,
          bidVisibility: auctionFields.bidVisibility,
          priceDecrementType: auctionFields.priceDecrementType,
          priceDecrementValue: auctionFields.priceDecrementValue,
          priceDecrementBasis: auctionFields.priceDecrementBasis,
          decimalPlaces: auctionFields.decimalPlaces,
          sendClosingReminder: auctionFields.sendClosingReminder,
          reminderMinutesBefore: auctionFields.reminderMinutesBefore,
          autoExtendOnLateBid: auctionFields.autoExtendOnLateBid,
          autoExtendThresholdMin: auctionFields.autoExtendThresholdMin,
          autoExtendByMinutes: auctionFields.autoExtendByMinutes,
          primaryCurrency: dto.primaryCurrency,
          allowedCurrencies: dto.allowedCurrencies,
          deliveryTerm: dto.deliveryTerm ?? null,
          // Snapshot pattern — JSON kayıt + geriye uyumlu text fallback
          billingAddressSnapshot: billingSnapshot as unknown as Prisma.InputJsonValue,
          deliveryAddressSnapshot:
            deliverySnapshot as unknown as Prisma.InputJsonValue,
          deliveryAddress: formatAddressSnapshotText(deliverySnapshot),
          paymentTerm: dto.paymentTerm,
          paymentDays:
            dto.paymentTerm === "DEFERRED" ? (dto.paymentDays ?? null) : null,
          paymentTiming: dto.paymentTiming ?? "AFTER_DELIVERY",
          bidsCloseAt: new Date(dto.bidsCloseAt),
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          estimatedTotal,
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
              questions:
                item.questions && item.questions.length > 0
                  ? item.questions.map((q) => ({
                      id: q.id,
                      text: q.text.trim(),
                      answerType: q.answerType,
                      required: !!q.required,
                    }))
                  : undefined,
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
    userId: string,
    userRole: string,
    dto: UpdateTenderDto,
  ) {
    // Erken ownership gate — validation/kategori sorgularını yapmadan
    // önce yetkisiz kullanıcıyı reddet.
    const existing = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, tenantId: true, createdById: true },
    });
    if (!existing) throw new NotFoundException("İhale bulunamadı");
    if (existing.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(existing, { id: userId, role: userRole });

    this.validateBusinessRules(dto);

    // V2-6 — kategoriler (Class veya Commodity) zorunlu; dedup + validate
    const categoryIds = Array.from(new Set(dto.categoryIds));
    await this.categoryService.validateIds(categoryIds, 3);

    const billingSnapshot = await this.snapshotForType(
      tenantId,
      dto.billingAddressId,
      "FATURA",
    );
    const deliverySnapshot = await this.snapshotForType(
      tenantId,
      dto.deliveryAddressId,
      "TESLIMAT",
    );

    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        select: {
          id: true,
          tenantId: true,
          status: true,
          tenderNumber: true,
          createdById: true,
        },
      });

      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      assertCanActOnTender(tender, { id: userId, role: userRole });

      // Düzenlenebilirlik: DRAFT her zaman, OPEN_FOR_BIDS ise henüz SUBMITTED
      // bid YOKsa (tedarikçi henüz teklif vermediyse karar/strateji kirlenmemiş).
      if (tender.status !== "DRAFT") {
        if (tender.status !== "OPEN_FOR_BIDS") {
          throw new ConflictException(
            "Sadece taslak veya henüz teklif gelmemiş ihaleler düzenlenebilir",
          );
        }
        const submittedCount = await tx.bid.count({
          where: { tenderId, status: "SUBMITTED" },
        });
        if (submittedCount > 0) {
          throw new ConflictException(
            "Bu ihaleye teklif verilmiş; düzenleme yapılamaz",
          );
        }
      }

      await this.assertActiveSuppliers(tx, tenantId, dto.invitedSupplierIds);

      // Items + invitations + attachments + categories full-replace (V1 yaklaşımı)
      await tx.tenderItem.deleteMany({ where: { tenderId } });
      await tx.tenderInvitation.deleteMany({ where: { tenderId } });
      await tx.tenderAttachment.deleteMany({ where: { tenderId } });
      await tx.tenderCategory.deleteMany({ where: { tenderId } });

      const auctionFields = this.auctionFieldsFor(dto);
      const isLogistics = await this.deriveIsLogistics(categoryIds);
      const logistics = this.normalizeLogistics(isLogistics, dto);

      await tx.tender.update({
        where: { id: tenderId },
        data: {
          categories: {
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
          type: dto.type,
          isLogistics: logistics.isLogistics,
          logisticsDetails: logistics.logisticsDetails,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          keywords: (dto.keywords ?? [])
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
            .slice(0, 10),
          termsAndConditions: dto.termsAndConditions?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          isSealedBid: auctionFields.isSealedBid,
          requireAllItems: dto.requireAllItems,
          requireBidDocument: dto.requireBidDocument,
          bidVisibility: auctionFields.bidVisibility,
          priceDecrementType: auctionFields.priceDecrementType,
          priceDecrementValue: auctionFields.priceDecrementValue,
          priceDecrementBasis: auctionFields.priceDecrementBasis,
          decimalPlaces: auctionFields.decimalPlaces,
          sendClosingReminder: auctionFields.sendClosingReminder,
          reminderMinutesBefore: auctionFields.reminderMinutesBefore,
          autoExtendOnLateBid: auctionFields.autoExtendOnLateBid,
          autoExtendThresholdMin: auctionFields.autoExtendThresholdMin,
          autoExtendByMinutes: auctionFields.autoExtendByMinutes,
          // Editing draft after auto-extend resets reminder idempotency.
          closingReminderSentAt: null,
          primaryCurrency: dto.primaryCurrency,
          allowedCurrencies: dto.allowedCurrencies,
          deliveryTerm: dto.deliveryTerm ?? null,
          billingAddressSnapshot:
            billingSnapshot as unknown as Prisma.InputJsonValue,
          deliveryAddressSnapshot:
            deliverySnapshot as unknown as Prisma.InputJsonValue,
          deliveryAddress: formatAddressSnapshotText(deliverySnapshot),
          paymentTerm: dto.paymentTerm,
          paymentDays:
            dto.paymentTerm === "DEFERRED" ? (dto.paymentDays ?? null) : null,
          paymentTiming: dto.paymentTiming ?? "AFTER_DELIVERY",
          bidsCloseAt: new Date(dto.bidsCloseAt),
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          estimatedTotal: computeEstimatedTotal(dto.items),
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
              questions:
                item.questions && item.questions.length > 0
                  ? item.questions.map((q) => ({
                      id: q.id,
                      text: q.text.trim(),
                      answerType: q.answerType,
                      required: !!q.required,
                    }))
                  : undefined,
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

  async publish(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
  ) {
    // 1) Tender'ı tüm gerekli ilişkilerle çek
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        items: {
          select: { id: true, quantity: true, targetUnitPrice: true },
        },
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
    assertCanActOnTender(tender, { id: userId, role: userRole });
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

    // Madde 22 — İhale yayınlama onayı kaldırıldı. İhaleler onaya düşmeden
    // doğrudan yayınlanır. Onay artık yalnızca kazandırmada (TENDER_AWARD)
    // gereklidir.

    // Direkt yayınla
    const published = await this.prisma.tender.update({
      where: { id: tenderId },
      data: {
        status: "OPEN_FOR_BIDS",
        publishedAt: new Date(),
        bidsOpenAt: tender.bidsOpenAt ?? new Date(),
      },
      select: {
        id: true,
        tenderNumber: true,
        title: true,
        bidsCloseAt: true,
      },
    });

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

  // ============================================================
  // E.7.D — Onay sonrası post-process event listeners
  // ============================================================

  /**
   * Approval onaylandığında ApprovalRequestsService event emit eder.
   * `advanceTenderAfterApproval` zaten Tender'ı OPEN_FOR_BIDS'e taşıdı;
   * burada davet e-postalarını ve diğer publish-time yan etkileri çalıştırırız.
   */
  @OnEvent(APPROVAL_EVENT.PUBLISH_APPROVED)
  async handlePublishApproved(payload: ApprovalApprovedEvent) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: payload.tenderId },
      include: {
        items: { select: { id: true } },
        invitations: {
          include: {
            supplier: {
              select: {
                id: true,
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
    if (!tender) {
      this.logger.warn(
        `handlePublishApproved: tender ${payload.tenderId} bulunamadı`,
      );
      return;
    }
    try {
      await this.dispatchInvitationEmails(tender, {
        tenderNumber: tender.tenderNumber,
        bidsCloseAt: tender.bidsCloseAt,
      });
    } catch (err) {
      this.logger.error(
        `Post-approval invitation dispatch failed for ${tender.tenderNumber}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async cancel(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
    dto: CancelTenderDto,
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdById: true,
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(tender, { id: userId, role: userRole });

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

  async deleteDraft(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdById: true,
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(tender, { id: userId, role: userRole });
    if (tender.status !== "DRAFT")
      throw new ConflictException("Sadece taslak ihaleler silinebilir");

    // Cascade delete: items, invitations, attachments otomatik silinir
    await this.prisma.tender.delete({ where: { id: tenderId } });
    return { id: tender.id };
  }

  /**
   * V2-7 — Yeni Tur Oluştur. Önceki tender'ı baz alıp yeni Tender türetir.
   * - Items + categories + adresler + auction ayarları kopyalanır.
   * - Invitations: eliminateNonBidders=true ise sadece SUBMITTED veren tedarikçiler.
   * - carryBids:
   *   - AUTO: önceki SUBMITTED bid'leri yeni tender'a DRAFT olarak kopyalar.
   *   - LAZY: bid oluşturulmaz; supplier teklif formu önceki round bid'i prefill eder.
   *   - NONE: hiç kopya yok.
   * - openImmediately=true → publish'i hemen tetikler (status → OPEN_FOR_BIDS).
   */
  async createNextRound(
    tenantId: string,
    previousTenderId: string,
    userId: string,
    userRole: string,
    dto: {
      type: "RFQ" | "ENGLISH_AUCTION";
      carryBids: "AUTO" | "LAZY" | "NONE";
      eliminateNonBidders: boolean;
      openImmediately: boolean;
      bidsOpenAt?: string;
      bidsCloseAt: string;
      previewBeforeOpen?: boolean;
      autoExtendOnLateBid?: boolean;
    },
  ): Promise<{ id: string; tenderNumber: string; roundNumber: number }> {
    const previous = await this.prisma.tender.findUnique({
      where: { id: previousTenderId },
      include: {
        items: { orderBy: { orderIndex: "asc" } },
        categories: { select: { categoryId: true } },
        invitations: { select: { supplierId: true } },
        bids: {
          where: { status: "SUBMITTED" },
          select: {
            id: true,
            supplierId: true,
            submittedById: true,
            totalAmount: true,
            currency: true,
            notes: true,
            items: {
              select: {
                tenderItemId: true,
                unitPrice: true,
                customAnswer: true,
              },
            },
          },
        },
      },
    });
    if (!previous) throw new NotFoundException("Önceki ihale bulunamadı");
    if (previous.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(previous, { id: userId, role: userRole });
    if (!["IN_AWARD", "OPEN_FOR_BIDS", "CLOSED_NO_AWARD"].includes(previous.status)) {
      throw new ConflictException(
        `Yeni tur sadece IN_AWARD / OPEN_FOR_BIDS / CLOSED_NO_AWARD ihaleler için açılabilir. Mevcut: ${previous.status}`,
      );
    }

    const closeAt = new Date(dto.bidsCloseAt);
    if (Number.isNaN(closeAt.getTime()) || closeAt <= new Date()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    const openAt = dto.openImmediately
      ? null
      : dto.bidsOpenAt
      ? new Date(dto.bidsOpenAt)
      : null;
    if (!dto.openImmediately && (!openAt || openAt >= closeAt)) {
      throw new BadRequestException(
        "Açılış tarihi geçerli ve kapanıştan önce olmalı",
      );
    }

    // Davetli tedarikçi listesi
    const submitterIds = new Set(previous.bids.map((b) => b.supplierId));
    let invitedSupplierIds = previous.invitations.map((i) => i.supplierId);
    if (dto.eliminateNonBidders) {
      invitedSupplierIds = invitedSupplierIds.filter((sid) =>
        submitterIds.has(sid),
      );
    }
    if (invitedSupplierIds.length === 0) {
      throw new BadRequestException(
        "Yeni turda davetli tedarikçi kalmadı (eleme sonucu sıfır)",
      );
    }

    // Auction settings — önceki tender'dan kopyala, type değişikliği uygula.
    const isNewAuction = dto.type === "ENGLISH_AUCTION";
    const auctionFieldsCopy = {
      bidVisibility: isNewAuction ? previous.bidVisibility : "OWN_ONLY",
      priceDecrementType: isNewAuction ? previous.priceDecrementType : null,
      priceDecrementValue: isNewAuction ? previous.priceDecrementValue : null,
      priceDecrementBasis: isNewAuction ? previous.priceDecrementBasis : null,
      decimalPlaces: previous.decimalPlaces,
      sendClosingReminder: previous.sendClosingReminder,
      reminderMinutesBefore: previous.reminderMinutesBefore,
      autoExtendOnLateBid: isNewAuction
        ? (dto.autoExtendOnLateBid ?? previous.autoExtendOnLateBid)
        : false,
      autoExtendThresholdMin: previous.autoExtendThresholdMin,
      autoExtendByMinutes: previous.autoExtendByMinutes,
      isSealedBid: isNewAuction ? true : previous.isSealedBid,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertActiveSuppliers(tx, tenantId, invitedSupplierIds);
      const tenderNumber = await generateTenderNumber(tx);
      const newRoundNumber = previous.roundNumber + 1;

      const created = await tx.tender.create({
        data: {
          tenderNumber,
          tenantId,
          createdById: userId,
          type: dto.type,
          status: dto.openImmediately ? "OPEN_FOR_BIDS" : "DRAFT",
          title: previous.title,
          description: previous.description,
          keywords: previous.keywords,
          termsAndConditions: previous.termsAndConditions,
          internalNotes: previous.internalNotes,
          isSealedBid: auctionFieldsCopy.isSealedBid,
          requireAllItems: previous.requireAllItems,
          requireBidDocument: previous.requireBidDocument,
          bidVisibility: auctionFieldsCopy.bidVisibility,
          priceDecrementType: auctionFieldsCopy.priceDecrementType,
          priceDecrementValue: auctionFieldsCopy.priceDecrementValue,
          priceDecrementBasis: auctionFieldsCopy.priceDecrementBasis,
          decimalPlaces: auctionFieldsCopy.decimalPlaces,
          sendClosingReminder: auctionFieldsCopy.sendClosingReminder,
          reminderMinutesBefore: auctionFieldsCopy.reminderMinutesBefore,
          autoExtendOnLateBid: auctionFieldsCopy.autoExtendOnLateBid,
          autoExtendThresholdMin: auctionFieldsCopy.autoExtendThresholdMin,
          autoExtendByMinutes: auctionFieldsCopy.autoExtendByMinutes,
          primaryCurrency: previous.primaryCurrency,
          allowedCurrencies: isNewAuction
            ? [previous.primaryCurrency]
            : previous.allowedCurrencies,
          deliveryTerm: previous.deliveryTerm,
          billingAddressSnapshot:
            previous.billingAddressSnapshot as unknown as Prisma.InputJsonValue,
          deliveryAddressSnapshot:
            previous.deliveryAddressSnapshot as unknown as Prisma.InputJsonValue,
          deliveryAddress: previous.deliveryAddress,
          paymentTerm: previous.paymentTerm,
          paymentDays: previous.paymentDays,
          paymentTiming: previous.paymentTiming,
          estimatedTotal: previous.estimatedTotal,
          previousTenderId: previous.id,
          roundNumber: newRoundNumber,
          bidsOpenAt: openAt,
          bidsCloseAt: closeAt,
          publishedAt: dto.openImmediately ? new Date() : null,
          categories: {
            create: previous.categories.map((c) => ({ categoryId: c.categoryId })),
          },
          items: {
            create: previous.items.map((it) => ({
              orderIndex: it.orderIndex,
              name: it.name,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              materialCode: it.materialCode,
              requiredByDate: it.requiredByDate,
              targetUnitPrice: it.targetUnitPrice,
              customQuestion: it.customQuestion,
              questions: (it.questions ?? undefined) as
                | Prisma.InputJsonValue
                | undefined,
            })),
          },
          invitations: {
            create: invitedSupplierIds.map((supplierId) => ({
              supplierId,
              status: dto.openImmediately
                ? ("PENDING" as const)
                : ("PENDING" as const),
            })),
          },
        },
        include: {
          items: { select: { id: true, orderIndex: true } },
        },
      });

      // AUTO bid carry: önceki SUBMITTED bidler → yeni tender'da DRAFT bid
      if (dto.carryBids === "AUTO" && previous.bids.length > 0) {
        // Yeni tender item id eşlemesi (orderIndex bazlı, çünkü kopyalandı)
        const newItemByOrder = new Map(
          created.items.map((i) => [i.orderIndex, i.id]),
        );
        const previousItemById = new Map(
          previous.items.map((i) => [i.id, i]),
        );

        for (const prevBid of previous.bids) {
          // Davetli mi kontrol et
          if (!invitedSupplierIds.includes(prevBid.supplierId)) continue;

          const newBid = await tx.bid.create({
            data: {
              tenderId: created.id,
              supplierId: prevBid.supplierId,
              submittedById: prevBid.submittedById,
              status: "DRAFT",
              currency: previous.primaryCurrency,
              totalAmount: prevBid.totalAmount,
              notes: prevBid.notes,
              version: 1,
            },
          });
          // Items
          const itemsToCreate = prevBid.items
            .map((bi) => {
              const prevItem = previousItemById.get(bi.tenderItemId);
              if (!prevItem) return null;
              const newItemId = newItemByOrder.get(prevItem.orderIndex);
              if (!newItemId || bi.unitPrice == null) return null;
              return {
                bidId: newBid.id,
                tenderItemId: newItemId,
                unitPrice: bi.unitPrice,
                totalPrice:
                  Number(bi.unitPrice) * Number(prevItem.quantity),
                currency: previous.primaryCurrency,
                customAnswer: bi.customAnswer,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
          if (itemsToCreate.length > 0) {
            await tx.bidItem.createMany({ data: itemsToCreate });
          }
        }
      }

      return {
        id: created.id,
        tenderNumber: created.tenderNumber,
        roundNumber: newRoundNumber,
      };
    });

    return result;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * V2-7 — Auction ayar alanlarını normalize et.
   * RFQ ise: bidVisibility=OWN_ONLY, decrement alanları null, auto-extend ignore.
   * ENGLISH_AUCTION ise: validateBusinessRules garanti etmiş; DTO'dan al.
   */
  private auctionFieldsFor(dto: CreateTenderDto) {
    if (dto.type === "ENGLISH_AUCTION") {
      return {
        bidVisibility: dto.bidVisibility!,
        priceDecrementType: dto.priceDecrementType!,
        priceDecrementValue: dto.priceDecrementValue!,
        priceDecrementBasis: dto.priceDecrementBasis ?? DecrementBasisDto.OWN_LAST_BID,
        decimalPlaces: dto.decimalPlaces ?? 2,
        sendClosingReminder: dto.sendClosingReminder ?? false,
        reminderMinutesBefore: dto.reminderMinutesBefore ?? 60,
        autoExtendOnLateBid: dto.autoExtendOnLateBid ?? true,
        autoExtendThresholdMin: dto.autoExtendThresholdMin ?? 2,
        autoExtendByMinutes: dto.autoExtendByMinutes ?? 2,
        // ENGLISH_AUCTION ⇒ tedarikçi isimleri her zaman gizli
        isSealedBid: true,
      };
    }
    // RFQ: decrement/auto-extend yok, sealed-bid alıcı seçimine bırakılır.
    return {
      bidVisibility: "OWN_ONLY" as const,
      priceDecrementType: null,
      priceDecrementValue: null,
      priceDecrementBasis: null,
      decimalPlaces: dto.decimalPlaces ?? 2,
      sendClosingReminder: dto.sendClosingReminder ?? false,
      reminderMinutesBefore: dto.reminderMinutesBefore ?? 60,
      autoExtendOnLateBid: false,
      autoExtendThresholdMin: 2,
      autoExtendByMinutes: 2,
      isSealedBid: dto.isSealedBid,
    };
  }

  /**
   * Lojistik kategorisi mi? UNSPSC Segment 78 (Nakliye/Depolama/Posta) altındaki
   * tüm kodlar "78" ile başlar. Seçilen kategorilerden biri lojistikse ihale
   * otomatik lojistik olur (ayrı tür/seçim yok).
   */
  private async deriveIsLogistics(categoryIds: string[]): Promise<boolean> {
    if (categoryIds.length === 0) return false;
    const rows = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { code: true },
    });
    return rows.some((r) => r.code.startsWith("78"));
  }

  /**
   * Lojistik İhalesi — isLogistics + logisticsDetails normalize eder.
   * isLogistics kategoriden türetilir; true ise logistics zorunlu, değilse null.
   */
  private normalizeLogistics(
    isLogistics: boolean,
    dto: CreateTenderDto,
  ): {
    isLogistics: boolean;
    logisticsDetails: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } {
    if (!isLogistics) {
      return { isLogistics: false, logisticsDetails: Prisma.JsonNull };
    }
    const l = dto.logistics;
    if (!l) {
      throw new BadRequestException(
        "Lojistik ihalesi için taşıma bilgileri zorunludur",
      );
    }
    const details = {
      transportMode: l.transportMode,
      originCity: l.originCity.trim(),
      originDistrict: l.originDistrict?.trim() || null,
      originAddress: l.originAddress?.trim() || null,
      destinationCity: l.destinationCity.trim(),
      destinationDistrict: l.destinationDistrict?.trim() || null,
      destinationAddress: l.destinationAddress?.trim() || null,
      cargoType: l.cargoType.trim(),
      weightKg: l.weightKg ?? null,
      volumeM3: l.volumeM3 ?? null,
      packageCount: l.packageCount ?? null,
      vehicleType: l.vehicleType?.trim() || null,
      loadingDate: l.loadingDate ?? null,
      deliveryDate: l.deliveryDate ?? null,
      hazardous: !!l.hazardous,
      refrigerated: !!l.refrigerated,
      fragile: !!l.fragile,
      stackable: !!l.stackable,
      notes: l.notes?.trim() || null,
    };
    return {
      isLogistics: true,
      logisticsDetails: details as Prisma.InputJsonValue,
    };
  }

  private validateBusinessRules(dto: CreateTenderDto) {
    // V2-6 — primaryCurrency mutlaka allowedCurrencies içinde olmalı
    if (!dto.allowedCurrencies.includes(dto.primaryCurrency)) {
      throw new BadRequestException(
        "Ana para birimi seçilen para birimleri listesinde olmalı",
      );
    }
    // Duplicate currency check
    if (new Set(dto.allowedCurrencies).size !== dto.allowedCurrencies.length) {
      throw new BadRequestException(
        "Para birimi listesinde tekrar olmamalı",
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

    // V2-7 — Açık eksiltme decimal places sınırı
    if (dto.decimalPlaces != null && (dto.decimalPlaces < 0 || dto.decimalPlaces > 4)) {
      throw new BadRequestException("Ondalık basamak 0-4 arasında olmalı");
    }

    // V2-7 — İngiliz Usulü için ek kurallar
    if (dto.type === "ENGLISH_AUCTION") {
      if (!dto.bidVisibility) {
        throw new BadRequestException(
          "Açık eksiltme için görünürlük modu seçilmelidir",
        );
      }
      if (!dto.priceDecrementType) {
        throw new BadRequestException(
          "Açık eksiltme için fiyat azaltma tipi seçilmelidir",
        );
      }
      if (
        dto.priceDecrementValue == null ||
        Number(dto.priceDecrementValue) <= 0
      ) {
        throw new BadRequestException(
          "Açık eksiltme için fiyat azaltma değeri 0'dan büyük olmalı",
        );
      }
      if (
        dto.priceDecrementType === "PERCENT" &&
        Number(dto.priceDecrementValue) >= 100
      ) {
        throw new BadRequestException(
          "Yüzde azaltma 100'den küçük olmalı",
        );
      }
      // Açık eksiltmede tek para birimi → primaryCurrency
      if (dto.allowedCurrencies.length !== 1) {
        throw new BadRequestException(
          "Açık eksiltme tek para biriminde yapılır",
        );
      }
      // bidsOpenAt zorunlu — canlı yarışma için planlanmalı
      if (!dto.bidsOpenAt) {
        throw new BadRequestException(
          "Açık eksiltme için açılış tarihi zorunludur",
        );
      }
    }
  }

  /**
   * Adres ID'sinden snapshot çek + tip kontrolü (FATURA/TESLIMAT).
   * Snapshot tender'a JSON olarak yazılır; adres sonradan değişse bile
   * tender'da kayıtlı kalır.
   */
  private async snapshotForType(
    tenantId: string,
    addressId: string,
    expectedType: "FATURA" | "TESLIMAT",
  ): Promise<TenantAddressSnapshot> {
    const snapshot = await this.addressesService.getAddressSnapshot(
      tenantId,
      addressId,
    );
    if (snapshot.type !== expectedType) {
      throw new BadRequestException(
        expectedType === "FATURA"
          ? "Fatura adresi tipi yanlış (FATURA olmalı)"
          : "Teslimat adresi tipi yanlış (TESLIMAT olmalı)",
      );
    }
    return snapshot;
  }

  /**
   * Mevcut ihaleye tedarikçi davet ekle.
   * Kural:
   *   - DRAFT veya OPEN_FOR_BIDS olmalı (diğer durumlarda 409)
   *   - İngiliz Usulü + OPEN_FOR_BIDS + bidsCloseAt'a 2dk'dan az kaldıysa
   *     reddedilir (auto-extend ile davet karışıklığını önler)
   *   - Tedarikçi ACTIVE relation olmalı
   *   - Zaten davetli olanlar sessizce skip edilir
   *   - Yeni davetlere mail gönderilir
   */
  async addInvitations(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
    supplierIds: string[],
  ) {
    const existing = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        status: true,
        type: true,
        bidsCloseAt: true,
        publishedAt: true,
      },
    });
    if (!existing) throw new NotFoundException("İhale bulunamadı");
    if (existing.tenantId !== tenantId) throw new ForbiddenException();
    assertCanActOnTender(existing, { id: userId, role: userRole });

    if (existing.status !== "DRAFT" && existing.status !== "OPEN_FOR_BIDS") {
      throw new ConflictException(
        "Sadece taslak veya teklif toplama aşamasındaki ihalelere tedarikçi eklenebilir",
      );
    }

    // İngiliz Usulü + son 2dk: davet engelli
    if (
      existing.type === "ENGLISH_AUCTION" &&
      existing.status === "OPEN_FOR_BIDS" &&
      existing.bidsCloseAt
    ) {
      const msLeft = existing.bidsCloseAt.getTime() - Date.now();
      if (msLeft > 0 && msLeft < 2 * 60_000) {
        throw new ConflictException(
          "Kapanışa 2 dakikadan az kala İngiliz Usulü ihaleye tedarikçi eklenemez",
        );
      }
    }

    const uniqueIds = Array.from(new Set(supplierIds));

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveSuppliers(tx, tenantId, uniqueIds);

      // Zaten davetli olanları filtrele
      const alreadyInvited = await tx.tenderInvitation.findMany({
        where: { tenderId, supplierId: { in: uniqueIds } },
        select: { supplierId: true },
      });
      const existingSet = new Set(alreadyInvited.map((i) => i.supplierId));
      const toAdd = uniqueIds.filter((id) => !existingSet.has(id));

      if (toAdd.length === 0) {
        return { added: 0, skipped: uniqueIds.length, invitations: [] };
      }

      const newInvitations = await Promise.all(
        toAdd.map((supplierId) =>
          tx.tenderInvitation.create({
            data: {
              tenderId,
              supplierId,
              status: "PENDING",
            },
            select: {
              id: true,
              supplier: {
                select: {
                  id: true,
                  users: {
                    where: { isActive: true },
                    select: {
                      email: true,
                      firstName: true,
                      lastName: true,
                      createdAt: true,
                    },
                    orderBy: { createdAt: "asc" },
                    take: 1,
                  },
                },
              },
            },
          }),
        ),
      );

      // Tender + tenant info — mail dispatcher için
      const tenderFull = await tx.tender.findUnique({
        where: { id: tenderId },
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          bidsCloseAt: true,
          tenant: { select: { name: true } },
        },
      });
      if (tenderFull && existing.status === "OPEN_FOR_BIDS") {
        // Sadece yayındaysa hemen mail at; DRAFT ise yayında zaten dispatcher çalışacak
        this.dispatchInvitationEmails(
          {
            ...tenderFull,
            bidsCloseAt: tenderFull.bidsCloseAt!,
            invitations: newInvitations,
          },
          {
            tenderNumber: tenderFull.tenderNumber,
            bidsCloseAt: tenderFull.bidsCloseAt!,
          },
        ).catch((err) =>
          this.logger.error(
            `addInvitations email dispatch fail (${tenderId}): ${
              err instanceof Error ? err.message : err
            }`,
          ),
        );
      }

      return {
        added: toAdd.length,
        skipped: uniqueIds.length - toAdd.length,
        invitations: newInvitations.map((i) => ({ id: i.id, supplierId: i.supplier.id })),
      };
    });
  }

  /**
   * V2-7 — İhaleye e-posta ile tedarikçi daveti (kayıtsız veya bağlı olmayan
   * kayıtlı tedarikçi). SupplierInvitation(tenderId) oluşturulur; kabul edilince
   * otomatik TenderInvitation'a dönüşür. Tender doğrulaması + creator-gate burada.
   */
  async inviteByEmail(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
    dto: { email: string; contactName?: string; message?: string },
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        status: true,
        tenderNumber: true,
        title: true,
        bidsCloseAt: true,
        _count: { select: { items: true } },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId) throw new ForbiddenException();
    assertCanActOnTender(tender, { id: userId, role: userRole });

    if (tender.status !== "DRAFT" && tender.status !== "OPEN_FOR_BIDS") {
      throw new ConflictException(
        "Sadece taslak veya teklif toplama aşamasındaki ihalelere tedarikçi davet edilebilir",
      );
    }

    return this.supplierInvitations.createForTender(
      tenantId,
      userId,
      {
        id: tender.id,
        tenderNumber: tender.tenderNumber,
        title: tender.title,
        bidsCloseAt: tender.bidsCloseAt,
        itemCount: tender._count.items,
      },
      dto,
    );
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

    await Promise.allSettled(
      tender.invitations.map(async (invitation) => {
        const primary = invitation.supplier.users[0];
        if (!primary) {
          this.logger.warn(
            `Invitation ${invitation.id}: aktif primary user yok, e-posta atlandı`,
          );
          return;
        }

        try {
          await this.emailService.send({
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
      }),
    );
  }

  // ============================================================
  // E.5 — Eleme + kazandırma + sipariş oluşumu
  // ============================================================

  private webUrl(): string {
    return (this.config.get<string>("WEB_URL") ?? "http://localhost:3000")
      .replace(/\/$/, "");
  }

  /**
   * Alıcı tarafından SUBMITTED bir bid'in elenmesi → LOST + sebep + e-posta.
   * Tedarikçi ihale hâlâ açıksa "Yeniden Teklif Ver" akışına yönlenir.
   */
  async eliminateBid(
    tenantId: string,
    tenderId: string,
    bidId: string,
    reason: string,
    userId: string,
    userRole: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        include: { tenant: { select: { name: true } } },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      assertCanActOnTender(tender, { id: userId, role: userRole });

      const allowed: typeof tender.status[] = ["OPEN_FOR_BIDS", "IN_AWARD"];
      if (!allowed.includes(tender.status)) {
        throw new ConflictException(
          "Bu durumdaki ihalede teklif elenemez",
        );
      }

      const bid = await tx.bid.findUnique({
        where: { id: bidId },
        include: {
          supplier: {
            select: {
              id: true,
              users: {
                where: { isActive: true },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { email: true, firstName: true, lastName: true },
              },
            },
          },
        },
      });
      if (!bid || bid.tenderId !== tenderId)
        throw new NotFoundException("Teklif bulunamadı");
      if (bid.status !== "SUBMITTED")
        throw new ConflictException(
          "Sadece verilmiş (SUBMITTED) teklifler elenebilir",
        );

      const updated = await tx.bid.update({
        where: { id: bidId },
        data: {
          status: "LOST",
          eliminationReason: reason.trim(),
          eliminatedAt: new Date(),
        },
        select: { id: true, status: true, version: true },
      });

      return {
        updated,
        tender,
        primaryUser: bid.supplier.users[0] ?? null,
      };
    });

    // Fire-and-forget bilgilendirme
    this.dispatchEliminationEmail(
      result.tender,
      result.primaryUser,
    ).catch((err) =>
      this.logger.error(
        `Eleme e-postası başarısız (${tenderId}/${bidId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    return result.updated;
  }

  private async dispatchEliminationEmail(
    tender: {
      id: string;
      tenderNumber: string;
      title: string;
      status: TenderStatus;
      bidsCloseAt: Date;
      tenant: { name: string };
    },
    primaryUser:
      | { email: string; firstName: string; lastName: string }
      | null,
  ) {
    if (!primaryUser) return;
    const canResubmit =
      tender.status === "OPEN_FOR_BIDS" &&
      tender.bidsCloseAt.getTime() > Date.now();

    // Eleme sebebi e-posta payload'ında — tx kapandıktan sonra DB'den çekmiyoruz
    // (caller tx içinde update yaptı). Reason'ı tekrar fetch edelim:
    const fresh = await this.prisma.bid.findFirst({
      where: { tenderId: tender.id, status: "LOST" },
      orderBy: { eliminatedAt: "desc" },
      select: { eliminationReason: true },
    });
    const reason = fresh?.eliminationReason ?? "";

    const webUrl = this.webUrl();
    await this.emailService.send({
      to: {
        email: primaryUser.email,
        name: `${primaryUser.firstName} ${primaryUser.lastName}`,
      },
      templateData: {
        template: "bid_eliminated_supplier",
        data: {
          supplierUserName: `${primaryUser.firstName} ${primaryUser.lastName}`,
          tenantName: tender.tenant.name,
          tenderNumber: tender.tenderNumber,
          tenderTitle: tender.title,
          eliminationReason: reason,
          canResubmit,
          tenderUrl: `${webUrl}/supplier/ihaleler/${tender.id}`,
          submitNewBidUrl: `${webUrl}/supplier/ihaleler/${tender.id}/teklif-ver`,
        },
      },
      context: { type: "bid_eliminated_supplier", id: tender.id },
      subject: `🚫 Teklifiniz elendi: ${tender.title} — Supkeys`,
    });
  }

  /**
   * Toplu kazandırma — tek tedarikçi tüm kalemleri alır. Bid AWARDED_FULL,
   * BidItem'lar isWinner=true. Sipariş finalize'da oluşur.
   */
  async awardFull(
    tenantId: string,
    tenderId: string,
    bidId: string,
    userId: string,
    userRole: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        select: {
          id: true,
          tenantId: true,
          status: true,
          createdById: true,
          items: { select: { id: true } },
        },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      assertCanActOnTender(tender, { id: userId, role: userRole });
      if (tender.status !== "IN_AWARD")
        throw new ConflictException(
          "Sadece IN_AWARD durumundaki ihalede kazandırma yapılabilir",
        );

      const bid = await tx.bid.findUnique({
        where: { id: bidId },
        select: {
          id: true,
          tenderId: true,
          status: true,
          items: { select: { id: true } },
        },
      });
      if (!bid || bid.tenderId !== tenderId)
        throw new NotFoundException("Teklif bulunamadı");
      if (bid.status !== "SUBMITTED")
        throw new ConflictException(
          "Sadece verilmiş (SUBMITTED) teklif kazandırılabilir",
        );

      if (bid.items.length !== tender.items.length) {
        throw new BadRequestException(
          "Toplu kazandırma için tedarikçinin tüm kalemlere teklif vermesi gerekli. Kalem bazlı kazandırma kullanın.",
        );
      }

      // Önce tüm bid'lerin önceki winner flag'lerini temizle (yeniden çağrı senaryosu)
      await tx.bidItem.updateMany({
        where: { bid: { tenderId } },
        data: { isWinner: false },
      });
      await tx.bid.updateMany({
        where: {
          tenderId,
          status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] },
        },
        data: { status: "SUBMITTED" },
      });

      // Bu bid'in tüm kalemlerini isWinner=true yap
      await tx.bidItem.updateMany({
        where: { bidId },
        data: { isWinner: true },
      });
      await tx.bid.update({
        where: { id: bidId },
        data: { status: "AWARDED_FULL" },
      });

      return {
        bidId,
        bidStatus: "AWARDED_FULL" as const,
        winningItemCount: bid.items.length,
      };
    });
  }

  /**
   * Kalem bazlı kazandırma — her tenderItem için bir bid seçilir.
   * Tüm tender items için karar zorunlu.
   */
  async awardItemByItem(
    tenantId: string,
    tenderId: string,
    decisions: AwardItemDecisionDto[],
    userId: string,
    userRole: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        include: { items: true },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      assertCanActOnTender(tender, { id: userId, role: userRole });
      if (tender.status !== "IN_AWARD")
        throw new ConflictException(
          "Sadece IN_AWARD durumundaki ihalede kazandırma yapılabilir",
        );

      // Her tender item için karar zorunlu
      const tenderItemIds = new Set(tender.items.map((i) => i.id));
      const decidedItemIds = new Set(decisions.map((d) => d.tenderItemId));
      for (const itemId of tenderItemIds) {
        if (!decidedItemIds.has(itemId)) {
          const item = tender.items.find((i) => i.id === itemId);
          throw new BadRequestException(
            `"${item?.name ?? itemId}" kalemi için kazanan seçilmedi`,
          );
        }
      }
      // Yabancı tenderItemId
      for (const d of decisions) {
        if (!tenderItemIds.has(d.tenderItemId)) {
          throw new BadRequestException(
            "Geçersiz kalem seçimi (bu ihaleye ait olmayan kalem)",
          );
        }
      }

      // Decision'larda yer alan bid'leri yükle + her birinin
      // tenderItemId üzerine teklif verip vermediğini doğrula
      const bidIdsSet = new Set(decisions.map((d) => d.bidId));
      const bids = await tx.bid.findMany({
        where: {
          id: { in: [...bidIdsSet] },
          tenderId,
          status: { in: ["SUBMITTED", "LOST"] },
        },
        include: { items: { select: { id: true, tenderItemId: true } } },
      });
      const bidsById = new Map(bids.map((b) => [b.id, b] as const));

      for (const d of decisions) {
        const bid = bidsById.get(d.bidId);
        if (!bid) {
          throw new BadRequestException(
            "Geçersiz bid ID veya bu ihaleye ait değil",
          );
        }
        const bi = bid.items.find((x) => x.tenderItemId === d.tenderItemId);
        if (!bi) {
          throw new BadRequestException(
            "Seçilen tedarikçi bu kaleme teklif vermemiş",
          );
        }
      }

      // Eski kazanım bayraklarını sıfırla
      await tx.bidItem.updateMany({
        where: { bid: { tenderId } },
        data: { isWinner: false },
      });

      // Yeni kararları işle
      for (const d of decisions) {
        const bid = bidsById.get(d.bidId)!;
        const bi = bid.items.find((x) => x.tenderItemId === d.tenderItemId)!;
        await tx.bidItem.update({
          where: { id: bi.id },
          data: { isWinner: true },
        });
      }

      // Her bid için yeni status hesapla — sadece SUBMITTED/AWARDED-* arasında
      // gezerek (LOST'a el sürmüyoruz: zaten elenmiş veya kapanışta düşmüş)
      const livingBids = await tx.bid.findMany({
        where: {
          tenderId,
          status: { in: ["SUBMITTED", "AWARDED_FULL", "AWARDED_PARTIAL"] },
        },
        include: { items: { select: { isWinner: true } } },
      });

      for (const bid of livingBids) {
        const winning = bid.items.filter((bi) => bi.isWinner).length;
        let next: BidStatus;
        if (winning === 0) next = "SUBMITTED"; // finalize'da LOST'a düşer
        else if (winning === tender.items.length) next = "AWARDED_FULL";
        else next = "AWARDED_PARTIAL";

        if (next !== bid.status) {
          await tx.bid.update({ where: { id: bid.id }, data: { status: next } });
        }
      }

      return { decisions: decisions.length };
    });
  }

  /**
   * Kazandırmayı tamamla — Tender IN_AWARD'dayken çağrılır.
   * Aktif TENDER_AWARD kuralı varsa: ApprovalRequest oluşturur, Tender →
   * IN_AWARD_APPROVAL'a geçer ve ilk approver'a e-posta gider. Onay
   * tamamlanınca event listener `executeFinalizeAward()` çalıştırır.
   * Kural yoksa direkt finalize edilir (tüm SUBMITTED → LOST, Order create,
   * e-postalar).
   */
  async finalizeAward(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
  ) {
    // 1) Tender + bids ön kontrol (transaction dışında — onay branch'inde
    // büyük include'a girmeye gerek yok).
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdById: true,
        primaryCurrency: true,
        bids: {
          where: { status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] } },
          select: {
            id: true,
            items: { select: { isWinner: true, totalPrice: true } },
          },
        },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(tender, { id: userId, role: userRole });
    if (tender.status !== "IN_AWARD")
      throw new ConflictException(
        "Sadece IN_AWARD durumundaki ihale tamamlanabilir",
      );
    if (tender.bids.length === 0) {
      throw new BadRequestException(
        "Kazandırmayı tamamlamak için en az 1 kazanan teklif olmalı",
      );
    }

    // 2) Toplam award tutarı = Σ winning items totalPrice (tüm kazanan bidler)
    const totalAwardAmount = tender.bids.reduce((sum, bid) => {
      const winSum = bid.items
        .filter((bi) => bi.isWinner && bi.totalPrice != null)
        .reduce((s, bi) => s + Number(bi.totalPrice), 0);
      return sum + winSum;
    }, 0);

    // 3) Kural eşleşmesi
    const approvalRequest = await this.prisma.$transaction(async (tx) => {
      if (totalAwardAmount <= 0) return null;
      return this.approvalRequests.findMatchAndCreate(tx, {
        tenantId,
        tenderId,
        type: "TENDER_AWARD",
        amount: totalAwardAmount,
        currency: tender.primaryCurrency || "TRY",
        initiatedById: userId,
      });
    });

    // 4a) Onay var → Tender IN_AWARD_APPROVAL + e-posta
    if (approvalRequest) {
      await this.prisma.tender.update({
        where: { id: tenderId },
        data: { status: "IN_AWARD_APPROVAL" },
      });

      this.approvalRequests
        .sendApprovalRequiredEmailForRequest(approvalRequest.id)
        .catch((err) =>
          this.logger.error(
            `Initial approval_required dispatch failed for ${approvalRequest.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );

      return {
        tenderStatus: "IN_AWARD_APPROVAL" as const,
        approvalRequestId: approvalRequest.id,
        approvalNumber: approvalRequest.approvalNumber,
        totalAmount: totalAwardAmount,
      };
    }

    // 4b) Onay yok → direkt finalize
    const result = await this.executeFinalizeAward(tenderId, tenantId);

    this.dispatchAwardEmails(result).catch((err) =>
      this.logger.error(
        `Award e-postaları başarısız (${tenderId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    void this.audit.log({
      action: "tender.awarded",
      actorType: "tenant",
      actorId: userId,
      tenantId,
      entityType: "tender",
      entityId: tenderId,
      metadata: {
        totalAmount: totalAwardAmount,
        currency: tender.primaryCurrency || "TRY",
        orderCount: result.winners.length,
        orderNumbers: result.winners.map((c) => c.order.orderNumber),
        viaApproval: false,
      },
    });

    return {
      tenderStatus: "AWARDED" as const,
      orderCount: result.winners.length,
      orders: result.winners.map((c) => ({
        id: c.order.id,
        orderNumber: c.order.orderNumber,
      })),
    };
  }

  /**
   * Onay APPROVED olduktan sonra approval-requests-service event tetikler;
   * burası dinler ve `executeFinalizeAward`'ı çalıştırır.
   */
  @OnEvent(APPROVAL_EVENT.AWARD_APPROVED)
  async handleAwardApproved(payload: ApprovalApprovedEvent) {
    let result: Awaited<ReturnType<typeof this.executeFinalizeAward>>;
    try {
      // Tenant'ı tender'dan oku (bu noktada hala IN_AWARD'da çünkü
      // approval-requests-service onaylandığında AWARD branch'inde tender
      // status'unu değiştirmiyor; finalize burada yapılır).
      const tenderRow = await this.prisma.tender.findUnique({
        where: { id: payload.tenderId },
        select: { tenantId: true, status: true, tenderNumber: true },
      });
      if (!tenderRow) {
        this.logger.warn(
          `handleAwardApproved: tender ${payload.tenderId} bulunamadı`,
        );
        return;
      }
      // Idempotency: zaten AWARDED ise atla
      if (tenderRow.status === "AWARDED") {
        this.logger.warn(
          `handleAwardApproved: tender ${tenderRow.tenderNumber} zaten AWARDED — atlandı`,
        );
        return;
      }
      // IN_AWARD'a geri çek (approval reverted etmedi, ama state yine de
      // IN_AWARD beklenir; finalize methodu bu state'i şart koşar).
      if (tenderRow.status !== "IN_AWARD") {
        await this.prisma.tender.update({
          where: { id: payload.tenderId },
          data: { status: "IN_AWARD" },
        });
      }

      result = await this.executeFinalizeAward(
        payload.tenderId,
        tenderRow.tenantId,
      );

      void this.audit.log({
        action: "tender.awarded",
        actorType: "tenant",
        tenantId: tenderRow.tenantId,
        entityType: "tender",
        entityId: payload.tenderId,
        metadata: {
          orderCount: result.winners.length,
          orderNumbers: result.winners.map((c) => c.order.orderNumber),
          viaApproval: true,
        },
      });
    } catch (err) {
      this.logger.error(
        `Post-approval finalize failed for ${payload.tenderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    try {
      await this.dispatchAwardEmails(result);
    } catch (err) {
      this.logger.error(
        `Post-approval award e-postaları başarısız (${payload.tenderId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Asıl finalize transaction'ı — `finalizeAward` (onaysız) ve
   * `handleAwardApproved` (onaylı) tarafından paylaşılır.
   */
  private async executeFinalizeAward(tenderId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        include: {
          items: { select: { id: true } },
          tenant: { select: { name: true } },
          createdBy: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              isActive: true,
            },
          },
          bids: {
            include: {
              supplier: {
                select: {
                  id: true,
                  companyName: true,
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
              items: {
                select: {
                  id: true,
                  tenderItemId: true,
                  unitPrice: true,
                  totalPrice: true,
                  isWinner: true,
                },
              },
            },
          },
        },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      if (tender.status !== "IN_AWARD")
        throw new ConflictException(
          "Sadece IN_AWARD durumundaki ihale tamamlanabilir",
        );

      const winningBids = tender.bids.filter(
        (b) => b.status === "AWARDED_FULL" || b.status === "AWARDED_PARTIAL",
      );
      if (winningBids.length === 0) {
        throw new BadRequestException(
          "Kazandırmayı tamamlamak için en az 1 kazanan teklif olmalı",
        );
      }

      await tx.bid.updateMany({
        where: { tenderId, status: "SUBMITTED" },
        data: { status: "LOST" },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: { status: "AWARDED", awardedAt: new Date() },
      });

      const created: Array<{
        order: { id: string; orderNumber: string; totalAmount: Prisma.Decimal };
        bid: typeof winningBids[number];
        winningItemCount: number;
      }> = [];

      for (const bid of winningBids) {
        const winningItems = bid.items.filter(
          (bi) => bi.isWinner && bi.totalPrice != null,
        );
        if (winningItems.length === 0) continue;

        const orderTotal = winningItems.reduce(
          (sum, bi) => sum + Number(bi.totalPrice),
          0,
        );

        const orderNumber = await generateOrderNumber(tx);
        const order = await tx.order.create({
          data: {
            orderNumber,
            tenantId,
            supplierId: bid.supplierId,
            tenderId,
            bidId: bid.id,
            status: "PENDING",
            currency: bid.currency,
            totalAmount: orderTotal,
          },
          select: { id: true, orderNumber: true, totalAmount: true },
        });

        created.push({
          order,
          bid,
          winningItemCount: winningItems.length,
        });
      }

      const losingBids = tender.bids.filter(
        (b) => b.status === "LOST" && b.eliminationReason == null,
      );

      return {
        tender,
        winners: created,
        losers: losingBids,
        totalSpend: created.reduce(
          (sum, c) => sum + Number(c.order.totalAmount),
          0,
        ),
      };
    });
  }

  private async dispatchAwardEmails(payload: {
    tender: {
      id: string;
      tenderNumber: string;
      title: string;
      primaryCurrency: string;
      tenant: { name: string };
      createdBy: {
        email: string;
        firstName: string;
        lastName: string;
        isActive: boolean;
      };
      items: Array<{ id: string }>;
    };
    winners: Array<{
      order: { id: string; orderNumber: string; totalAmount: Prisma.Decimal };
      bid: {
        currency: string;
        supplier: {
          companyName: string;
          users: Array<{
            email: string;
            firstName: string;
            lastName: string;
          }>;
        };
      };
      winningItemCount: number;
    }>;
    losers: Array<{
      supplier: {
        users: Array<{
          email: string;
          firstName: string;
          lastName: string;
        }>;
      };
    }>;
    totalSpend: number;
  }) {
    const tender = payload.tender;
    const totalItemsCount = tender.items.length;
    const webUrl = this.webUrl();
    const tasks: Promise<unknown>[] = [];

    // Kazananlar
    for (const w of payload.winners) {
      const user = w.bid.supplier.users[0];
      if (!user) continue;
      tasks.push(
        this.emailService.send({
          to: {
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
          },
          templateData: {
            template: "award_won_supplier",
            data: {
              supplierUserName: `${user.firstName} ${user.lastName}`,
              tenantName: tender.tenant.name,
              tenderNumber: tender.tenderNumber,
              tenderTitle: tender.title,
              orderNumber: w.order.orderNumber,
              winningItemsCount: w.winningItemCount,
              totalItemsCount,
              isFullWin: w.winningItemCount === totalItemsCount,
              totalAmount: Number(w.order.totalAmount),
              currency: w.bid.currency,
              orderUrl: `${webUrl}/supplier/siparisler/${w.order.id}`,
            },
          },
          context: { type: "award_won_supplier", id: w.order.id },
          subject: `🏆 Tebrikler! İhaleyi kazandınız: ${tender.title} — Supkeys`,
        }),
      );
    }

    // Kaybedenler (eliminate edilenler ZATEN haberdar — burada atlanır)
    for (const l of payload.losers) {
      const user = l.supplier.users[0];
      if (!user) continue;
      tasks.push(
        this.emailService.send({
          to: {
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
          },
          templateData: {
            template: "award_lost_supplier",
            data: {
              supplierUserName: `${user.firstName} ${user.lastName}`,
              tenantName: tender.tenant.name,
              tenderNumber: tender.tenderNumber,
              tenderTitle: tender.title,
              tenderUrl: `${webUrl}/supplier/ihaleler/${tender.id}`,
            },
          },
          context: { type: "award_lost_supplier", id: tender.id },
          subject: `İhale sonuçlandı: ${tender.title} — Supkeys`,
        }),
      );
    }

    // Alıcı özeti
    if (tender.createdBy.isActive) {
      tasks.push(
        this.emailService.send({
          to: {
            email: tender.createdBy.email,
            name: `${tender.createdBy.firstName} ${tender.createdBy.lastName}`,
          },
          templateData: {
            template: "award_completed_buyer",
            data: {
              buyerFirstName: tender.createdBy.firstName,
              tenderNumber: tender.tenderNumber,
              tenderTitle: tender.title,
              totalOrders: payload.winners.length,
              winnerCount: payload.winners.length,
              loserCount: payload.losers.length,
              totalSpend: payload.totalSpend,
              currency: tender.primaryCurrency,
              tenderUrl: `${webUrl}/dashboard/ihaleler/${tender.id}`,
            },
          },
          context: { type: "award_completed_buyer", id: tender.id },
          subject: `🎉 İhaleniz tamamlandı: ${tender.title} — Supkeys`,
        }),
      );
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Erken kapatma — alıcı bidsCloseAt'ı beklemeden OPEN_FOR_BIDS ihaleyi
   * manuel olarak IN_AWARD'a taşır. Cron'un yaptığı tüm yan etkileri
   * (PENDING davetler → EXPIRED, kapanış e-postaları) çalıştırır.
   */
  async closeBiddingEarly(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
  ): Promise<{ tenderStatus: "IN_AWARD" }> {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdById: true,
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(tender, { id: userId, role: userRole });
    if (tender.status !== "OPEN_FOR_BIDS")
      throw new ConflictException(
        `Sadece teklif alımındaki ihale erken kapatılabilir. Mevcut: ${tender.status}`,
      );

    await this.tenderScheduler.closeOpenBidding(tenderId);
    return { tenderStatus: "IN_AWARD" };
  }

  /**
   * V2-7 — Kapanış zamanını değiştir veya ihaleyi hemen kapat.
   * - closeNow=true → closeBiddingEarly çağırılır (mevcut akış).
   * - closeNow=false → bidsCloseAt güncellenir; gelecekte olmalı.
   * Her iki durumda da davetli tedarikçilere bilgilendirme e-postası gönderilir,
   * alıcı notu zorunlu ve doğrudan e-postada yer alır.
   */
  async changeClosingTime(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
    dto: {
      closeNow: boolean;
      newCloseAt?: string;
      note: string;
    },
  ): Promise<{
    status: "OPEN_FOR_BIDS" | "IN_AWARD";
    bidsCloseAt: Date;
    notifiedCount: number;
  }> {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdById: true,
        bidsCloseAt: true,
        tenderNumber: true,
        title: true,
        tenant: { select: { name: true } },
        invitations: {
          where: { status: { in: ["PENDING", "ACCEPTED"] } },
          select: {
            id: true,
            supplier: {
              select: {
                id: true,
                users: {
                  where: { isActive: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { email: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(tender, { id: userId, role: userRole });
    if (tender.status !== "OPEN_FOR_BIDS") {
      throw new ConflictException(
        `Sadece teklif alımındaki ihalenin kapanış zamanı değiştirilebilir. Mevcut: ${tender.status}`,
      );
    }
    if (!dto.note || dto.note.trim().length < 5) {
      throw new BadRequestException("Not en az 5 karakter olmalı");
    }

    const previousCloseAt = tender.bidsCloseAt;
    let newCloseAt: Date;

    if (dto.closeNow) {
      // Mevcut erken kapat akışı tüm yan etkileri (status → IN_AWARD,
      // PENDING davetler → EXPIRED, closure emails) çalıştırır.
      await this.tenderScheduler.closeOpenBidding(tenderId);
      newCloseAt = new Date();
    } else {
      if (!dto.newCloseAt) {
        throw new BadRequestException(
          "Yeni kapanış tarihi belirtilmedi",
        );
      }
      const parsed = new Date(dto.newCloseAt);
      if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
        throw new BadRequestException("Yeni kapanış tarihi gelecekte olmalı");
      }
      // bidsCloseAt güncelle; auto-extend idempotency reset edilir.
      await this.prisma.tender.update({
        where: { id: tenderId },
        data: {
          bidsCloseAt: parsed,
          closingReminderSentAt: null,
        },
      });
      newCloseAt = parsed;
    }

    // E-posta gönderimi (fire-and-forget; failure log'lanır ama tx etkilenmez)
    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    let notifiedCount = 0;
    const tasks: Promise<unknown>[] = [];
    for (const inv of tender.invitations) {
      const primary = inv.supplier.users[0];
      if (!primary) continue;
      notifiedCount++;
      tasks.push(
        this.emailService.send({
          to: {
            email: primary.email,
            name: `${primary.firstName} ${primary.lastName}`,
          },
          templateData: {
            template: "tender_closing_time_changed",
            data: {
              supplierUserName: `${primary.firstName} ${primary.lastName}`,
              tenantName: tender.tenant.name,
              tenderNumber: tender.tenderNumber,
              tenderTitle: tender.title,
              closedImmediately: dto.closeNow,
              previousCloseAt: previousCloseAt.toISOString(),
              newCloseAt: newCloseAt.toISOString(),
              note: dto.note.trim(),
              tenderUrl: `${webUrl}/supplier/ihaleler/${tender.id}`,
            },
          },
          context: { type: "tender_closing_time_changed", id: inv.id },
          subject: dto.closeNow
            ? `🔒 İhale kapatıldı: ${tender.title} — Supkeys`
            : `⏰ Kapanış zamanı değişti: ${tender.title} — Supkeys`,
        }),
      );
    }
    Promise.allSettled(tasks).catch(() => {
      // ignore — Promise.allSettled aslında reject etmez ama tip için
    });

    return {
      status: dto.closeNow ? "IN_AWARD" : "OPEN_FOR_BIDS",
      bidsCloseAt: newCloseAt,
      notifiedCount,
    };
  }

  /**
   * IN_AWARD durumundaki ihaleyi kazanan olmadan kapat —
   * tüm SUBMITTED bid'ler LOST, tender → CLOSED_NO_AWARD.
   */
  async closeNoAward(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
    dto: CloseNoAwardDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findUnique({
        where: { id: tenderId },
        select: {
          id: true,
          tenantId: true,
          status: true,
          createdById: true,
        },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");
      if (tender.tenantId !== tenantId)
        throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
      assertCanActOnTender(tender, { id: userId, role: userRole });
      if (tender.status !== "IN_AWARD")
        throw new ConflictException(
          "Sadece IN_AWARD durumundaki ihale kazansız kapatılabilir",
        );

      await tx.bid.updateMany({
        where: { tenderId, status: "SUBMITTED" },
        data: { status: "LOST" },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: {
          status: "CLOSED_NO_AWARD",
          cancelledAt: new Date(),
          cancelReason: dto.reason?.trim() || null,
        },
      });

      return { tenderStatus: "CLOSED_NO_AWARD" as const };
    });
  }

  /**
   * V2-7+ — Tur zinciri (round history). Verilen tender'ın previousTenderId
   * zincirini geçmişe doğru gez, sonra nextRounds ile geleceğe doğru gez.
   * Sadece tenantId kapsamında. Sıralama: en eski tur → en yeni tur.
   */
  async getRoundHistory(tenantId: string, tenderId: string) {
    const SELECT = {
      id: true,
      tenderNumber: true,
      title: true,
      status: true,
      type: true,
      roundNumber: true,
      bidsOpenAt: true,
      bidsCloseAt: true,
      publishedAt: true,
      previousTenderId: true,
      createdAt: true,
    } as const;

    const seed = await this.prisma.tender.findFirst({
      where: { id: tenderId, tenantId },
      select: SELECT,
    });
    if (!seed) throw new NotFoundException("İhale bulunamadı");

    // Geçmiş — previousTenderId zincirini geri çök
    const past: typeof seed[] = [];
    let cursorId: string | null = seed.previousTenderId;
    const guard = new Set<string>([seed.id]);
    while (cursorId && !guard.has(cursorId)) {
      const prev = await this.prisma.tender.findFirst({
        where: { id: cursorId, tenantId },
        select: SELECT,
      });
      if (!prev) break;
      guard.add(prev.id);
      past.unshift(prev);
      cursorId = prev.previousTenderId;
    }

    // Gelecek — nextRounds (previousTenderId === current) zincirini ileri yürüt
    const future: typeof seed[] = [];
    let lastId: string = seed.id;
    while (true) {
      const next = await this.prisma.tender.findFirst({
        where: { previousTenderId: lastId, tenantId },
        select: SELECT,
      });
      if (!next || guard.has(next.id)) break;
      guard.add(next.id);
      future.push(next);
      lastId = next.id;
    }

    return {
      currentId: seed.id,
      rounds: [...past, seed, ...future],
    };
  }

  /**
   * V2-7+ — Alıcının dahili notunu günceller (internalNotes).
   * Statüden bağımsız çalışır; tedarikçilere yansımaz. Boş/null → temizle.
   */
  async updateNotes(
    tenantId: string,
    tenderId: string,
    userId: string,
    userRole: string,
    internalNotes: string | null,
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        status: true,
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId)
      throw new ForbiddenException("Bu ihaleye erişim yetkiniz yok");
    assertCanActOnTender(tender, { id: userId, role: userRole });

    // İhale tamamen kapanmışsa not güncellenmesin (audit izi netliği)
    const terminal = new Set(["CANCELLED", "AWARDED", "CLOSED_NO_AWARD"]);
    if (terminal.has(tender.status)) {
      throw new ConflictException(
        "Sonuçlanmış ihalede not güncellenemez",
      );
    }

    const trimmed = internalNotes?.trim() || null;
    await this.prisma.tender.update({
      where: { id: tenderId },
      data: { internalNotes: trimmed },
    });
    return { internalNotes: trimmed };
  }
}
