import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Satınalma panosu — İhale sekmesi verisi (ALIM ilanları). */
  async satinalma(user: AuthenticatedCompanyUser) {
    const companyId = user.companyId;

    const [openListings, awarded, ongoingOrders] = await Promise.all([
      this.prisma.listing.findMany({
        where: { companyId, type: "ALIM", status: "OPEN" },
        select: {
          id: true,
          number: true,
          title: true,
          createdAt: true,
          closesAt: true,
          createdById: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.listing.count({
        where: { companyId, type: "ALIM", status: "AWARDED" },
      }),
      this.prisma.companyOrder.count({
        where: {
          buyerCompanyId: companyId,
          status: {
            in: ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY", "DELIVERED"],
          },
        },
      }),
    ]);

    const openIds = openListings.map((l) => l.id);
    const bidsReceived =
      openIds.length > 0
        ? await this.prisma.listingBid.count({
            where: { listingId: { in: openIds }, status: "SUBMITTED" },
          })
        : 0;

    const row = (l: (typeof openListings)[number]) => ({
      id: l.id,
      tenderNumber: l.number ?? "—",
      title: l.title,
      openedAt: l.createdAt,
      closesAt: l.closesAt ?? l.createdAt,
    });

    return {
      openCount: openListings.length,
      bidsReceived,
      awarded,
      ongoingOrders,
      openTendersOwn: openListings
        .filter((l) => l.createdById === user.userId)
        .map(row),
      openTendersCompany: openListings.map(row),
    };
  }

  /** Satış panosu — İlan sekmesi verisi (SATIS ilanları). */
  async satis(user: AuthenticatedCompanyUser) {
    const companyId = user.companyId;

    const [openListings, awarded, ongoingOrders, myBids] = await Promise.all([
      this.prisma.listing.findMany({
        where: { companyId, type: "SATIS", status: "OPEN" },
        select: {
          id: true,
          number: true,
          title: true,
          createdAt: true,
          closesAt: true,
          createdById: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.listing.count({
        where: { companyId, type: "SATIS", status: "AWARDED" },
      }),
      this.prisma.companyOrder.count({
        where: {
          sellerCompanyId: companyId,
          status: {
            in: ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY", "DELIVERED"],
          },
        },
      }),
      this.prisma.listingBid.count({
        where: { bidderCompanyId: companyId, status: "SUBMITTED" },
      }),
    ]);

    const row = (l: (typeof openListings)[number]) => ({
      id: l.id,
      tenderNumber: l.number ?? "—",
      title: l.title,
      openedAt: l.createdAt,
      closesAt: l.closesAt ?? l.createdAt,
    });

    return {
      openCount: openListings.length,
      activeBids: myBids,
      awarded,
      ongoingOrders,
      openTendersOwn: openListings
        .filter((l) => l.createdById === user.userId)
        .map(row),
      openTendersCompany: openListings.map(row),
    };
  }
}
