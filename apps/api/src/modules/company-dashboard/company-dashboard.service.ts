import { Injectable } from "@nestjs/common";
import type { Currency } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/** "Acme Tedarik Ltd." → "ACM..." anonim kısa görünüm. */
function shortenName(name: string): string {
  const cleaned = name.trim().toLocaleUpperCase("tr-TR");
  if (cleaned.length <= 3) return cleaned;
  return `${cleaned.slice(0, 3)}...`;
}

/** Bid status → yaklaşık sıra (top supplier avg rank için). */
function approximateRank(status: string): number {
  if (status === "WON") return 1;
  if (status === "SUBMITTED") return 2;
  return 2.5; // LOST / WITHDRAWN
}

@Injectable()
export class CompanyDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRate: ExchangeRateService,
  ) {}

  /** Satınalma panosu — İhale sekmesi verisi (ALIM ilanları). */
  async satinalma(user: AuthenticatedCompanyUser) {
    const companyId = user.companyId;

    const [openListings, awarded, ongoingOrders, invitedPending] =
      await Promise.all([
        this.prisma.listing.findMany({
          where: { companyId, type: "ALIM", status: "OPEN" },
          select: {
            id: true,
            number: true,
            title: true,
            createdAt: true,
            closesAt: true,
            createdById: true,
            _count: {
              select: { bids: { where: { status: "SUBMITTED" } } },
            },
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
        // Davet edilip henüz teklif verilmemiş açık SATIŞ ihaleleri (satış
        // tarafındaki activeInvitations'ın simetriği — alıcı olarak davet).
        this.prisma.listingInvitation.count({
          where: {
            invitedCompanyId: companyId,
            listing: {
              status: "OPEN",
              type: "SATIS",
              bids: {
                none: {
                  bidderCompanyId: companyId,
                  status: { in: ["DRAFT", "SUBMITTED"] },
                },
              },
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
      bidCount: l._count.bids,
    });

    return {
      openCount: openListings.length,
      bidsReceived,
      awarded,
      ongoingOrders,
      // Davet edilip teklif verilmemiş açık SATIŞ ihalesi sayısı (anasayfa uyarısı).
      invitedPending,
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

  /**
   * Satış panosu — genel bakış KPI'ları (eski tedarikçi paneli paritesi).
   * Aktif davet / aktif teklif / kazanım / bekleyen sipariş + gelir ve
   * 30-günlük teklif trendi + bağlı müşteri sayısı.
   */
  async satisStats(user: AuthenticatedCompanyUser) {
    const companyId = user.companyId;
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d60 = new Date(now.getTime() - 60 * 86_400_000);

    const [
      activeInvitations,
      activeBids,
      wonTenders,
      pendingOrders,
      revenueOrders,
      bids30,
      bidsPrev30,
      buyersActive,
    ] = await Promise.all([
      // Henüz teklif verilmemiş açık ALIM davetleri.
      this.prisma.listingInvitation.count({
        where: {
          invitedCompanyId: companyId,
          listing: {
            status: "OPEN",
            type: "ALIM",
            bids: {
              none: {
                bidderCompanyId: companyId,
                status: { in: ["DRAFT", "SUBMITTED"] },
              },
            },
          },
        },
      }),
      // Verilmiş + değerlendirilen teklifler.
      this.prisma.listingBid.count({
        where: {
          bidderCompanyId: companyId,
          status: "SUBMITTED",
          listing: { status: { in: ["OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"] } },
        },
      }),
      this.prisma.listingBid.count({
        where: {
          bidderCompanyId: companyId,
          status: { in: ["WON", "AWARDED_PARTIAL"] },
        },
      }),
      // Teslimat başlatılmamış satıcı siparişleri.
      this.prisma.companyOrder.count({
        where: {
          sellerCompanyId: companyId,
          status: { in: ["PENDING", "ACCEPTED", "CREATED"] },
        },
      }),
      // Gelir: red/iptal dışındaki satıcı siparişleri (TRY-eşdeğer).
      this.prisma.companyOrder.findMany({
        where: {
          sellerCompanyId: companyId,
          status: { notIn: ["REJECTED", "CANCELLED"] },
        },
        // Denetim 2026-08-23 Parça 4: para birimi SİPARİŞİN kendi kolonundan
        // okunur. İlanın primaryCurrency'si kaynak alınınca (teklif farklı
        // birimde verilebildiği ve kalem-bazlı kazandırma birim başına ayrı
        // sipariş ürettiği için) gelir yanlış kurla çevriliyordu; öksüz
        // siparişte de sessizce "TRY" varsayılıyordu.
        select: { amount: true, currency: true, createdAt: true },
      }),
      this.prisma.listingBid.count({
        where: { bidderCompanyId: companyId, submittedAt: { gte: d30 } },
      }),
      this.prisma.listingBid.count({
        where: {
          bidderCompanyId: companyId,
          submittedAt: { gte: d60, lt: d30 },
        },
      }),
      this.prisma.companyConnection.count({
        where: {
          status: "ACTIVE",
          OR: [{ inviterCompanyId: companyId }, { inviteeCompanyId: companyId }],
        },
      }),
    ]);

    // Sipariş tutarlarını TRY-eşdeğere çevir (sipariş tarihi kuru, cache'li).
    const rateCache = new Map<string, number>();
    const getRate = async (c: Currency, d: Date): Promise<number> => {
      if (c === "TRY") return 1;
      const k = `${c}|${d.toISOString().slice(0, 10)}`;
      const cached = rateCache.get(k);
      if (cached !== undefined) return cached;
      const r = await this.exchangeRate.getRateOnDate(c, d);
      rateCache.set(k, r);
      return r;
    };
    let revenueTotal = 0;
    let revenueLast30 = 0;
    let revenuePrev30 = 0;
    for (const o of revenueOrders) {
      const cur = (o.currency ?? "TRY") as Currency;
      const rate = await getRate(cur, o.createdAt);
      const v = Number(o.amount) * rate;
      revenueTotal += v;
      if (o.createdAt >= d30) revenueLast30 += v;
      else if (o.createdAt >= d60) revenuePrev30 += v;
    }

    return {
      invitations: { active: activeInvitations },
      bids: { active: activeBids },
      wonTenders,
      orders: { pending: pendingOrders },
      revenue: {
        total: revenueTotal,
        last30: revenueLast30,
        prev30: revenuePrev30,
      },
      last30Days: { bidsSubmitted: bids30, prevBidsSubmitted: bidsPrev30 },
      buyers: { active: buyersActive },
    };
  }

  /**
   * Satış panosu — son aktiviteler (davet + teklif + sipariş birleşik akışı).
   * Sayfalı: her kaynaktan offset+pageSize satır çekilir, birleşik sıralamadan
   * ilgili dilim döner. Pano beslemesi arşiv değildir — derinlik MAX_FEED ile
   * sınırlı (tam listeler kendi sayfalarında).
   */
  async satisAktivite(user: AuthenticatedCompanyUser, limit = 8, page = 1) {
    const companyId = user.companyId;
    const MAX_FEED = 100;
    const pageSize = Math.min(Math.max(limit, 1), 20);
    const maxPage = Math.ceil(MAX_FEED / pageSize);
    const safePage = Math.min(Math.max(page, 1), maxPage);
    const offset = (safePage - 1) * pageSize;
    // Birleşik sıralamada ilk offset+pageSize satır, en kötü durumda tek
    // kaynaktan gelebilir → her kaynaktan o kadar çekmek zorundayız.
    const take = Math.min(offset + pageSize, MAX_FEED);

    const [invitations, bids, orders, invCount, bidCount, orderCount] =
      await Promise.all([
        this.prisma.listingInvitation.findMany({
          where: { invitedCompanyId: companyId },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            createdAt: true,
            listing: { select: { id: true, number: true, title: true } },
          },
        }),
        this.prisma.listingBid.findMany({
          where: { bidderCompanyId: companyId },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            createdAt: true,
            submittedAt: true,
            version: true,
            listing: { select: { id: true, number: true, title: true } },
          },
        }),
        this.prisma.companyOrder.findMany({
          where: { sellerCompanyId: companyId },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            number: true,
            createdAt: true,
            listing: { select: { title: true } },
          },
        }),
        this.prisma.listingInvitation.count({
          where: { invitedCompanyId: companyId },
        }),
        this.prisma.listingBid.count({
          where: { bidderCompanyId: companyId },
        }),
        this.prisma.companyOrder.count({
          where: { sellerCompanyId: companyId },
        }),
      ]);

    type ActivityRow = {
      type: "invitation" | "bid" | "order";
      title: string;
      subtitle: string;
      at: Date;
      href: string;
    };
    const rows: ActivityRow[] = [
      ...invitations.map((iv): ActivityRow => ({
        type: "invitation",
        title: iv.listing.title,
        subtitle: `İhale daveti · ${iv.listing.number ?? "—"}`,
        at: iv.createdAt,
        href: `/company/ilan/${iv.listing.id}`,
      })),
      ...bids.map((b): ActivityRow => ({
        type: "bid",
        title: b.listing.title,
        subtitle: `Teklif · ${b.listing.number ?? "—"} · v${b.version}`,
        at: b.submittedAt ?? b.createdAt,
        href: `/company/ilan/${b.listing.id}`,
      })),
      ...orders.map((o): ActivityRow => ({
        type: "order",
        title: o.listing?.title ?? "Sipariş",
        subtitle: `Sipariş · ${o.number ?? "—"}`,
        at: o.createdAt,
        href: `/company/siparis/${o.id}`,
      })),
    ];
    rows.sort((a, b) => b.at.getTime() - a.at.getTime());
    return {
      rows: rows.slice(offset, offset + pageSize),
      // Servis edilebilir derinlikle hizalı toplam — sayfa sayısı bundan türer.
      total: Math.min(invCount + bidCount + orderCount, MAX_FEED),
      page: safePage,
      pageSize,
    };
  }

  /**
   * Satınalma → Tasarruf sekmesi. Kazandırılan ALIM ilanlarında, kazanan (WON)
   * tekliflerin kalemlerinde (hedef birim fiyat − kazanan birim fiyat) × miktar.
   * Multi-currency: her ilan awardedAt (≈updatedAt) tarihindeki TCMB kuruyla
   * TRY equivalent'a çevrilir.
   */
  async satinalmaTasarruf(user: AuthenticatedCompanyUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const listings = await this.prisma.listing.findMany({
      where: {
        companyId: user.companyId,
        type: "ALIM",
        status: "AWARDED",
        updatedAt: { gte: yearStart },
      },
      select: {
        id: true,
        number: true,
        title: true,
        primaryCurrency: true,
        categoryIds: true,
        updatedAt: true,
        items: { select: { id: true, quantity: true, targetPrice: true } },
        bids: {
          where: { status: "WON" },
          select: {
            currency: true,
            items: { select: { itemId: true, unitPrice: true } },
          },
        },
      },
    });

    // Kategori etiketleri — ilk categoryId kodunu segment (level 1) adına çöz.
    const firstCodes = [
      ...new Set(
        listings.map((l) => l.categoryIds[0]).filter((c): c is string => !!c),
      ),
    ];
    const catLabel = await this.resolveCategoryLabels(firstCodes);

    const rateCache = new Map<string, number>();
    const getRate = async (c: Currency, d: Date): Promise<number> => {
      if (c === "TRY") return 1;
      const k = `${c}|${d.toISOString().slice(0, 10)}`;
      const cached = rateCache.get(k);
      if (cached !== undefined) return cached;
      const r = await this.exchangeRate.getRateOnDate(c, d);
      rateCache.set(k, r);
      return r;
    };

    interface Agg {
      number: string;
      title: string;
      currency: string;
      awardedAt: Date;
      savings: number;
      volume: number;
      categoryLabel: string;
    }

    const aggregates: Agg[] = await Promise.all(
      listings.map(async (l) => {
        const awardedAt = l.updatedAt;
        // Denetim 2026-08-23 Parça 4: hedef fiyat İLANIN birimindedir, kazanan
        // birim fiyatı ise TEKLİFİN biriminde — ikisi çevrilmeden çıkarılınca
        // (ör. TRY ilan + USD teklif) tasarruf uydurma çıkıyordu. Her iki taraf
        // AYRI kurla TRY'ye çevrilir.
        const listingRate = await getRate(l.primaryCurrency, awardedAt);
        const itemMap = new Map(l.items.map((i) => [i.id, i]));
        let savings = 0;
        let volume = 0;
        for (const bid of l.bids) {
          const bidRate = await getRate(
            (bid.currency ?? l.primaryCurrency) as Currency,
            awardedAt,
          );
          for (const bi of bid.items) {
            const item = itemMap.get(bi.itemId);
            if (!item) continue;
            const qty = Number(item.quantity);
            const winTry = Number(bi.unitPrice) * bidRate;
            const targetTry =
              item.targetPrice !== null
                ? Number(item.targetPrice) * listingRate
                : null;
            volume += winTry * qty;
            if (targetTry !== null && targetTry > winTry) {
              savings += (targetTry - winTry) * qty;
            }
          }
        }
        return {
          number: l.number ?? "—",
          title: l.title,
          // Tutarlar TRY-eşdeğerdir (yukarıda çevrildi) — etiket de öyle olmalı.
          currency: "TRY",
          awardedAt,
          savings,
          volume,
          categoryLabel:
            (l.categoryIds[0] && catLabel.get(l.categoryIds[0])) ||
            "Kategorisiz",
        };
      }),
    );

    const monthAggs = aggregates.filter((a) => a.awardedAt >= monthStart);
    const yearAggs = aggregates;

    const summarize = (rows: Agg[]) => {
      const totalSavings = rows.reduce((s, r) => s + r.savings, 0);
      const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
      const rate = totalVolume > 0 ? (totalSavings / totalVolume) * 100 : 0;
      return {
        totalSavings,
        totalVolume,
        averageSavingsRate: Number(rate.toFixed(2)),
      };
    };
    const top5 = (rows: Agg[]) =>
      [...rows]
        .sort((a, b) => b.savings - a.savings)
        .slice(0, 5)
        .map((r, i) => ({
          rank: i + 1,
          tenderNumber: r.number,
          title: r.title,
          amount: r.savings,
        }));
    const byKey = (
      rows: Agg[],
      key: (r: Agg) => string,
      keepUndefined = false,
    ) => {
      const map = new Map<string, { savings: number; volume: number }>();
      for (const r of rows) {
        const e = map.get(key(r)) ?? { savings: 0, volume: 0 };
        e.savings += r.savings;
        e.volume += r.volume;
        map.set(key(r), e);
      }
      return Array.from(map.entries())
        .map(([label, v]) => ({
          label,
          percent:
            v.volume > 0
              ? Number(((v.savings / v.volume) * 100).toFixed(2))
              : keepUndefined
                ? undefined
                : 0,
        }))
        .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
        .slice(0, 6);
    };

    return {
      month: summarize(monthAggs),
      year: summarize(yearAggs),
      topSavingsMonth: top5(monthAggs),
      topSavingsYear: top5(yearAggs),
      categoryMonth: byKey(monthAggs, (r) => r.categoryLabel),
      categoryYear: byKey(yearAggs, (r) => r.categoryLabel),
      currencyMonth: byKey(monthAggs, (r) => r.currency, true),
      currencyYear: byKey(yearAggs, (r) => r.currency, true),
    };
  }

  /**
   * Satınalma → Tedarikçi sekmesi. ALIM ilanlarına gelen tekliflerden benzersiz
   * teklif veren + top tedarikçi sıralaması + en rekabetçi ihale.
   */
  async satinalmaTedarikci(user: AuthenticatedCompanyUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const bids = await this.prisma.listingBid.findMany({
      where: {
        listing: { companyId: user.companyId, type: "ALIM" },
        status: { in: ["SUBMITTED", "WON", "LOST"] },
        createdAt: { gte: yearStart },
      },
      select: {
        status: true,
        createdAt: true,
        bidderCompanyId: true,
        bidderCompany: { select: { name: true } },
        listingId: true,
        listing: { select: { number: true, title: true } },
      },
    });

    const rows = bids.map((b) => ({
      status: b.status,
      submittedAt: b.createdAt,
      supplierId: b.bidderCompanyId,
      supplierName: b.bidderCompany.name,
      tenderId: b.listingId,
      tenderNumber: b.listing.number ?? "—",
      tenderTitle: b.listing.title,
    }));

    type Row = (typeof rows)[number];
    const monthRows = rows.filter((r) => r.submittedAt >= monthStart);
    const yearRows = rows;

    const uniqueBidders = (rs: Row[]) =>
      new Set(rs.map((r) => r.supplierId)).size;
    const biddersMetric = (rs: Row[]) => ({
      fromPool: 0,
      totalLabel: `Toplam Teklif Veren: ${uniqueBidders(rs)}`,
    });
    const bidsMetric = (rs: Row[]) => ({
      fromPool: 0,
      totalLabel: `Toplam Teklif: ${rs.length}`,
    });
    const avgMetric = (rs: Row[]) => {
      const u = uniqueBidders(rs);
      const v = u > 0 ? (rs.length / u).toFixed(2) : "0";
      return { fromPool: 0, totalLabel: `Ortalama: ${v}` };
    };

    const topSuppliers = (rs: Row[]) => {
      const grouped = new Map<
        string,
        {
          shortName: string;
          tenderIds: Set<string>;
          totalBids: number;
          rankSum: number;
        }
      >();
      for (const r of rs) {
        const e = grouped.get(r.supplierId) ?? {
          shortName: shortenName(r.supplierName),
          tenderIds: new Set<string>(),
          totalBids: 0,
          rankSum: 0,
        };
        e.tenderIds.add(r.tenderId);
        e.totalBids += 1;
        e.rankSum += approximateRank(r.status);
        grouped.set(r.supplierId, e);
      }
      return Array.from(grouped.values())
        .map((g) => ({
          shortName: g.shortName,
          tendersBidOn: g.tenderIds.size,
          averageRank:
            g.totalBids > 0 ? Number((g.rankSum / g.totalBids).toFixed(2)) : 0,
          totalBids: g.totalBids,
        }))
        .sort((a, b) => b.totalBids - a.totalBids)
        .slice(0, 5)
        .map((row, i) => ({ rank: i + 1, ...row }));
    };

    const mostCompetitive = (rs: Row[]) => {
      const byTender = new Map<
        string,
        {
          tenderNumber: string;
          title: string;
          uniqueBidders: Set<string>;
        }
      >();
      for (const r of rs) {
        const e = byTender.get(r.tenderId) ?? {
          tenderNumber: r.tenderNumber,
          title: r.tenderTitle,
          uniqueBidders: new Set<string>(),
        };
        e.uniqueBidders.add(r.supplierId);
        byTender.set(r.tenderId, e);
      }
      const list = Array.from(byTender.values()).sort(
        (a, b) => b.uniqueBidders.size - a.uniqueBidders.size,
      );
      if (list.length === 0) {
        return {
          tenderNumber: "—",
          title: "Veri yok",
          bidderCount: 0,
          distribution: [{ id: "t1", count: 0 }],
        };
      }
      const top = list[0]!;
      return {
        tenderNumber: top.tenderNumber,
        title: top.title,
        bidderCount: top.uniqueBidders.size,
        distribution: list.slice(0, 9).map((t, i) => ({
          id: `${i}`,
          count: t.uniqueBidders.size,
          highlight: i === 0,
        })),
      };
    };

    return {
      uniqueBiddersMonth: biddersMetric(monthRows),
      uniqueBiddersYear: biddersMetric(yearRows),
      bidsCountMonth: bidsMetric(monthRows),
      bidsCountYear: bidsMetric(yearRows),
      averageBidsMonth: avgMetric(monthRows),
      averageBidsYear: avgMetric(yearRows),
      topSuppliersMonth: topSuppliers(monthRows),
      topSuppliersYear: topSuppliers(yearRows),
      competitiveMonth: mostCompetitive(monthRows),
      competitiveYear: mostCompetitive(yearRows),
    };
  }

  /** UNSPSC kategori kodlarını segment (level 1) adına çözer. */
  private async resolveCategoryLabels(
    codes: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (codes.length === 0) return out;
    const cats = await this.prisma.category.findMany({
      where: { code: { in: codes } },
      select: { code: true, nameTr: true },
    });
    for (const c of cats) out.set(c.code, c.nameTr);
    return out;
  }
}
