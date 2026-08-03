import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Zaman Tasarrufu hesap motoru — UI'dan bağımsız, saf hesap.
 *
 * ÖLÇÜLEN: sistemdeki gerçek süreler (yalnız zaman damgası OLAN adımlar):
 *   davet(createdAt) → ilk teklif(submittedAt), kapanış(closesAt) →
 *   karar(awardedAt), karar(awardedAt) → sipariş(createdAt).
 * TAHMİN: "mail ile yapılsaydı" senaryosu — parametreler DB'de
 *   time_savings_configs (firma override → global satır → kod fallback).
 * Tasarruf = tahmin − sistemde geçen gerçek KULLANICI süresi. Muhafazakâr:
 *   yalnız gerçekleşmiş işler sayılır (gönderilmiş teklif, verilmiş karar,
 *   oluşmuş sipariş); sistem-içi kullanıcı süresi de tahmine karşı düşülür.
 * NOT: hatırlatma turu takibi olmadığından followupMin v1'de HESABA KATILMAZ.
 */

export interface TimeSavingsParams {
  rfqMailPrepMin: number;
  followupMin: number;
  bidToExcelMin: number;
  bidItemFactor: number;
  comparisonTableMin: number;
  revisionRoundMin: number;
  approvalLoopMin: number;
  poPrepMin: number;
  hourlyLaborCost: number | null;
}

/** Kod içi fallback — DB'de satır yoksa (schema default'larıyla birebir). */
export const DEFAULT_TIME_SAVINGS_PARAMS: TimeSavingsParams = {
  rfqMailPrepMin: 6,
  followupMin: 3,
  bidToExcelMin: 4,
  bidItemFactor: 0.15,
  comparisonTableMin: 15,
  revisionRoundMin: 5,
  approvalLoopMin: 20,
  poPrepMin: 10,
  hourlyLaborCost: null,
};

/** Sistemi kullanırken harcanan tahmini süre (dk) — tahminden düşülür ki
 *  "tasarruf" brüt değil NET olsun (muhafazakârlık). */
const SYSTEM_TIME = {
  perListing: 10, // ihale açma sihirbazı
  perBidReview: 1, // teklif inceleme (karşılaştırma tabloyu sistem kurar)
  perAward: 3, // kazandırma akışı
  perOrder: 2, // sipariş takip başlangıcı
};

export type SavingsPeriod = "month" | "quarter" | "year";

export interface TimeSavingsCounters {
  listings: number;
  invitations: number;
  bids: number;
  avgItemsPerBid: number;
  revisionRounds: number;
  approvals: number;
  orders: number;
}

export interface TimeSavingsBreakdownRow {
  key: string;
  label: string;
  minutes: number;
}

export interface TimeSavingsResult {
  savedMinutes: number;
  estimatedMailMinutes: number;
  systemMinutes: number;
  laborValueTry: number | null;
  counters: TimeSavingsCounters;
  breakdown: TimeSavingsBreakdownRow[];
  /** Ölçülen gerçek süreler (medyan, saat) — yalnız veri varsa. */
  measured: {
    inviteToFirstBidHours: number | null;
    closeToAwardHours: number | null;
    awardToOrderHours: number | null;
  };
  /** Son 6 ay sparkline — ay anahtarı + o ay kazanılan dakika. */
  months: { key: string; minutes: number }[];
  params: TimeSavingsParams;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** SAF hesap — DB'siz test edilebilir çekirdek. */
export function computeSavings(
  p: TimeSavingsParams,
  c: TimeSavingsCounters,
): {
  estimated: number;
  system: number;
  saved: number;
  breakdown: TimeSavingsBreakdownRow[];
} {
  const perBidExcel =
    p.bidToExcelMin * (1 + p.bidItemFactor * Math.max(0, c.avgItemsPerBid - 1));
  const breakdown: TimeSavingsBreakdownRow[] = [
    {
      key: "rfq_mail",
      label: "RFQ maili hazırlama",
      minutes: p.rfqMailPrepMin * c.invitations,
    },
    {
      key: "bid_excel",
      label: "Teklifleri Excel'e işleme",
      minutes: perBidExcel * c.bids,
    },
    {
      key: "comparison",
      label: "Karşılaştırma tablosu kurma",
      minutes: p.comparisonTableMin * c.listings,
    },
    {
      key: "revision",
      label: "Revizyon/pazarlık turları",
      minutes: p.revisionRoundMin * c.revisionRounds,
    },
    {
      key: "approval",
      label: "Onay mail döngüsü",
      minutes: p.approvalLoopMin * c.approvals,
    },
    {
      key: "po",
      label: "Sipariş (PO) hazırlama",
      minutes: p.poPrepMin * c.orders,
    },
  ].map((r) => ({ ...r, minutes: round1(r.minutes) }));

  const estimated = round1(breakdown.reduce((a, r) => a + r.minutes, 0));
  const system = round1(
    SYSTEM_TIME.perListing * c.listings +
      SYSTEM_TIME.perBidReview * c.bids +
      SYSTEM_TIME.perAward * c.approvals +
      SYSTEM_TIME.perOrder * c.orders,
  );
  // Muhafazakâr: negatif tasarruf gösterilmez.
  const saved = Math.max(0, round1(estimated - system));
  return { estimated, system, saved, breakdown };
}

export function periodStart(period: SavingsPeriod, now: Date): Date {
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), q, 1);
  }
  return new Date(now.getFullYear(), 0, 1);
}

interface CacheEntry {
  at: number;
  value: TimeSavingsResult;
}

@Injectable()
export class TimeSavingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Panel için tek toplu yanıt — 5 dk in-memory cache (kart başına istek yok).
  private readonly cache = new Map<string, CacheEntry>();
  private static readonly CACHE_MS = 5 * 60_000;

  /** Firma override → global satır → kod fallback (alan alan birleştirilir). */
  async loadParams(companyId: string): Promise<TimeSavingsParams> {
    const rows = await this.prisma.timeSavingsConfig.findMany({
      where: { OR: [{ companyId }, { companyId: null }] },
    });
    const global = rows.find((r) => r.companyId === null);
    const override = rows.find((r) => r.companyId === companyId);
    const pick = (
      f: keyof Omit<TimeSavingsParams, "hourlyLaborCost">,
    ): number => {
      const src = override ?? global;
      return src ? Number(src[f]) : DEFAULT_TIME_SAVINGS_PARAMS[f];
    };
    const src = override ?? global;
    return {
      rfqMailPrepMin: pick("rfqMailPrepMin"),
      followupMin: pick("followupMin"),
      bidToExcelMin: pick("bidToExcelMin"),
      bidItemFactor: pick("bidItemFactor"),
      comparisonTableMin: pick("comparisonTableMin"),
      revisionRoundMin: pick("revisionRoundMin"),
      approvalLoopMin: pick("approvalLoopMin"),
      poPrepMin: pick("poPrepMin"),
      hourlyLaborCost:
        src?.hourlyLaborCost != null ? Number(src.hourlyLaborCost) : null,
    };
  }

  async forCompany(
    companyId: string,
    period: SavingsPeriod,
  ): Promise<TimeSavingsResult> {
    const key = `${companyId}:${period}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TimeSavingsService.CACHE_MS) {
      return hit.value;
    }

    const now = new Date();
    const start = periodStart(period, now);
    // Sparkline her zaman son 6 ay (dönemden bağımsız trend).
    const sparkStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const from = start < sparkStart ? start : sparkStart;

    // Tek turda ham kayıtlar — sayaçlar + aylık kırılım JS'te.
    const [listings, invitations, bids, approvals, orders] = await Promise.all([
      this.prisma.listing.findMany({
        where: {
          companyId,
          type: "ALIM",
          status: { notIn: ["DRAFT", "CANCELLED"] },
          createdAt: { gte: from },
        },
        select: {
          id: true,
          createdAt: true,
          closesAt: true,
          awardedAt: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.listingInvitation.findMany({
        where: {
          listing: { companyId, type: "ALIM" },
          createdAt: { gte: from },
        },
        select: { listingId: true, createdAt: true },
      }),
      this.prisma.listingBid.findMany({
        where: {
          listing: { companyId, type: "ALIM" },
          status: { in: ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] },
          createdAt: { gte: from },
        },
        select: {
          listingId: true,
          createdAt: true,
          submittedAt: true,
          round: true,
          version: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.approvalRequest.findMany({
        where: { companyId, createdAt: { gte: from } },
        select: { createdAt: true, decidedAt: true },
      }),
      this.prisma.companyOrder.findMany({
        where: {
          buyerCompanyId: companyId,
          status: { notIn: ["REJECTED", "CANCELLED"] },
          createdAt: { gte: from },
        },
        select: { createdAt: true, listingId: true },
      }),
    ]);

    const inPeriod = <T extends { createdAt: Date }>(rows: T[]) =>
      rows.filter((r) => r.createdAt >= start);

    const pListings = inPeriod(listings);
    const pInvites = inPeriod(invitations);
    const pBids = inPeriod(bids);
    const pApprovals = inPeriod(approvals);
    const pOrders = inPeriod(orders);

    // Revizyon turu sinyali: pazarlık turu (round>1) + teklif revizyonu
    // (version>1) — mevcut alanlardan; ayrı log yok, uydurmuyoruz.
    const revisionRounds = pBids.reduce(
      (a, b) =>
        a + Math.max(0, b.round - 1) + Math.max(0, (b.version ?? 1) - 1),
      0,
    );
    const itemCounts = pBids.map((b) => b._count.items).filter((n) => n > 0);
    const counters: TimeSavingsCounters = {
      listings: pListings.length,
      invitations: pInvites.length,
      bids: pBids.length,
      avgItemsPerBid:
        itemCounts.length > 0
          ? round1(itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length)
          : 1,
      revisionRounds,
      approvals: pApprovals.length,
      orders: pOrders.length,
    };

    const params = await this.loadParams(companyId);
    const { estimated, system, saved, breakdown } = computeSavings(
      params,
      counters,
    );

    // ÖLÇÜLEN gerçek süreler (medyan, saat) — yalnız damgası olan çiftler.
    const hours = (ms: number) => ms / 3_600_000;
    const firstBidByListing = new Map<string, Date>();
    for (const b of bids) {
      if (!b.submittedAt) continue;
      const cur = firstBidByListing.get(b.listingId);
      if (!cur || b.submittedAt < cur)
        firstBidByListing.set(b.listingId, b.submittedAt);
    }
    const firstInviteByListing = new Map<string, Date>();
    for (const iv of invitations) {
      const cur = firstInviteByListing.get(iv.listingId);
      if (!cur || iv.createdAt < cur)
        firstInviteByListing.set(iv.listingId, iv.createdAt);
    }
    const inviteToFirstBid: number[] = [];
    for (const [lid, inv] of firstInviteByListing) {
      const fb = firstBidByListing.get(lid);
      if (fb && fb > inv) inviteToFirstBid.push(hours(+fb - +inv));
    }
    const closeToAward = listings
      .filter((l) => l.closesAt && l.awardedAt && l.awardedAt > l.closesAt)
      .map((l) => hours(+l.awardedAt! - +l.closesAt!));
    const orderByListing = new Map(
      orders.filter((o) => o.listingId).map((o) => [o.listingId!, o.createdAt]),
    );
    const awardToOrder = listings
      .filter((l) => l.awardedAt && orderByListing.get(l.id))
      .map((l) => hours(+orderByListing.get(l.id)! - +l.awardedAt!))
      .filter((h) => h >= 0);

    // Aylık sparkline: ay bazında sayaçlar → aynı formülle dakika.
    const months: { key: string; minutes: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inM = <T extends { createdAt: Date }>(rows: T[]) =>
        rows.filter((r) => r.createdAt >= d && r.createdAt < next);
      const mBids = inM(bids);
      const mCounters: TimeSavingsCounters = {
        listings: inM(listings).length,
        invitations: inM(invitations).length,
        bids: mBids.length,
        avgItemsPerBid: counters.avgItemsPerBid,
        revisionRounds: mBids.reduce(
          (a, b) =>
            a + Math.max(0, b.round - 1) + Math.max(0, (b.version ?? 1) - 1),
          0,
        ),
        approvals: inM(approvals).length,
        orders: inM(orders).length,
      };
      months.push({
        key: mk,
        minutes: computeSavings(params, mCounters).saved,
      });
    }

    const result: TimeSavingsResult = {
      savedMinutes: saved,
      estimatedMailMinutes: estimated,
      systemMinutes: system,
      laborValueTry:
        params.hourlyLaborCost != null
          ? Math.round((saved / 60) * params.hourlyLaborCost)
          : null,
      counters,
      breakdown,
      measured: {
        inviteToFirstBidHours: median(inviteToFirstBid.map(round1)),
        closeToAwardHours: median(closeToAward.map(round1)),
        awardToOrderHours: median(awardToOrder.map(round1)),
      },
      months,
      params,
    };
    this.cache.set(key, { at: Date.now(), value: result });
    return result;
  }

  /** Config değişince cache bayatlamasın. */
  invalidate(companyId?: string) {
    if (!companyId) this.cache.clear();
    else
      for (const k of this.cache.keys())
        if (k.startsWith(`${companyId}:`)) this.cache.delete(k);
  }
}
