import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, TenderStatus } from "@supkeys/db";
import { rangeToSinceDate } from "../../../common/filters/date-range";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { buildBreadcrumb } from "../../categories/services/category.service";
import { ExchangeRateService } from "../../currency/services/exchange-rate.service";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  // ============================================================
  // FILTER OPTIONS (toolbar dropdown'ları için)
  // ============================================================

  /** Tedarikçinin davet edildiği distinct alıcılar — tenderCount azalan. */
  async distinctTenants(supplierId: string) {
    const groups = await this.prisma.tender.groupBy({
      by: ["tenantId"],
      where: { invitations: { some: { supplierId } } },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: groups.map((g) => g.tenantId) } },
      select: { id: true, name: true },
    });
    const countById = new Map(groups.map((g) => [g.tenantId, g._count._all]));
    return tenants
      .map((t) => ({
        id: t.id,
        name: t.name,
        tenderCount: countById.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.tenderCount - a.tenderCount);
  }

  /** Tedarikçinin davet edildiği ihalelerde kullanılmış distinct kategoriler. */
  async distinctCategories(supplierId: string) {
    const groups = await this.prisma.tenderCategory.groupBy({
      by: ["categoryId"],
      where: { tender: { invitations: { some: { supplierId } } } },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const ids = groups.map((g) => g.categoryId);
    const cats = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameTr: true, level: true },
    });
    const countById = new Map(groups.map((g) => [g.categoryId, g._count._all]));
    return cats
      .map((c) => ({
        id: c.id,
        breadcrumb: c.nameTr, // sadeleştirilmiş: supplier tarafında full path opsiyonel
        level: c.level,
        tenderCount: countById.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.tenderCount - a.tenderCount);
  }

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
    // Alıcı (tenant) filtresi
    if (query.tenantId) where.tenantId = query.tenantId;
    // Kategori filtresi — tender.categories içinde ≥1 eşleşme
    if (query.categoryId) {
      where.categories = { some: { categoryId: query.categoryId } };
    }
    // Tarih aralığı (createdAt.gte). "all" verilirse filtre uygulanmaz.
    if (query.range && query.range !== "all") {
      const since = rangeToSinceDate(query.range);
      if (since) where.createdAt = { gte: since };
    }

    // Polish-1 — DTO whitelist'li sort. Geçersizse default
    // (yakın biten önce, sonra yeni → eski).
    const orderBy: Prisma.TenderOrderByWithRelationInput[] = (() => {
      const parts = (query.sort ?? "").split(":");
      const field = parts[0];
      const dir: Prisma.SortOrder = parts[1] === "asc" ? "asc" : "desc";
      if (field === "createdAt") return [{ createdAt: dir }];
      if (field === "bidsCloseAt") return [{ bidsCloseAt: dir }];
      return [{ bidsCloseAt: "asc" }, { createdAt: "desc" }];
    })();

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
          status: true,
          primaryCurrency: true,
          allowedCurrencies: true,
          bidsCloseAt: true,
          publishedAt: true,
          tenant: { select: { name: true } },
          categories: {
            include: {
              category: {
                include: {
                  parent: {
                    include: {
                      parent: {
                        include: {
                          parent: {
                            select: {
                              id: true,
                              nameTr: true,
                              segmentLetter: true,
                              level: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
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
        allowedCurrencies: t.allowedCurrencies,
        bidsCloseAt: t.bidsCloseAt,
        publishedAt: t.publishedAt,
        tenant: t.tenant,
        categories: t.categories.map((tc) => ({
          id: tc.category.id,
          code: tc.category.code,
          nameTr: tc.category.nameTr,
          level: tc.category.level,
          breadcrumb: buildBreadcrumb(tc.category),
        })),
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
        // Hedef birim fiyat alıcı tarafından konulur; tedarikçinin
        // bunu görmesi ürün gereği (rehber fiyat). Açıkça seçilir.
        items: {
          select: {
            id: true,
            tenderId: true,
            orderIndex: true,
            name: true,
            description: true,
            quantity: true,
            unit: true,
            materialCode: true,
            requiredByDate: true,
            targetUnitPrice: true,
            customQuestion: true,
            questions: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { orderIndex: "asc" },
        },
        attachments: { orderBy: { uploadedAt: "asc" } },
        categories: {
          include: {
            category: {
              include: {
                parent: {
                  include: {
                    parent: {
                      include: {
                        parent: {
                          select: {
                            id: true,
                            nameTr: true,
                            segmentLetter: true,
                            level: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
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

    // V2-7 — İngiliz Usulü açık eksiltme view (visibility'ye göre).
    const auctionView =
      tender.type === "ENGLISH_AUCTION"
        ? await this.computeAuctionView(
            tender.id,
            supplierId,
            tender.bidVisibility,
            myBid?.id ?? null,
          )
        : null;

    // V2-7 — Yeni Tur (LAZY carry) için önceki turun bid'i. AUTO modunda
    // myBid zaten DRAFT olarak gelir, bu yüzden sadece myBid yoksa lazım.
    let previousRoundBid: {
      tenderId: string;
      totalAmount: string;
      notes: string | null;
      items: Array<{
        tenderItemId: string;
        unitPrice: string | null;
        customAnswer: string | null;
      }>;
    } | null = null;
    if (tender.previousTenderId && !myBid) {
      // Önceki tender'daki kalem orderIndex'leri ile bu tender'daki kalem id'leri
      // eşle. Önceki bid item'larını yeni tender item id'lerine map'le.
      const prevTender = await this.prisma.tender.findUnique({
        where: { id: tender.previousTenderId },
        select: { items: { select: { id: true, orderIndex: true } } },
      });
      const prevBid = await this.prisma.bid.findUnique({
        where: {
          tenderId_supplierId: {
            tenderId: tender.previousTenderId,
            supplierId,
          },
        },
        select: {
          totalAmount: true,
          notes: true,
          items: {
            select: {
              tenderItemId: true,
              unitPrice: true,
              customAnswer: true,
            },
          },
        },
      });
      if (prevBid && prevTender) {
        const prevOrderById = new Map(
          prevTender.items.map((i) => [i.id, i.orderIndex]),
        );
        const newIdByOrder = new Map(
          tender.items.map((i) => [i.orderIndex, i.id]),
        );
        previousRoundBid = {
          tenderId: tender.previousTenderId,
          totalAmount: prevBid.totalAmount.toString(),
          notes: prevBid.notes,
          items: prevBid.items
            .map((bi) => {
              const order = prevOrderById.get(bi.tenderItemId);
              if (order === undefined) return null;
              const newItemId = newIdByOrder.get(order);
              if (!newItemId) return null;
              return {
                tenderItemId: newItemId,
                unitPrice: bi.unitPrice ? bi.unitPrice.toString() : null,
                customAnswer: bi.customAnswer,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null),
        };
      }
    }

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
      deliveryTerm: tender.deliveryTerm,
      deliveryAddress: tender.deliveryAddress,
      // E.7.B — tedarikçi teslimat adresi snapshot'ı görür.
      // Fatura adresi snapshot'ı kapalı zarf gereği gösterilmez (alıcı bilgisi).
      deliveryAddressSnapshot: tender.deliveryAddressSnapshot,
      paymentTerm: tender.paymentTerm,
      paymentDays: tender.paymentDays,
      publishedAt: tender.publishedAt,
      bidsOpenAt: tender.bidsOpenAt,
      bidsCloseAt: tender.bidsCloseAt,
      awardedAt: tender.awardedAt,
      cancelledAt: tender.cancelledAt,
      // V2-7 — açık eksiltme alanları (tedarikçi tarafına gerekli olanlar)
      bidVisibility: tender.bidVisibility,
      priceDecrementType: tender.priceDecrementType,
      priceDecrementValue: tender.priceDecrementValue,
      priceDecrementBasis: tender.priceDecrementBasis,
      decimalPlaces: tender.decimalPlaces,
      autoExtendOnLateBid: tender.autoExtendOnLateBid,
      autoExtendThresholdMin: tender.autoExtendThresholdMin,
      autoExtendByMinutes: tender.autoExtendByMinutes,
      tenant: tender.tenant,
      categories: tender.categories.map((tc) => ({
        id: tc.category.id,
        code: tc.category.code,
        nameTr: tc.category.nameTr,
        level: tc.category.level,
        breadcrumb: buildBreadcrumb(tc.category),
      })),
      items: tender.items,
      attachments: tender.attachments,
      myInvitation: invitation,
      myBid,
      auctionView,
      // V2-7 — Yeni Tur (LAZY) için önceki round bid'i; UI prefill için.
      previousRoundBid,
      previousTenderId: tender.previousTenderId ?? null,
      roundNumber: tender.roundNumber ?? 1,
    };
  }

  /**
   * V2-7 — Açık eksiltme görünürlük moduna göre tedarikçiye gösterilecek bilgi:
   * - bestTotal: ihaledeki en iyi SUBMITTED bid totalAmount'ı
   * - myRank: tedarikçinin sıralaması (1 = en iyi)
   * - participantCount: SUBMITTED bid sayısı
   * - allBids: anonim sıralı liste (sadece ALL modu)
   * Tüm modlarda tedarikçi adı/idsi ASLA dönmez.
   */
  private async computeAuctionView(
    tenderId: string,
    supplierId: string,
    visibility: string,
    myBidId: string | null,
  ): Promise<{
    bestTotal: number | null;
    myRank: number | null;
    participantCount: number | null;
    allBids: { rank: number; total: number; isMine: boolean }[] | null;
  } | null> {
    if (visibility === "OWN_ONLY") return null;

    // Sadece SUBMITTED biz ranking'e dahil
    const submittedBids = await this.prisma.bid.findMany({
      where: { tenderId, status: "SUBMITTED" },
      select: { id: true, supplierId: true, totalAmount: true },
      orderBy: { totalAmount: "asc" },
    });

    if (submittedBids.length === 0) {
      return {
        bestTotal: null,
        myRank: null,
        participantCount: 0,
        allBids: visibility === "ALL" ? [] : null,
      };
    }

    const totals = submittedBids.map((b) => Number(b.totalAmount));
    const bestTotal = totals[0];
    const myIdx = submittedBids.findIndex((b) => b.supplierId === supplierId);
    const myRank = myIdx >= 0 ? myIdx + 1 : null;
    const participantCount = submittedBids.length;

    const wantsBest =
      visibility === "BEST_PRICE" ||
      visibility === "BEST_AND_OWN_RANK" ||
      visibility === "ALL";
    const wantsRank =
      visibility === "OWN_RANK" ||
      visibility === "BEST_AND_OWN_RANK" ||
      visibility === "ALL";

    return {
      bestTotal: wantsBest ? bestTotal : null,
      myRank: wantsRank ? myRank : null,
      participantCount: wantsRank ? participantCount : null,
      allBids:
        visibility === "ALL"
          ? submittedBids.map((b, i) => ({
              rank: i + 1,
              total: Number(b.totalAmount),
              isMine: b.id === myBidId,
            }))
          : null,
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
                questions: true,
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

      // V2-3 — bid.currency artık her zaman tender.primaryCurrency.
      // DTO'dan gelen currency yok sayılır (cross-currency bid V2.5'e ertelendi).
      const bidCurrency = tender.primaryCurrency;

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
        // V2-7+ — çoklu+tipli sorular
        const questions = Array.isArray(tenderItem.questions)
          ? (tenderItem.questions as Array<{
              id: string;
              text: string;
              required: boolean;
            }>)
          : [];
        if (questions.length > 0) {
          const answerMap = new Map(
            (dtoItem.answers ?? []).map((a) => [
              a.questionId,
              (a.value ?? "").trim(),
            ]),
          );
          for (const q of questions) {
            if (q.required && !answerMap.get(q.id)) {
              throw new BadRequestException(
                `"${tenderItem.name}" kalemi için "${q.text}" sorusu zorunlu`,
              );
            }
          }
        } else if (
          // Legacy tek soru (eski ihaleler)
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

      // V2-7 refactor — ENGLISH_AUCTION için SUBMITTED bid düzenlenebilir
      // (canlı eksiltme akışı). RFQ akışı eski kuralı koruyor.
      const isAuction = tender.type === "ENGLISH_AUCTION";
      if (existing) {
        if (existing.status === "SUBMITTED" && !isAuction) {
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
        // RFQ: DRAFT/LOST düzenlenebilir
        // ENGLISH_AUCTION: DRAFT/LOST/SUBMITTED düzenlenebilir
      }

      // Toplam (sadece teklif verilen kalemler) — backend hesaplar
      const totalAmount = this.calculateTotalAmount(dto.items, tender.items);

      // V2-7+ — Açık eksiltme re-bid kuralı: fiyat HER ZAMAN düşürülmeli
      // (yükseltme/eşitleme yasak). Decrement tanımlıysa en az o kadar düşük.
      // Basis: OWN_LAST_BID (kendi son teklifi) | BEST_BID (ihaledeki en iyi teklif).
      if (isAuction && existing && existing.status === "SUBMITTED") {
        const previous = await tx.bid.findUnique({
          where: { id: existing.id },
          select: { totalAmount: true },
        });
        const previousTotal = Number(previous?.totalAmount ?? 0);

        // Referans tutar — BEST_BID ise mevcut en iyi SUBMITTED teklif (kendi
        // teklifinden de düşükse onu hedefle: "en iyiyi geç").
        let reference = previousTotal;
        const useBest = tender.priceDecrementBasis === "BEST_BID";
        if (useBest) {
          const best = await tx.bid.findFirst({
            where: { tenderId, status: "SUBMITTED" },
            orderBy: { totalAmount: "asc" },
            select: { totalAmount: true },
          });
          if (best) {
            reference = Math.min(previousTotal, Number(best.totalAmount));
          }
        }

        const decVal =
          tender.priceDecrementValue != null
            ? Number(tender.priceDecrementValue)
            : 0;
        const minDelta =
          tender.priceDecrementType === "PERCENT"
            ? reference * (decVal / 100)
            : decVal;
        const maxAllowed = reference - minDelta;
        const tol = 1e-4;
        // minDelta>0 → en az minDelta düşmeli; minDelta=0 → en azından kesinlikle düşmeli.
        const violates =
          minDelta > 0
            ? totalAmount > maxAllowed + tol
            : totalAmount >= previousTotal - tol;
        if (violates) {
          const refLabel = useBest
            ? "mevcut en iyi tekliften"
            : "önceki teklifinizden";
          throw new BadRequestException(
            minDelta <= 0
              ? "Açık eksiltmede fiyat yükseltilemez — yeni teklif öncekinden daha düşük olmalı."
              : tender.priceDecrementType === "PERCENT"
                ? `Yeni teklif ${refLabel} en az %${decVal} daha düşük olmalı (max ${maxAllowed.toFixed(4)} ${tender.primaryCurrency})`
                : `Yeni teklif ${refLabel} en az ${decVal} ${tender.primaryCurrency} düşük olmalı (max ${maxAllowed.toFixed(4)})`,
          );
        }
      }

      const bid = await tx.bid.upsert({
        where: { tenderId_supplierId: { tenderId, supplierId } },
        create: {
          tenderId,
          supplierId,
          submittedById: supplierUserId,
          status: "DRAFT",
          currency: bidCurrency,
          totalAmount,
          notes: dto.notes?.trim() || null,
          version: 1,
        },
        update: {
          currency: bidCurrency,
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
            currency: bidCurrency,
            customAnswer: i.customAnswer?.trim() || null,
            answers:
              i.answers && i.answers.length > 0
                ? i.answers.map((a) => ({
                    questionId: a.questionId,
                    value: (a.value ?? "").trim(),
                  }))
                : undefined,
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
        include: { items: true },
      });
      if (!bid) {
        throw new NotFoundException("Önce bir taslak oluşturmalısınız");
      }
      const isAuction = tender.type === "ENGLISH_AUCTION";
      if (bid.status === "SUBMITTED" && !isAuction) {
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
      // RFQ: DRAFT/LOST geçişi serbest
      // ENGLISH_AUCTION: DRAFT/LOST/SUBMITTED geçişi serbest (re-bid)
      // Not: decrement enforce'u saveOrUpdateBid yapar (yeni total yazılmadan
      // önce eski SUBMITTED total ile karşılaştırır). Submit aşamasında
      // total artık kayıtlı; ek kontrol gereksiz.

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

      if (tender.requireBidDocument) {
        // Yeni Attachment sistemi — scope=BID_RESPONSE, scopeRefId=bid.id
        const bidAttachmentCount = await tx.attachment.count({
          where: {
            scope: "BID_RESPONSE",
            scopeRefId: bid.id,
            status: "UPLOADED",
          },
        });
        if (bidAttachmentCount === 0) {
          throw new BadRequestException(
            "Bu ihalede en az 1 teklif dosyası yüklemek zorunludur",
          );
        }
      }

      // LOST → SUBMITTED: eleme sonrası yeniden teklif, version++ ve
      // eliminationReason/eliminatedAt temizlenir.
      // ENGLISH_AUCTION SUBMITTED → SUBMITTED: re-bid, version++ (her tur).
      const isResubmissionAfterElimination = bid.status === "LOST";
      const isAuctionRebid = isAuction && bid.status === "SUBMITTED";
      const bumpVersion = isResubmissionAfterElimination || isAuctionRebid;

      // V2-3 — submit anındaki TCMB kurunu snapshot olarak yaz.
      // bid.currency=TRY ise null kalır (gerek yok).
      const snapshot = await this.exchangeRateService.takeSnapshot(bid.currency);

      const updated = await tx.bid.update({
        where: { id: bid.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          version: bumpVersion ? bid.version + 1 : bid.version,
          eliminationReason: isResubmissionAfterElimination ? null : undefined,
          eliminatedAt: isResubmissionAfterElimination ? null : undefined,
          ...(snapshot && {
            exchangeRateSnapshot:
              snapshot as unknown as Prisma.InputJsonValue,
          }),
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

      // V2-7 — Auto-extend: son dakika gelen teklif kapanışı uzatır.
      let extendedTo: Date | null = null;
      if (isAuction && tender.autoExtendOnLateBid) {
        const now = new Date();
        const msLeft = tender.bidsCloseAt.getTime() - now.getTime();
        const thresholdMs = tender.autoExtendThresholdMin * 60_000;
        if (msLeft > 0 && msLeft < thresholdMs) {
          extendedTo = new Date(
            tender.bidsCloseAt.getTime() + tender.autoExtendByMinutes * 60_000,
          );
          await tx.tender.update({
            where: { id: tenderId },
            data: {
              bidsCloseAt: extendedTo,
              // Uzatma → hatırlatma e-postası tekrar gönderilebilsin
              closingReminderSentAt: null,
            },
          });
        }
      }

      return { ...updated, extendedTo };
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
