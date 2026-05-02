import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, TenderStatus } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
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
            select: { status: true },
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
}

// Re-export for controller's typecheck if needed
export { ForbiddenException };
