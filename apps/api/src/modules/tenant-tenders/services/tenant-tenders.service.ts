import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ListTendersDto } from "../dto/list-tenders.dto";

@Injectable()
export class TenantTendersService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Bid stats — kapalı zarf gereği sadece sayım, tedarikçi/teklif içeriği yok
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
        total: tender._count.bids,
        submitted: byStatus.SUBMITTED ?? 0,
        draft: byStatus.DRAFT ?? 0,
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
}
