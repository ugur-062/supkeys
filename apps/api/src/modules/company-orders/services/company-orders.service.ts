import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CompanyOrderStatus } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Satıcı kargoya verir: CREATED → IN_DELIVERY. */
  ship(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "seller",
      from: "CREATED",
      to: "IN_DELIVERY",
    });
  }

  /** Alıcı teslim alır: IN_DELIVERY → DELIVERED. */
  receive(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "buyer",
      from: "IN_DELIVERY",
      to: "DELIVERED",
    });
  }

  /** Alıcı ödemeyi onaylar/tamamlar: DELIVERED → COMPLETED. */
  complete(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "buyer",
      from: "DELIVERED",
      to: "COMPLETED",
    });
  }

  private async transition(
    user: AuthenticatedCompanyUser,
    id: string,
    rule: {
      side: "seller" | "buyer";
      from: CompanyOrderStatus;
      to: CompanyOrderStatus;
    },
  ) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        sellerCompanyId: true,
        buyerCompanyId: true,
      },
    });
    if (
      !order ||
      (order.sellerCompanyId !== user.companyId &&
        order.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    const isSeller = order.sellerCompanyId === user.companyId;
    const allowed = rule.side === "seller" ? isSeller : !isSeller;
    if (!allowed) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    if (order.status !== rule.from) {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    await this.prisma.companyOrder.update({
      where: { id },
      data: { status: rule.to },
    });
    return { ok: true, status: rule.to };
  }

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
        items: true,
      },
    });
    if (
      !o ||
      (o.sellerCompanyId !== user.companyId &&
        o.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    return {
      ...this.serialize(o, user.companyId),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity.toString(),
        unit: it.unit,
        unitPrice: it.unitPrice.toString(),
      })),
    };
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
