import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const ACTIVE_BID = ["SUBMITTED", "WON", "LOST"] as const;

@Injectable()
export class CompanyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private since(days?: number): Date | undefined {
    return days && days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
  }

  /** Genel rapor — alım ihaleleri özeti (durum sayıları + tutar toplamları). */
  async general(companyId: string, days?: number) {
    const since = this.since(days);
    const listings = await this.prisma.listing.findMany({
      where: {
        companyId,
        type: "ALIM",
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        status: true,
        items: { select: { quantity: true, targetPrice: true } },
        bids: {
          where: { status: { in: [...ACTIVE_BID] } },
          select: { amount: true, status: true },
        },
      },
    });

    const byStatus: Record<string, number> = {};
    let totalEstimated = 0;
    let totalAwarded = 0;
    let totalSavings = 0;
    let awardedCount = 0;

    for (const l of listings) {
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      totalEstimated += l.items.reduce(
        (s, it) =>
          s + (it.targetPrice ? Number(it.targetPrice) : 0) * Number(it.quantity),
        0,
      );
      const won = l.bids.find((b) => b.status === "WON");
      if (l.status === "AWARDED" && won) {
        awardedCount++;
        const win = Number(won.amount);
        totalAwarded += win;
        const highest = Math.max(...l.bids.map((b) => Number(b.amount)));
        if (highest > win) totalSavings += highest - win;
      }
    }

    return {
      total: listings.length,
      byStatus,
      awardedCount,
      totalEstimated,
      totalAwarded,
      totalSavings,
    };
  }

  /** Tasarruf raporu — ihale başına (en yüksek − kazanan) + toplam/en iyi/en kötü. */
  async savings(companyId: string, days?: number) {
    const since = this.since(days);
    const listings = await this.prisma.listing.findMany({
      where: {
        companyId,
        type: "ALIM",
        status: "AWARDED",
        ...(since ? { awardedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        number: true,
        title: true,
        awardedAt: true,
        items: { select: { quantity: true, targetPrice: true } },
        bids: {
          where: { status: { in: [...ACTIVE_BID] } },
          select: { amount: true, status: true },
        },
      },
      orderBy: { awardedAt: "desc" },
    });

    const rows = listings
      .map((l) => {
        const won = l.bids.find((b) => b.status === "WON");
        if (!won || l.bids.length === 0) return null;
        const win = Number(won.amount);
        const highest = Math.max(...l.bids.map((b) => Number(b.amount)));
        const estimated = l.items.reduce(
          (s, it) =>
            s +
            (it.targetPrice ? Number(it.targetPrice) : 0) * Number(it.quantity),
          0,
        );
        const savings = highest > win ? highest - win : 0;
        const savingsPct = highest > 0 ? (savings / highest) * 100 : 0;
        return {
          id: l.id,
          number: l.number,
          title: l.title,
          awardedAt: l.awardedAt,
          estimated,
          highest,
          winning: win,
          bidCount: l.bids.length,
          savings,
          savingsPct,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const grandSavings = rows.reduce((s, r) => s + r.savings, 0);
    const grandWinning = rows.reduce((s, r) => s + r.winning, 0);
    const withPct = rows.filter((r) => r.bidCount > 1);
    const best =
      withPct.length > 0
        ? withPct.reduce((a, b) => (b.savingsPct > a.savingsPct ? b : a))
        : null;
    const worst =
      withPct.length > 0
        ? withPct.reduce((a, b) => (b.savingsPct < a.savingsPct ? b : a))
        : null;

    return {
      rows,
      grandSavings,
      grandWinning,
      best: best ? { title: best.title, savingsPct: best.savingsPct } : null,
      worst: worst ? { title: worst.title, savingsPct: worst.savingsPct } : null,
    };
  }
}
