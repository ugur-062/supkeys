import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Firmanın siparişleri — hem satıcı hem alıcı olduğu, role etiketli. */
  async list(companyId: string) {
    const rows = await this.prisma.companyOrder.findMany({
      where: {
        OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }],
      },
      include: {
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
        listing: { select: { title: true, type: true, number: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((o) => this.serialize(o, companyId));
  }

  async getOne(user: AuthenticatedCompanyUser, id: string) {
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      include: {
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
        listing: { select: { title: true, type: true, number: true } },
      },
    });
    if (
      !o ||
      (o.sellerCompanyId !== user.companyId &&
        o.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    return this.serialize(o, user.companyId);
  }

  private serialize(
    o: {
      id: string;
      number: string | null;
      amount: { toString(): string };
      status: string;
      sellerCompanyId: string;
      seller: { name: string };
      buyer: { name: string };
      listing: { title: string; number: string | null } | null;
      createdAt: Date;
    },
    companyId: string,
  ) {
    const iAmSeller = o.sellerCompanyId === companyId;
    return {
      id: o.id,
      number: o.number,
      amount: o.amount.toString(),
      status: o.status,
      role: iAmSeller ? ("seller" as const) : ("buyer" as const),
      counterparty: iAmSeller ? o.buyer.name : o.seller.name,
      listingTitle: o.listing?.title ?? null,
      listingNumber: o.listing?.number ?? null,
      createdAt: o.createdAt,
    };
  }
}
