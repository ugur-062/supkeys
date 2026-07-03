import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ListingType } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";

const ACTIVE_BID = ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] as const;

/**
 * Teklifin TRY karşılığı — raporlar farklı para birimlerini toplayabilsin.
 * TRY→tutar; yabancı+kur snapshot'lı→çevrim; snapshot'sız yabancı→null
 * (toplama katılmaz — yanlış kurla toplamak yerine dışarıda bırakılır).
 */
function bidTry(b: {
  amount: unknown;
  currency: string;
  exchangeRateSnapshot: unknown | null;
}): number | null {
  const amt = Number(b.amount);
  if (b.currency === "TRY") return amt;
  if (b.exchangeRateSnapshot != null) {
    return amt * Number(b.exchangeRateSnapshot);
  }
  return null;
}

const BID_TRY_SELECT = {
  amount: true,
  currency: true,
  exchangeRateSnapshot: true,
  status: true,
} as const;

@Injectable()
export class CompanyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private since(days?: number): Date | undefined {
    return days && days > 0
      ? new Date(Date.now() - days * 86_400_000)
      : undefined;
  }

  /**
   * Genel rapor — tip-farkında ihale özeti.
   * ALIM: tasarruf = en yüksek teklif − kazanan (rekabetin düşürdüğü tutar).
   * SATIS: kazanç = kazanan − en düşük teklif (rekabetin yükselttiği tutar).
   * Tutarlar TRY karşılığıyla toplanır (kur snapshot'sız yabancı teklif atlanır).
   */
  async general(companyId: string, type: ListingType, days?: number) {
    const since = this.since(days);
    const listings = await this.prisma.listing.findMany({
      where: {
        companyId,
        type,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        status: true,
        items: {
          select: { quantity: true, targetPrice: true, minUnitPrice: true },
        },
        minPrice: true,
        bids: {
          where: { status: { in: [...ACTIVE_BID] } },
          select: BID_TRY_SELECT,
        },
        _count: { select: { invitations: true } },
      },
    });

    const byStatus: Record<string, number> = {};
    let totalEstimated = 0;
    let totalAwarded = 0;
    let totalCompetitionDelta = 0;
    let awardedCount = 0;
    let totalBids = 0;
    let totalInvites = 0;

    for (const l of listings) {
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      totalBids += l.bids.length;
      totalInvites += l._count.invitations;
      // Beklenen hacim: ALIM'da hedef fiyatlar; SATIS'ta taban (TOPLU minPrice
      // veya kalem tabanları) — ilanın kendi biriminde girilir, TRY varsayımı
      // eski rapor davranışıyla aynı (çoğunluk TRY).
      if (type === "ALIM") {
        totalEstimated += l.items.reduce(
          (s, it) =>
            s +
            (it.targetPrice ? Number(it.targetPrice) : 0) * Number(it.quantity),
          0,
        );
      } else {
        totalEstimated += l.minPrice
          ? Number(l.minPrice)
          : l.items.reduce(
              (s, it) =>
                s +
                (it.minUnitPrice ? Number(it.minUnitPrice) : 0) *
                  Number(it.quantity),
              0,
            );
      }
      const won = l.bids.find(
        (b) => b.status === "WON" || b.status === "AWARDED_PARTIAL",
      );
      if (l.status === "AWARDED" && won) {
        const winTry = bidTry(won);
        if (winTry == null) continue;
        awardedCount++;
        totalAwarded += winTry;
        const tryAmounts = l.bids
          .map(bidTry)
          .filter((v): v is number => v != null);
        if (tryAmounts.length > 1) {
          if (type === "ALIM") {
            const highest = Math.max(...tryAmounts);
            if (highest > winTry) totalCompetitionDelta += highest - winTry;
          } else {
            const lowest = Math.min(...tryAmounts);
            if (winTry > lowest) totalCompetitionDelta += winTry - lowest;
          }
        }
      }
    }

    return {
      total: listings.length,
      byStatus,
      awardedCount,
      totalEstimated,
      totalAwarded,
      // ALIM: tasarruf; SATIS: rekabet kazancı — frontend yönlü etiketler.
      totalCompetitionDelta,
      avgBidsPerListing:
        listings.length > 0
          ? Math.round((totalBids / listings.length) * 10) / 10
          : 0,
      totalInvites,
      totalBids,
    };
  }

  /**
   * Rekabet raporu — kazandırılan ihale başına satır.
   * ALIM: tasarruf = en yüksek − kazanan. SATIS: kazanç = kazanan − en düşük;
   * ayrıca taban üstü fark (kazanan − taban).
   */
  async savings(companyId: string, type: ListingType, days?: number) {
    const since = this.since(days);
    const listings = await this.prisma.listing.findMany({
      where: {
        companyId,
        type,
        status: "AWARDED",
        ...(since ? { awardedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        number: true,
        title: true,
        awardedAt: true,
        minPrice: true,
        bids: {
          where: { status: { in: [...ACTIVE_BID] } },
          select: BID_TRY_SELECT,
        },
      },
      orderBy: { awardedAt: "desc" },
    });

    const rows = listings
      .map((l) => {
        const won = l.bids.find(
          (b) => b.status === "WON" || b.status === "AWARDED_PARTIAL",
        );
        const winTry = won ? bidTry(won) : null;
        if (winTry == null) return null;
        const tryAmounts = l.bids
          .map(bidTry)
          .filter((v): v is number => v != null);
        const highest = tryAmounts.length ? Math.max(...tryAmounts) : winTry;
        const lowest = tryAmounts.length ? Math.min(...tryAmounts) : winTry;
        const delta =
          type === "ALIM"
            ? Math.max(0, highest - winTry)
            : Math.max(0, winTry - lowest);
        const ref = type === "ALIM" ? highest : winTry;
        return {
          id: l.id,
          number: l.number,
          title: l.title,
          awardedAt: l.awardedAt,
          // ALIM: en yüksek teklif; SATIS: en düşük teklif (rekabet referansı).
          reference: type === "ALIM" ? highest : lowest,
          winning: winTry,
          bidCount: l.bids.length,
          delta,
          deltaPct: ref > 0 ? (delta / ref) * 100 : 0,
          // SATIS: taban üstü fark (taban TRY varsayımıyla — ilan birimi).
          overFloor:
            type === "SATIS" && l.minPrice
              ? Math.max(0, winTry - Number(l.minPrice))
              : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const grandDelta = rows.reduce((s, r) => s + r.delta, 0);
    const grandWinning = rows.reduce((s, r) => s + r.winning, 0);
    const withPct = rows.filter((r) => r.bidCount > 1);
    const best =
      withPct.length > 0
        ? withPct.reduce((a, b) => (b.deltaPct > a.deltaPct ? b : a))
        : null;
    const worst =
      withPct.length > 0
        ? withPct.reduce((a, b) => (b.deltaPct < a.deltaPct ? b : a))
        : null;

    return {
      rows,
      grandDelta,
      grandWinning,
      best: best ? { title: best.title, deltaPct: best.deltaPct } : null,
      worst: worst ? { title: worst.title, deltaPct: worst.deltaPct } : null,
    };
  }

  /** Aylık eğilim — açılan/kazandırılan ihale sayısı + kazanan tutar (TRY). */
  async monthly(companyId: string, type: ListingType, days?: number) {
    const since = this.since(days ?? 365) ?? this.since(365)!;
    const listings = await this.prisma.listing.findMany({
      where: { companyId, type, createdAt: { gte: since } },
      select: {
        createdAt: true,
        awardedAt: true,
        status: true,
        bids: {
          where: { status: { in: ["WON", "AWARDED_PARTIAL"] } },
          select: BID_TRY_SELECT,
        },
      },
    });
    const byMonth = new Map<
      string,
      { created: number; awarded: number; awardedTry: number }
    >();
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    for (const l of listings) {
      const c = key(l.createdAt);
      const row = byMonth.get(c) ?? { created: 0, awarded: 0, awardedTry: 0 };
      row.created += 1;
      byMonth.set(c, row);
      if (l.status === "AWARDED" && l.awardedAt) {
        const a = key(l.awardedAt);
        const arow = byMonth.get(a) ?? {
          created: 0,
          awarded: 0,
          awardedTry: 0,
        };
        arow.awarded += 1;
        arow.awardedTry += l.bids.reduce((s, b) => s + (bidTry(b) ?? 0), 0);
        byMonth.set(a, arow);
      }
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v }));
  }

  /**
   * Karşı taraf kırılımı — siparişlerden: ALIM raporu için en çok iş verilen
   * satıcılar, SATIS raporu için en çok satış yapılan alıcılar (adet + para
   * birimi bazında toplam; farklı birimler karıştırılmaz).
   */
  async counterparties(companyId: string, type: ListingType, days?: number) {
    const since = this.since(days);
    const iAmBuyer = type === "ALIM"; // kendi ALIM ihalelerimde alıcıyım
    const orders = await this.prisma.companyOrder.findMany({
      where: {
        ...(iAmBuyer
          ? { buyerCompanyId: companyId }
          : { sellerCompanyId: companyId }),
        listing: { is: { type, companyId } },
        status: { notIn: ["REJECTED", "CANCELLED"] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        amount: true,
        currency: true,
        sellerCompanyId: true,
        buyerCompanyId: true,
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
      },
    });
    const byCompany = new Map<
      string,
      { name: string; orderCount: number; totals: Record<string, number> }
    >();
    for (const o of orders) {
      const cid = iAmBuyer ? o.sellerCompanyId : o.buyerCompanyId;
      const name = iAmBuyer ? o.seller.name : o.buyer.name;
      const row = byCompany.get(cid) ?? { name, orderCount: 0, totals: {} };
      row.orderCount += 1;
      row.totals[o.currency] = (row.totals[o.currency] ?? 0) + Number(o.amount);
      byCompany.set(cid, row);
    }
    return [...byCompany.entries()]
      .map(([companyId, v]) => ({ companyId, ...v }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);
  }

  /** Sipariş özeti — bu portalın (rol) siparişleri: durum sayıları + ciro. */
  async ordersSummary(companyId: string, type: ListingType, days?: number) {
    const since = this.since(days);
    const iAmBuyer = type === "ALIM";
    const orders = await this.prisma.companyOrder.findMany({
      where: {
        ...(iAmBuyer
          ? { buyerCompanyId: companyId }
          : { sellerCompanyId: companyId }),
        listing: { is: { type, companyId } },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { status: true, amount: true, currency: true },
    });
    const byStatus: Record<string, number> = {};
    const totals: Record<string, number> = {};
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      if (o.status !== "REJECTED" && o.status !== "CANCELLED") {
        totals[o.currency] = (totals[o.currency] ?? 0) + Number(o.amount);
      }
    }
    return { total: orders.length, byStatus, totals };
  }

  /**
   * İhale-bazlı detay raporu — sahibin tek ihalesi: katılım, teklif
   * istatistikleri, kazanan, kalem bazında en iyi/kazanan birim fiyat,
   * bağlı siparişler. Kapalı zarf: yalnız SAHİP çağırabilir.
   */
  async listingReport(companyId: string, listingId: string) {
    const l = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        number: true,
        title: true,
        type: true,
        status: true,
        format: true,
        primaryCurrency: true,
        createdAt: true,
        publishedAt: true,
        closesAt: true,
        awardedAt: true,
        minPrice: true,
        items: {
          select: { id: true, name: true, quantity: true, unit: true },
          orderBy: { lineNo: "asc" },
        },
        invitations: { select: { invitedCompanyId: true } },
        bids: {
          where: { status: { in: [...ACTIVE_BID] } },
          select: {
            ...BID_TRY_SELECT,
            id: true,
            bidderCompanyId: true,
            round: true,
            isBuyNow: true,
            createdAt: true,
            items: { select: { itemId: true, unitPrice: true } },
          },
        },
        orders: {
          select: {
            id: true,
            number: true,
            status: true,
            amount: true,
            currency: true,
          },
        },
      },
    });
    if (!l) throw new NotFoundException("İhale bulunamadı");
    if (l.companyId !== companyId) {
      throw new ForbiddenException("Bu rapora yalnızca ilan sahibi erişir");
    }

    const tryAmounts = l.bids.map(bidTry).filter((v): v is number => v != null);
    const won = l.bids.find(
      (b) => b.status === "WON" || b.status === "AWARDED_PARTIAL",
    );
    const winTry = won ? bidTry(won) : null;
    const bestIsMax = l.type === "SATIS";

    // Davet→teklif dönüşümü: teklif veren davetli sayısı (davetsiz PUBLIC
    // teklifçiler dönüşüm oranına katılmaz ama toplam teklifte görünür).
    const invitedIds = new Set(l.invitations.map((i) => i.invitedCompanyId));
    const invitedBidders = new Set(
      l.bids
        .map((b) => b.bidderCompanyId)
        .filter((id) => invitedIds.has(id)),
    ).size;

    // Kalem bazında en iyi birim fiyat (ham — kalem teklifleri ilan
    // biriminde varsayılır; çoklu birimde yaklaşık) + kazanan birim fiyat.
    const items = l.items.map((it) => {
      const prices = l.bids
        .map((b) => b.items.find((bi) => bi.itemId === it.id))
        .filter((bi): bi is NonNullable<typeof bi> => bi != null)
        .map((bi) => Number(bi.unitPrice));
      const wonItem = won?.items.find((bi) => bi.itemId === it.id);
      return {
        id: it.id,
        name: it.name,
        quantity: it.quantity.toString(),
        unit: it.unit,
        offerCount: prices.length,
        bestUnitPrice: prices.length
          ? bestIsMax
            ? Math.max(...prices)
            : Math.min(...prices)
          : null,
        winningUnitPrice: wonItem ? Number(wonItem.unitPrice) : null,
      };
    });

    return {
      id: l.id,
      number: l.number,
      title: l.title,
      type: l.type,
      status: l.status,
      format: l.format,
      currency: l.primaryCurrency,
      createdAt: l.createdAt,
      publishedAt: l.publishedAt,
      closesAt: l.closesAt,
      awardedAt: l.awardedAt,
      participation: {
        invited: l.invitations.length,
        bidders: new Set(l.bids.map((b) => b.bidderCompanyId)).size,
        invitedBidders,
        totalBids: l.bids.length,
        buyNowUsed: l.bids.some((b) => b.isBuyNow),
      },
      bidStats: {
        // TRY karşılığı — çoklu birim adil kıyas; snapshot'sız yabancı hariç.
        min: tryAmounts.length ? Math.min(...tryAmounts) : null,
        max: tryAmounts.length ? Math.max(...tryAmounts) : null,
        avg: tryAmounts.length
          ? tryAmounts.reduce((s, v) => s + v, 0) / tryAmounts.length
          : null,
        winning: winTry,
        delta:
          winTry != null && tryAmounts.length > 1
            ? l.type === "ALIM"
              ? Math.max(0, Math.max(...tryAmounts) - winTry)
              : Math.max(0, winTry - Math.min(...tryAmounts))
            : null,
      },
      items,
      orders: l.orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        amount: o.amount.toString(),
        currency: o.currency,
      })),
    };
  }
}
