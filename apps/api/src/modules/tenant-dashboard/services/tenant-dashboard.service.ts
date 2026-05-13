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

/** "Acme Tedarik Ltd." → "ACM..." anonymize edilmiş kısa görünüm (3 harf + ...) */
function shortenName(name: string): string {
  const cleaned = name.trim().toLocaleUpperCase("tr-TR");
  if (cleaned.length <= 3) return cleaned;
  return `${cleaned.slice(0, 3)}...`;
}

/** Bid status → approximate sıralama (top suppliers rank average için). */
function approximateRank(status: string): number {
  if (status === "AWARDED_FULL") return 1;
  if (status === "AWARDED_PARTIAL") return 1.5;
  if (status === "SUBMITTED") return 2; // sonuç belli değil
  return 2.5; // LOST
}

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

    // Deterministic shape — Prisma count'lar number, aggregate _sum nullable
    // olabilir (kayıt yoksa). Tüm alanlarda explicit ?? 0 fallback.
    return {
      tenders: {
        active: activeTenders ?? 0,
        draft: draftTenders ?? 0,
        inAward: inAwardTenders ?? 0,
        awarded: awardedTenders ?? 0,
      },
      suppliers: { active: activeSuppliers ?? 0 },
      orders: { pending: pendingOrders ?? 0 },
      last30Days: {
        completedTenders: completedTendersLast30 ?? 0,
        totalSpend: Number(totalSpendLast30?._sum?.totalAmount ?? 0),
        bidsReceived: bidsReceivedLast30 ?? 0,
      },
    };
  }

  // ============================================================
  // V2-6 — Dashboard tab endpoint'leri (İhale / Tasarruf / Tedarikçi)
  // ============================================================

  /**
   * İhale tab — 4 KPI sayacı + 2 alt-tab listesi (kullanıcının oluşturduğu /
   * firma genelindeki OPEN_FOR_BIDS ihaleleri).
   */
  async getIhaleTab(tenantId: string, userId: string) {
    const [
      closedForBids,
      inAward,
      awarded,
      ongoingOrders,
      openTendersOwn,
      openTendersCompany,
    ] = await Promise.all([
      // "Teklife Kapandı": kapanış geçmiş ama henüz kazandırma başlamamış
      // (= IN_AWARD veya CLOSED_NO_AWARD). Spec metni "teklife kapandı" diyor;
      // kullanıcının dikkatine gereken durum IN_AWARD'a yakın ama spec'in
      // numeric örneğinde sabit 63 var → IN_AWARD + CLOSED_NO_AWARD topla.
      this.prisma.tender.count({
        where: {
          tenantId,
          status: { in: ["IN_AWARD", "IN_AWARD_APPROVAL", "CLOSED_NO_AWARD"] },
        },
      }),
      this.prisma.tender.count({
        where: { tenantId, status: { in: ["IN_AWARD", "IN_AWARD_APPROVAL"] } },
      }),
      this.prisma.tender.count({ where: { tenantId, status: "AWARDED" } }),
      this.prisma.order.count({
        where: { tenantId, status: { in: ["PENDING", "IN_DELIVERY"] } },
      }),
      this.prisma.tender.findMany({
        where: { tenantId, status: "OPEN_FOR_BIDS", createdById: userId },
        orderBy: { bidsCloseAt: "asc" },
        take: 10,
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          publishedAt: true,
          bidsCloseAt: true,
          createdAt: true,
        },
      }),
      this.prisma.tender.findMany({
        where: { tenantId, status: "OPEN_FOR_BIDS" },
        orderBy: { bidsCloseAt: "asc" },
        take: 10,
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          publishedAt: true,
          bidsCloseAt: true,
          createdAt: true,
        },
      }),
    ]);

    const toRow = (t: (typeof openTendersOwn)[number]) => ({
      id: t.id,
      tenderNumber: t.tenderNumber,
      title: t.title,
      openedAt: (t.publishedAt ?? t.createdAt).toISOString(),
      closesAt: t.bidsCloseAt.toISOString(),
    });

    return {
      closedForBids,
      inAward,
      awarded,
      ongoingOrders,
      openTendersOwn: openTendersOwn.map(toRow),
      openTendersCompany: openTendersCompany.map(toRow),
    };
  }

  /**
   * Tasarruf tab — Bu Ay + Bu Yıl ayrı metrik setleri + top 5 + kategori +
   * para birimi kırılımları. Hesaplama: kazandırılan ihalelerin kazanan
   * kalemlerinde `targetUnitPrice - winningUnitPrice` farkı × awardedQuantity.
   * targetUnitPrice yoksa o kalem tasarruf 0.
   */
  async getTasarrufTab(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const since = new Date(yearStart); // hem yıl hem ay yıl başından sonradır
    const tenders = await this.prisma.tender.findMany({
      where: { tenantId, status: "AWARDED", awardedAt: { gte: since } },
      select: {
        id: true,
        tenderNumber: true,
        title: true,
        primaryCurrency: true,
        awardedAt: true,
        items: {
          select: { id: true, quantity: true, targetUnitPrice: true },
        },
        bids: {
          where: { status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] } },
          select: {
            items: {
              where: { isWinner: true },
              select: {
                tenderItemId: true,
                unitPrice: true,
                awardedQuantity: true,
              },
            },
          },
        },
        categories: {
          take: 1,
          include: {
            category: {
              include: {
                parent: {
                  include: {
                    parent: {
                      include: {
                        parent: {
                          select: {
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
        },
      },
    });

    // Tender bazlı toplam: savings + volume
    interface TenderAgg {
      id: string;
      tenderNumber: string;
      title: string;
      currency: string;
      awardedAt: Date;
      savings: number;
      volume: number;
      categoryLabel: string | null;
    }
    const aggregates: TenderAgg[] = tenders.map((t) => {
      let savings = 0;
      let volume = 0;
      const itemMap = new Map(t.items.map((i) => [i.id, i]));
      for (const bid of t.bids) {
        for (const bi of bid.items) {
          const item = itemMap.get(bi.tenderItemId);
          if (!item) continue;
          const qty = Number(bi.awardedQuantity ?? item.quantity);
          const winPrice = Number(bi.unitPrice);
          const targetPrice =
            item.targetUnitPrice !== null
              ? Number(item.targetUnitPrice)
              : null;
          volume += winPrice * qty;
          if (targetPrice !== null && targetPrice > winPrice) {
            savings += (targetPrice - winPrice) * qty;
          }
        }
      }
      // Kategori label (segment seviyesine yükseltilmiş üst başlık)
      let categoryLabel: string | null = null;
      const cat = t.categories[0]?.category;
      if (cat) {
        let segment: any = cat;
        while (segment?.parent) segment = segment.parent;
        if (segment?.level === 1) {
          categoryLabel = segment.nameTr;
        } else {
          categoryLabel = cat.nameTr;
        }
      }
      return {
        id: t.id,
        tenderNumber: t.tenderNumber,
        title: t.title,
        currency: t.primaryCurrency,
        awardedAt: t.awardedAt!,
        savings,
        volume,
        categoryLabel,
      };
    });

    const inMonth = (a: TenderAgg) => a.awardedAt >= monthStart;
    const monthAggs = aggregates.filter(inMonth);
    const yearAggs = aggregates;

    const summarize = (rows: TenderAgg[]) => {
      const totalSavings = rows.reduce((s, r) => s + r.savings, 0);
      const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
      const rate =
        totalVolume > 0 ? (totalSavings / totalVolume) * 100 : 0;
      return {
        totalSavings,
        totalVolume,
        averageSavingsRate: Number(rate.toFixed(2)),
      };
    };

    const top5 = (rows: TenderAgg[]) =>
      [...rows]
        .sort((a, b) => b.savings - a.savings)
        .slice(0, 5)
        .map((r, i) => ({
          rank: i + 1,
          tenderNumber: r.tenderNumber,
          title: r.title,
          amount: r.savings,
        }));

    const categoryBreakdown = (rows: TenderAgg[]) => {
      const map = new Map<string, { savings: number; volume: number }>();
      for (const r of rows) {
        const key = r.categoryLabel ?? "Kategorisiz";
        const e = map.get(key) ?? { savings: 0, volume: 0 };
        e.savings += r.savings;
        e.volume += r.volume;
        map.set(key, e);
      }
      return Array.from(map.entries())
        .map(([label, v]) => ({
          label,
          percent: v.volume > 0
            ? Number(((v.savings / v.volume) * 100).toFixed(2))
            : 0,
        }))
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 6);
    };

    const currencyBreakdown = (rows: TenderAgg[]) => {
      const map = new Map<string, { savings: number; volume: number }>();
      for (const r of rows) {
        const e = map.get(r.currency) ?? { savings: 0, volume: 0 };
        e.savings += r.savings;
        e.volume += r.volume;
        map.set(r.currency, e);
      }
      return Array.from(map.entries()).map(([label, v]) => ({
        label,
        percent: v.volume > 0
          ? Number(((v.savings / v.volume) * 100).toFixed(2))
          : undefined,
      }));
    };

    return {
      month: summarize(monthAggs),
      year: summarize(yearAggs),
      topSavingsMonth: top5(monthAggs),
      topSavingsYear: top5(yearAggs),
      categoryMonth: categoryBreakdown(monthAggs),
      categoryYear: categoryBreakdown(yearAggs),
      currencyMonth: currencyBreakdown(monthAggs),
      currencyYear: currencyBreakdown(yearAggs),
    };
  }

  /**
   * Tedarikçi tab — Bu Ay + Bu Yıl ayrı metrik setleri.
   * `fromPool` (Supkeys havuzundan) şu an 0 — public tender + havuz akışı
   * V2-7'de gelecek. Toplam: tüm bidder ve teklif sayısı.
   * Top suppliers: gönderilen teklif sayısına göre sıralı (avg rank dahil).
   * Most competitive: en çok benzersiz bidder içeren ihale.
   */
  async getTedarikciTab(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const bids = await this.prisma.bid.findMany({
      where: {
        tender: { tenantId },
        status: { in: ["SUBMITTED", "AWARDED_FULL", "AWARDED_PARTIAL", "LOST"] },
        submittedAt: { gte: yearStart },
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        supplierId: true,
        supplier: { select: { companyName: true } },
        tenderId: true,
        tender: { select: { tenderNumber: true, title: true } },
      },
    });

    interface BidRow {
      id: string;
      status: string;
      submittedAt: Date;
      supplierId: string;
      supplierName: string;
      tenderId: string;
      tenderNumber: string;
      tenderTitle: string;
    }
    const rows: BidRow[] = bids
      .filter((b) => b.submittedAt !== null)
      .map((b) => ({
        id: b.id,
        status: b.status,
        submittedAt: b.submittedAt!,
        supplierId: b.supplierId,
        supplierName: b.supplier.companyName,
        tenderId: b.tenderId,
        tenderNumber: b.tender.tenderNumber,
        tenderTitle: b.tender.title,
      }));

    const inMonth = (r: BidRow) => r.submittedAt >= monthStart;
    const monthRows = rows.filter(inMonth);
    const yearRows = rows;

    const uniqueBidders = (rs: BidRow[]) => new Set(rs.map((r) => r.supplierId)).size;
    const avg = (n: number, d: number) =>
      d > 0 ? Number((n / d).toFixed(2)) : 0;

    const metricSet = (rs: BidRow[]) => ({
      uniqueBiddersTotal: uniqueBidders(rs),
      bidsTotal: rs.length,
      averageTotal: avg(rs.length, uniqueBidders(rs)),
    });

    const m = metricSet(monthRows);
    const y = metricSet(yearRows);

    // Top suppliers — bidsBySupplier sayısına göre, avg sıra hesabı için
    // her ihaledeki winners sıralamasına bakmamız gerekir; pratik yaklaşım:
    // AWARDED_FULL = 1.0, AWARDED_PARTIAL = 1.5, LOST = 2.0 olarak proxy
    // ortalama sıralama. Veriler gerçek (rank hesabı approximated).
    const topSuppliers = (rs: BidRow[], periodLabel: "month" | "year") => {
      const grouped = new Map<
        string,
        {
          supplierId: string;
          shortName: string;
          tenderIds: Set<string>;
          totalBids: number;
          rankSum: number;
        }
      >();
      for (const r of rs) {
        const key = r.supplierId;
        const e = grouped.get(key) ?? {
          supplierId: key,
          shortName: shortenName(r.supplierName),
          tenderIds: new Set<string>(),
          totalBids: 0,
          rankSum: 0,
        };
        e.tenderIds.add(r.tenderId);
        e.totalBids += 1;
        e.rankSum += approximateRank(r.status);
        grouped.set(key, e);
      }
      return Array.from(grouped.values())
        .map((g, idx) => ({
          rank: idx + 1,
          shortName: g.shortName,
          tendersBidOn: g.tenderIds.size,
          averageRank: g.totalBids > 0 ? Number((g.rankSum / g.totalBids).toFixed(2)) : 0,
          totalBids: g.totalBids,
        }))
        .sort((a, b) => b.totalBids - a.totalBids)
        .slice(0, 5)
        .map((row, i) => ({ ...row, rank: i + 1 }));
    };

    // Most competitive tender — en fazla benzersiz bidder içeren ihale
    const mostCompetitive = (rs: BidRow[]) => {
      const byTender = new Map<
        string,
        {
          tenderId: string;
          tenderNumber: string;
          title: string;
          uniqueBidders: Set<string>;
        }
      >();
      for (const r of rs) {
        const e = byTender.get(r.tenderId) ?? {
          tenderId: r.tenderId,
          tenderNumber: r.tenderNumber,
          title: r.tenderTitle,
          uniqueBidders: new Set<string>(),
        };
        e.uniqueBidders.add(r.supplierId);
        byTender.set(r.tenderId, e);
      }
      const list = Array.from(byTender.values());
      if (list.length === 0) {
        return {
          tenderNumber: "—",
          title: "Veri yok",
          bidderCount: 0,
          distribution: [{ id: "t1", count: 0 }],
        };
      }
      const sorted = list.sort(
        (a, b) => b.uniqueBidders.size - a.uniqueBidders.size,
      );
      const top = sorted[0]!;
      const distribution = sorted.slice(0, 9).map((t, i) => ({
        id: t.tenderId,
        count: t.uniqueBidders.size,
        highlight: i === 0,
      }));
      return {
        tenderNumber: top.tenderNumber,
        title: top.title,
        bidderCount: top.uniqueBidders.size,
        distribution,
      };
    };

    // V2-7'ye kadar Supkeys havuzu yok → fromPool sabit 0.
    return {
      uniqueBiddersMonth: {
        fromPool: 0,
        totalLabel: `Toplam Teklif Veren: ${m.uniqueBiddersTotal}`,
      },
      uniqueBiddersYear: {
        fromPool: 0,
        totalLabel: `Toplam Teklif Veren: ${y.uniqueBiddersTotal}`,
      },
      bidsCountMonth: {
        fromPool: 0,
        totalLabel: `Toplam Teklif: ${m.bidsTotal}`,
      },
      bidsCountYear: {
        fromPool: 0,
        totalLabel: `Toplam Teklif: ${y.bidsTotal}`,
      },
      averageBidsMonth: {
        fromPool: 0,
        totalLabel: `Tüm Tekliflerin Ortalaması: ${m.averageTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      averageBidsYear: {
        fromPool: 0,
        totalLabel: `Tüm Tekliflerin Ortalaması: ${y.averageTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      topSuppliersMonth: topSuppliers(monthRows, "month"),
      topSuppliersYear: topSuppliers(yearRows, "year"),
      competitiveMonth: mostCompetitive(monthRows),
      competitiveYear: mostCompetitive(yearRows),
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
