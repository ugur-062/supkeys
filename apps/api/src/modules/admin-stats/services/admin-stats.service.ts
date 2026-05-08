import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

interface DeltaCounter {
  total: number;
  newThisMonth: number;
  newLastMonth: number;
  deltaPercent: number;
}

export interface OverviewStats {
  tenants: DeltaCounter & { activeThisMonth: number };
  suppliers: DeltaCounter & { activeThisMonth: number };
  tenders: {
    total: number;
    openForBids: number;
    awarded: number;
    thisMonth: number;
    lastMonth: number;
    deltaPercent: number;
  };
  orders: {
    total: number;
    pending: number;
    inDelivery: number;
    completedThisMonth: number;
    completedLastMonth: number;
    deltaPercent: number;
  };
  approvalRequests: {
    totalPending: number;
    staleOver3Days: number;
  };
  emails: {
    sentLast24h: number;
    failedLast24h: number;
    failureRate: number;
    // V2-1 — Resend webhook breakdown (24h)
    deliveredLast24h: number;
    openedLast24h: number;
    bouncedLast24h: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<OverviewStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last24h = new Date(now.getTime() - DAY_MS);
    const threeDaysAgo = new Date(now.getTime() - 3 * DAY_MS);

    const [
      // Tenants
      totalTenants,
      newTenantsThisMonth,
      newTenantsLastMonth,
      activeTenantsThisMonth,
      // Suppliers
      totalSuppliers,
      newSuppliersThisMonth,
      newSuppliersLastMonth,
      activeSuppliersThisMonth,
      // Tenders
      totalTenders,
      openTenders,
      awardedTenders,
      tendersThisMonth,
      tendersLastMonth,
      // Orders
      totalOrders,
      pendingOrders,
      inDeliveryOrders,
      completedOrdersThisMonth,
      completedOrdersLastMonth,
      // Approval requests
      pendingApprovals,
      staleApprovals,
      // Emails
      emailsLast24h,
      failedEmailsLast24h,
      deliveredEmailsLast24h,
      openedEmailsLast24h,
      bouncedEmailsLast24h,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.tenant.count({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
      }),
      this.prisma.tenant.count({
        where: { users: { some: { lastLoginAt: { gte: startOfMonth } } } },
      }),

      this.prisma.supplier.count(),
      this.prisma.supplier.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.supplier.count({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
      }),
      this.prisma.supplier.count({
        where: { users: { some: { lastLoginAt: { gte: startOfMonth } } } },
      }),

      this.prisma.tender.count(),
      this.prisma.tender.count({ where: { status: "OPEN_FOR_BIDS" } }),
      this.prisma.tender.count({ where: { status: "AWARDED" } }),
      this.prisma.tender.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.tender.count({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
      }),

      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: "PENDING" } }),
      this.prisma.order.count({ where: { status: "IN_DELIVERY" } }),
      this.prisma.order.count({
        where: { status: "COMPLETED", completedAt: { gte: startOfMonth } },
      }),
      this.prisma.order.count({
        where: {
          status: "COMPLETED",
          completedAt: { gte: startOfLastMonth, lt: startOfMonth },
        },
      }),

      this.prisma.approvalRequest.count({ where: { status: "PENDING" } }),
      this.prisma.approvalRequest.count({
        where: { status: "PENDING", startedAt: { lt: threeDaysAgo } },
      }),

      this.prisma.emailLog.count({
        where: { queuedAt: { gte: last24h } },
      }),
      this.prisma.emailLog.count({
        where: { queuedAt: { gte: last24h }, status: "FAILED" },
      }),
      // V2-1 — webhook breakdown
      this.prisma.emailLog.count({
        where: { deliveredAt: { gte: last24h } },
      }),
      this.prisma.emailLog.count({
        where: { openedAt: { gte: last24h } },
      }),
      this.prisma.emailLog.count({
        where: { bouncedAt: { gte: last24h } },
      }),
    ]);

    return {
      tenants: {
        total: totalTenants,
        newThisMonth: newTenantsThisMonth,
        newLastMonth: newTenantsLastMonth,
        deltaPercent: deltaPercent(newTenantsThisMonth, newTenantsLastMonth),
        activeThisMonth: activeTenantsThisMonth,
      },
      suppliers: {
        total: totalSuppliers,
        newThisMonth: newSuppliersThisMonth,
        newLastMonth: newSuppliersLastMonth,
        deltaPercent: deltaPercent(
          newSuppliersThisMonth,
          newSuppliersLastMonth,
        ),
        activeThisMonth: activeSuppliersThisMonth,
      },
      tenders: {
        total: totalTenders,
        openForBids: openTenders,
        awarded: awardedTenders,
        thisMonth: tendersThisMonth,
        lastMonth: tendersLastMonth,
        deltaPercent: deltaPercent(tendersThisMonth, tendersLastMonth),
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        inDelivery: inDeliveryOrders,
        completedThisMonth: completedOrdersThisMonth,
        completedLastMonth: completedOrdersLastMonth,
        deltaPercent: deltaPercent(
          completedOrdersThisMonth,
          completedOrdersLastMonth,
        ),
      },
      approvalRequests: {
        totalPending: pendingApprovals,
        staleOver3Days: staleApprovals,
      },
      emails: {
        sentLast24h: emailsLast24h,
        failedLast24h: failedEmailsLast24h,
        failureRate:
          emailsLast24h > 0
            ? Math.round((failedEmailsLast24h / emailsLast24h) * 100)
            : 0,
        deliveredLast24h: deliveredEmailsLast24h,
        openedLast24h: openedEmailsLast24h,
        bouncedLast24h: bouncedEmailsLast24h,
      },
    };
  }

  async getRecentActivity(limit = 10): Promise<unknown> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    const [recentTenders, recentOrders, recentRegistrations] =
      await Promise.all([
        this.prisma.tender.findMany({
          take: safeLimit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            tenderNumber: true,
            title: true,
            status: true,
            createdAt: true,
            tenant: { select: { id: true, name: true } },
            createdBy: {
              select: { firstName: true, lastName: true },
            },
          },
        }),
        this.prisma.order.findMany({
          take: safeLimit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
            tenant: { select: { id: true, name: true } },
            supplier: { select: { id: true, companyName: true } },
          },
        }),
        this.prisma.tenant.findMany({
          take: safeLimit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            taxNumber: true,
            createdAt: true,
            users: {
              where: { role: "COMPANY_ADMIN" },
              select: { firstName: true, lastName: true, email: true },
              take: 1,
            },
          },
        }),
      ]);

    return { recentTenders, recentOrders, recentRegistrations };
  }

  /**
   * 30 günlük tender oluşturma trendi. Postgres `DATE_TRUNC('day', ...)`
   * raw SQL. Tablo adı `tenders` (`@@map`'lendi); kolon adı `createdAt`
   * camelCase olarak quote'lanır.
   */
  async getTenderTrend(
    days = 30,
  ): Promise<Array<{ date: string; count: number }>> {
    const safeDays = Math.min(Math.max(1, days), 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - safeDays);
    startDate.setHours(0, 0, 0, 0);

    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM tenders
      WHERE "createdAt" >= ${startDate}
      GROUP BY day
      ORDER BY day ASC
    `;

    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.day.toISOString().split("T")[0];
      map.set(key, Number(r.count));
    }

    const trend: Array<{ date: string; count: number }> = [];
    for (let i = safeDays; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().split("T")[0];
      trend.push({ date: key, count: map.get(key) ?? 0 });
    }
    return trend;
  }
}

function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
