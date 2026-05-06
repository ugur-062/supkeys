import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type InvitationActivity = {
  type: "invitation";
  timestamp: string;
  data: {
    id: string;
    status: string;
    tender: {
      id: string;
      tenderNumber: string;
      title: string;
      bidsCloseAt: string;
      status: string;
    };
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
    tender: {
      id: string;
      tenderNumber: string;
      title: string;
      status: string;
    };
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
    tenant: { id: string; name: string };
    tender: { id: string; tenderNumber: string };
  };
};

export type SupplierActivity =
  | InvitationActivity
  | BidActivity
  | OrderActivity;

@Injectable()
export class SupplierDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(supplierId: string) {
    const last30 = new Date(Date.now() - 30 * MS_PER_DAY);

    const [
      activeInvitations,
      activeBids,
      wonTenders,
      pendingOrders,
      totalRevenueAgg,
      bidsLast30,
      activeBuyers,
    ] = await Promise.all([
      this.prisma.tenderInvitation.count({
        where: {
          supplierId,
          status: "PENDING",
          tender: { status: "OPEN_FOR_BIDS" },
        },
      }),
      this.prisma.bid.count({
        where: { supplierId, status: "SUBMITTED" },
      }),
      this.prisma.bid.count({
        where: {
          supplierId,
          status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] },
        },
      }),
      this.prisma.order.count({
        where: { supplierId, status: "PENDING" },
      }),
      this.prisma.order.aggregate({
        where: { supplierId },
        _sum: { totalAmount: true },
      }),
      this.prisma.bid.count({
        where: {
          supplierId,
          submittedAt: { gte: last30 },
        },
      }),
      this.prisma.supplierTenantRelation.count({
        where: { supplierId, status: "ACTIVE" },
      }),
    ]);

    return {
      invitations: { active: activeInvitations },
      bids: { active: activeBids },
      wonTenders,
      orders: { pending: pendingOrders },
      revenue: { total: Number(totalRevenueAgg._sum.totalAmount ?? 0) },
      last30Days: { bidsSubmitted: bidsLast30 },
      buyers: { active: activeBuyers },
    };
  }

  async getRecentActivity(
    supplierId: string,
    limit = 10,
  ): Promise<SupplierActivity[]> {
    const [invitations, bids, orders] = await Promise.all([
      this.prisma.tenderInvitation.findMany({
        where: { supplierId, status: "PENDING" },
        orderBy: { invitedAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          invitedAt: true,
          tender: {
            select: {
              id: true,
              tenderNumber: true,
              title: true,
              bidsCloseAt: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.bid.findMany({
        where: { supplierId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          version: true,
          updatedAt: true,
          tender: {
            select: {
              id: true,
              tenderNumber: true,
              title: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.order.findMany({
        where: { supplierId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          tenant: { select: { id: true, name: true } },
          tender: { select: { id: true, tenderNumber: true } },
        },
      }),
    ]);

    const activities: SupplierActivity[] = [
      ...invitations.map<InvitationActivity>((i) => ({
        type: "invitation",
        timestamp: i.invitedAt.toISOString(),
        data: {
          id: i.id,
          status: i.status,
          tender: {
            ...i.tender,
            bidsCloseAt: i.tender.bidsCloseAt.toISOString(),
          },
        },
      })),
      ...bids.map<BidActivity>((b) => ({
        type: "bid",
        timestamp: b.updatedAt.toISOString(),
        data: {
          id: b.id,
          status: b.status,
          totalAmount: b.totalAmount.toString(),
          currency: b.currency,
          version: b.version,
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
          tenant: o.tenant,
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
