import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

export interface InboxItem {
  kind: "connection" | "bids" | "order_ship" | "order_receive" | "order_pay";
  emoji: string;
  title: string;
  actionLabel: string;
  href: string;
}

/**
 * "İşlerim" — bekleyen tüm işleri tek akışta toplar (alış+satış karışık,
 * etiketli). Bağlantı davetleri + ilanına gelen teklifler + sipariş adımları.
 */
@Injectable()
export class CompanyInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(user: AuthenticatedCompanyUser): Promise<InboxItem[]> {
    const companyId = user.companyId;
    const items: InboxItem[] = [];

    // 1. Gelen bağlantı davetleri
    const invites = await this.prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId, status: "PENDING" },
      include: { inviter: { select: { name: true } } },
    });
    for (const inv of invites) {
      items.push({
        kind: "connection",
        emoji: "🔗",
        title: `${inv.inviter.name} bağlantı daveti gönderdi`,
        actionLabel: "Görüntüle",
        href: "/company/satinalma/tedarikcilerim",
      });
    }

    // 2. İlanlarıma gelen teklifler (OPEN + SUBMITTED teklif var)
    const myOpen = await this.prisma.listing.findMany({
      where: { companyId, status: "OPEN" },
      select: { id: true, title: true, type: true },
    });
    const ids = myOpen.map((l) => l.id);
    const groups =
      ids.length > 0
        ? await this.prisma.listingBid.groupBy({
            by: ["listingId"],
            where: { listingId: { in: ids }, status: "SUBMITTED" },
            _count: true,
          })
        : [];
    const countByListing = new Map(groups.map((g) => [g.listingId, g._count]));
    for (const l of myOpen) {
      const c = countByListing.get(l.id) ?? 0;
      if (c > 0) {
        items.push({
          kind: "bids",
          emoji: l.type === "ALIM" ? "🔵" : "🟢",
          title: `"${l.title}" ilanına ${c} teklif geldi`,
          actionLabel: "İncele & Kazandır",
          href: `/company/ilan/${l.id}`,
        });
      }
    }

    // 3. Sipariş adımları
    const orders = await this.prisma.companyOrder.findMany({
      where: {
        OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }],
        status: {
          in: ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY", "DELIVERED"],
        },
      },
      include: { listing: { select: { title: true } } },
    });
    for (const o of orders) {
      const isSeller = o.sellerCompanyId === companyId;
      const name = o.listing?.title ?? "Sipariş";
      const href = `/company/siparis/${o.id}`;
      if (isSeller && o.status === "PENDING") {
        items.push({
          kind: "order_ship",
          emoji: "🟢",
          title: `"${name}" siparişini onayla`,
          actionLabel: "Onayla / Reddet",
          href,
        });
      } else if (
        isSeller &&
        (o.status === "ACCEPTED" || o.status === "CREATED")
      ) {
        items.push({
          kind: "order_ship",
          emoji: "🟢",
          title: `"${name}" siparişini kargola`,
          actionLabel: "Gönder",
          href,
        });
      } else if (!isSeller && o.status === "IN_DELIVERY") {
        items.push({
          kind: "order_receive",
          emoji: "🔵",
          title: `"${name}" siparişini teslim al`,
          actionLabel: "Teslim Al",
          href,
        });
      } else if (!isSeller && o.status === "DELIVERED") {
        items.push({
          kind: "order_pay",
          emoji: "🔵",
          title: `"${name}" ödemesini tamamla`,
          actionLabel: "Tamamla",
          href,
        });
      }
    }

    return items;
  }
}
