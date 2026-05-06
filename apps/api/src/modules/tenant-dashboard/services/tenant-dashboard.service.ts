import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TenderActivity = {
  type: "tender";
  timestamp: string;
  data: {
    id: string;
    tenderNumber: string;
    title: string;
    status: string;
  };
};

type BidActivity = {
  type: "bid";
  timestamp: string;
  data: {
    id: string;
    status: string;
    totalAmount: string;
    currency: string;
    version: number;
    supplier: { id: string; companyName: string };
    tender: { id: string; tenderNumber: string; title: string };
  };
};

type OrderActivity = {
  type: "order";
  timestamp: string;
  data: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    currency: string;
    supplier: { id: string; companyName: string };
    tender: { id: string; tenderNumber: string };
  };
};

export type TenantActivity = TenderActivity | BidActivity | OrderActivity;

@Injectable()
export class TenantDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const last30 = new Date(Date.now() - 30 * MS_PER_DAY);

    const [
      activeTenders,
      draftTenders,
      inAwardTenders,
      awardedTenders,
      activeSuppliers,
      pendingOrders,
      completedTendersLast30,
      totalSpendLast30,
      bidsReceivedLast30,
    ] = await Promise.all([
      this.prisma.tender.count({
        where: { tenantId, status: "OPEN_FOR_BIDS" },
      }),
      this.prisma.tender.count({ where: { tenantId, status: "DRAFT" } }),
      this.prisma.tender.count({ where: { tenantId, status: "IN_AWARD" } }),
      this.prisma.tender.count({ where: { tenantId, status: "AWARDED" } }),
      this.prisma.supplierTenantRelation.count({
        where: { tenantId, status: "ACTIVE" },
      }),
      this.prisma.order.count({
        where: { tenantId, status: "PENDING" },
      }),
      this.prisma.tender.count({
        where: {
          tenantId,
          status: "AWARDED",
          awardedAt: { gte: last30 },
        },
      }),
      this.prisma.order.aggregate({
        where: { tenantId, createdAt: { gte: last30 } },
        _sum: { totalAmount: true },
      }),
      this.prisma.bid.count({
        where: {
          tender: { tenantId },
          submittedAt: { gte: last30 },
          status: {
            in: [
              "SUBMITTED",
              "AWARDED_FULL",
              "AWARDED_PARTIAL",
              "LOST",
            ],
          },
        },
      }),
    ]);

    return {
      tenders: {
        active: activeTenders,
        draft: draftTenders,
        inAward: inAwardTenders,
        awarded: awardedTenders,
      },
      suppliers: { active: activeSuppliers },
      orders: { pending: pendingOrders },
      last30Days: {
        completedTenders: completedTendersLast30,
        totalSpend: Number(totalSpendLast30._sum.totalAmount ?? 0),
        bidsReceived: bidsReceivedLast30,
      },
    };
  }

  async getRecentActivity(
    tenantId: string,
    limit = 10,
  ): Promise<TenantActivity[]> {
    const [tenders, bids, orders] = await Promise.all([
      this.prisma.tender.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      }),
      this.prisma.bid.findMany({
        where: {
          tender: { tenantId },
          submittedAt: { not: null },
        },
        orderBy: { submittedAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          version: true,
          submittedAt: true,
          supplier: { select: { id: true, companyName: true } },
          tender: {
            select: { id: true, tenderNumber: true, title: true },
          },
        },
      }),
      this.prisma.order.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          supplier: { select: { id: true, companyName: true } },
          tender: { select: { id: true, tenderNumber: true } },
        },
      }),
    ]);

    const activities: TenantActivity[] = [
      ...tenders.map<TenderActivity>((t) => ({
        type: "tender",
        timestamp: t.updatedAt.toISOString(),
        data: {
          id: t.id,
          tenderNumber: t.tenderNumber,
          title: t.title,
          status: t.status,
        },
      })),
      ...bids.map<BidActivity>((b) => ({
        type: "bid",
        timestamp: b.submittedAt!.toISOString(),
        data: {
          id: b.id,
          status: b.status,
          totalAmount: b.totalAmount.toString(),
          currency: b.currency,
          version: b.version,
          supplier: b.supplier,
          tender: b.tender,
        },
      })),
      ...orders.map<OrderActivity>((o) => ({
        type: "order",
        timestamp: o.createdAt.toISOString(),
        data: {
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          totalAmount: o.totalAmount.toString(),
          currency: o.currency,
          supplier: o.supplier,
          tender: o.tender,
        },
      })),
    ];

    activities.sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
    );

    return activities.slice(0, limit);
  }
}
