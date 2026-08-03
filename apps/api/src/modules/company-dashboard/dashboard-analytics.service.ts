import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  periodStart,
  type SavingsPeriod,
} from "./time-savings.service";

/**
 * Pano analitiği — panel başına TEK toplu uç. Tüm seriler MEVCUT zaman
 * damgalarından türetilir (uydurma yok); parasal seriler TRY-bazlıdır
 * (çoklu birimi tek eksende toplamak yanıltıcı — reports-summary ile aynı
 * karar, UI etikette söyler). Hedef/bütçe verisi platformda YOK — o
 * grafikler frontend'de EmptyState + TODO.
 * 5 dk in-memory cache (time-savings deseni).
 */

const MONTHS_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

export interface MonthPoint {
  key: string;
  label: string;
  value: number;
}

/** Son 12 ayın başlangıçları (eskiden yeniye). */
export function monthWindows(now: Date): { start: Date; end: Date; key: string; label: string }[] {
  const out: { start: Date; end: Date; key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({
      start,
      end,
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS_TR[start.getMonth()]!,
    });
  }
  return out;
}

/** Önceki eşit-uzunluklu döneme göre % değişim (önceki 0 ise null). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Özel tarih aralığı — `to` HARİÇ üst sınır (controller gün+1 kurar). */
export interface PeriodRange {
  from: Date;
  to: Date;
}

/** Dönemin bir önceki eş penceresi. */
export function previousWindow(
  period: SavingsPeriod,
  now: Date,
): { start: Date; end: Date } {
  const end = periodStart(period, now);
  const months = period === "month" ? 1 : period === "quarter" ? 3 : 12;
  const start = new Date(end.getFullYear(), end.getMonth() - months, 1);
  return { start, end };
}

function bucketize<T>(
  rows: T[],
  at: (r: T) => Date | null | undefined,
  val: (r: T) => number,
  windows: ReturnType<typeof monthWindows>,
): MonthPoint[] {
  return windows.map((w) => ({
    key: w.key,
    label: w.label,
    value: rows.reduce((sum, r) => {
      const d = at(r);
      return d && d >= w.start && d < w.end ? sum + val(r) : sum;
    }, 0),
  }));
}

function avgBucketize<T>(
  rows: T[],
  at: (r: T) => Date | null | undefined,
  val: (r: T) => number,
  windows: ReturnType<typeof monthWindows>,
): { key: string; label: string; value: number | null }[] {
  return windows.map((w) => {
    const inWin = rows.filter((r) => {
      const d = at(r);
      return d && d >= w.start && d < w.end;
    });
    if (inWin.length === 0) return { key: w.key, label: w.label, value: null };
    const avg = inWin.reduce((s, r) => s + val(r), 0) / inWin.length;
    return { key: w.key, label: w.label, value: Math.round(avg * 10) / 10 };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface CacheEntry {
  at: number;
  value: unknown;
}

@Injectable()
export class DashboardAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cache = new Map<string, CacheEntry>();
  private static readonly CACHE_MS = 5 * 60_000;

  private cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < DashboardAnalyticsService.CACHE_MS) {
      return Promise.resolve(hit.value as T);
    }
    return compute().then((value) => {
      this.cache.set(key, { at: Date.now(), value });
      return value;
    });
  }

  // ── SATINALMA ────────────────────────────────────────────────────────────
  async satinalma(companyId: string, period: SavingsPeriod, range?: PeriodRange) {
    const rangeKey = range ? `:${+range.from}-${+range.to}` : "";
    return this.cached(`sa:${companyId}:${period}${rangeKey}`, async () => {
      const now = new Date();
      // Özel aralık: [from, to) dönem penceresi; önceki dönem = eşit uzunlukta
      // hemen öncesi. Aralıksızda mevcut month/quarter/year davranışı.
      const start = range?.from ?? periodStart(period, now);
      const end = range?.to ?? now;
      const prev = range
        ? { start: new Date(2 * +start - +end), end: start }
        : previousWindow(period, now);
      const windows = monthWindows(now);
      const from = [windows[0]!.start, prev.start, start].reduce((a, b) =>
        a < b ? a : b,
      );
      const in30d = new Date(now.getTime() + 30 * 86_400_000);

      const [listings, bids, approvals, orders, payments] = await Promise.all([
        this.prisma.listing.findMany({
          where: { companyId, type: "ALIM", status: { not: "DRAFT" }, createdAt: { gte: from } },
          select: {
            id: true, number: true, title: true, status: true,
            createdAt: true, closesAt: true, awardedAt: true,
            categoryIds: true, primaryCurrency: true,
            items: { select: { id: true, quantity: true, targetPrice: true } },
            bids: {
              where: { status: { in: ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] } },
              select: {
                status: true, currency: true, submittedAt: true, createdAt: true,
                bidderCompany: { select: { name: true } },
                items: { select: { itemId: true, unitPrice: true } },
              },
            },
            invitations: { select: { invitedCompanyId: true, createdAt: true } },
          },
        }),
        this.prisma.listingBid.findMany({
          where: {
            listing: { companyId, type: "ALIM" },
            status: { in: ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] },
            createdAt: { gte: from },
          },
          select: { createdAt: true, submittedAt: true },
        }),
        this.prisma.approvalRequest.findMany({
          where: { companyId, status: "PENDING" },
          select: { id: true },
        }),
        this.prisma.companyOrder.findMany({
          where: { buyerCompanyId: companyId, createdAt: { gte: from } },
          select: {
            id: true, status: true, createdAt: true, amount: true, currency: true,
            listingId: true, expectedDeliveryDate: true, paymentDays: true,
            deliveredAt: true, completedAt: true,
          },
        }),
        this.prisma.companyOrderPayment.findMany({
          where: { order: { buyerCompanyId: companyId }, status: "CONFIRMED" },
          select: { orderId: true, amount: true },
        }),
      ]);

      const inWin = <T extends { createdAt: Date }>(rows: T[], s: Date, e?: Date) =>
        rows.filter((r) => r.createdAt >= s && (!e || r.createdAt < e));

      // ── Aksiyon merkezi (anlık durum) ──
      const soon = new Date(now.getTime() + 3 * 86_400_000);
      const openListings = listings.filter((l) => l.status === "OPEN");
      const confirmedByOrder = new Map<string, number>();
      for (const p of payments) {
        confirmedByOrder.set(
          p.orderId,
          (confirmedByOrder.get(p.orderId) ?? 0) + Number(p.amount),
        );
      }
      const liveOrders = orders.filter(
        (o) => !["REJECTED", "CANCELLED"].includes(o.status),
      );
      const unpaid = (o: (typeof orders)[number]) =>
        Number(o.amount) - (confirmedByOrder.get(o.id) ?? 0) > 0.01;
      // Vade kolonu yok — S7 kuralı: teslim (deliveredAt/completedAt) + paymentDays.
      const dueDateOf = (o: (typeof orders)[number]): Date | null => {
        const base = o.deliveredAt ?? o.completedAt;
        if (!base || o.paymentDays == null) return null;
        return new Date(base.getTime() + o.paymentDays * 86_400_000);
      };
      const actions = {
        closingSoon: openListings.filter(
          (l) => l.closesAt && l.closesAt > now && l.closesAt <= soon,
        ).length,
        awaitingDecision: listings.filter(
          (l) =>
            ["OPEN", "IN_AWARD"].includes(l.status) &&
            l.bids.some((b) => b.status === "SUBMITTED"),
        ).length,
        pendingApprovals: approvals.length,
        overdueDeliveries: liveOrders.filter(
          (o) =>
            ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"].includes(o.status) &&
            o.expectedDeliveryDate && o.expectedDeliveryDate < now,
        ).length,
        pendingPayments: liveOrders.filter((o) => {
          const due = dueDateOf(o);
          return due && due < now && unpaid(o);
        }).length,
      };

      // ── Funnel (dönem içi akış) ──
      const pListings = inWin(listings, start, end);
      const pBids = inWin(bids, start, end);
      const pAwarded = listings.filter(
        (l) => l.awardedAt && l.awardedAt >= start && l.awardedAt < end,
      );
      const pOrders = inWin(liveOrders, start, end);
      const pDelivered = liveOrders.filter((o) => {
        const d = o.deliveredAt ?? o.completedAt;
        return d && d >= start && d < end;
      });
      const funnel = [
        { key: "listings", label: "İhale", count: pListings.length },
        { key: "bids", label: "Teklif Alan", count: pListings.filter((l) => l.bids.length > 0).length },
        { key: "awarded", label: "Kazandırılan", count: pAwarded.length },
        { key: "orders", label: "Sipariş", count: pOrders.length },
        { key: "delivered", label: "Teslim", count: pDelivered.length },
      ];

      // ── Döngü süresi: ihale açılışı → İLK sipariş (aylık ort. gün) ──
      const orderByListing = new Map<string, Date>();
      for (const o of liveOrders) {
        if (!o.listingId) continue;
        const cur = orderByListing.get(o.listingId);
        if (!cur || o.createdAt < cur) orderByListing.set(o.listingId, o.createdAt);
      }
      const cycles = listings
        .filter((l) => orderByListing.has(l.id))
        .map((l) => ({
          createdAt: orderByListing.get(l.id)!,
          days: (+orderByListing.get(l.id)! - +l.createdAt) / 86_400_000,
        }))
        .filter((c) => c.days >= 0);
      const cycleTrend = avgBucketize(cycles, (c) => c.createdAt, (c) => c.days, windows);

      // ── Tasarruf: hedef fiyat bazlı (mevcut Tasarruf sekmesi formülü),
      //    TRY-dışı ihale hariç (kur-tarihli dönüşüm ağır; UI etikette). ──
      const savingsOf = (l: (typeof listings)[number]): number => {
        if (l.primaryCurrency !== "TRY") return 0;
        const itemMap = new Map(l.items.map((i) => [i.id, i]));
        let s = 0;
        for (const b of l.bids) {
          if (b.status !== "WON" && b.status !== "AWARDED_PARTIAL") continue;
          for (const bi of b.items) {
            const it = itemMap.get(bi.itemId);
            if (!it || it.targetPrice == null) continue;
            const diff = (Number(it.targetPrice) - Number(bi.unitPrice)) * Number(it.quantity);
            if (diff > 0) s += diff;
          }
        }
        return s;
      };
      const awardedAll = listings.filter((l) => l.awardedAt);
      const savingsMonthly = bucketize(
        awardedAll, (l) => l.awardedAt, (l) => savingsOf(l), windows,
      ).map((p) => ({ ...p, value: round2(p.value) }));
      let cum = 0;
      const savingsTrend = savingsMonthly.map((p) => {
        cum = round2(cum + p.value);
        return { ...p, cumulative: cum };
      });

      // ── Kategori tasarrufu (dönem içi, TUTARLI) ──
      const catAgg = new Map<string, { savings: number; volume: number }>();
      for (const l of awardedAll.filter(
        (l) => l.awardedAt! >= start && l.awardedAt! < end,
      )) {
        const seg = l.categoryIds[0] ? `${l.categoryIds[0].slice(0, 2)}000000` : null;
        if (!seg || l.primaryCurrency !== "TRY") continue;
        const itemMap = new Map(l.items.map((i) => [i.id, i]));
        let vol = 0;
        for (const b of l.bids) {
          if (b.status !== "WON" && b.status !== "AWARDED_PARTIAL") continue;
          for (const bi of b.items) {
            const it = itemMap.get(bi.itemId);
            if (it) vol += Number(bi.unitPrice) * Number(it.quantity);
          }
        }
        const cur = catAgg.get(seg) ?? { savings: 0, volume: 0 };
        cur.savings += savingsOf(l);
        cur.volume += vol;
        catAgg.set(seg, cur);
      }
      const segIds = [...catAgg.keys()];
      const segNames = segIds.length
        ? await this.prisma.category.findMany({
            where: { id: { in: segIds } },
            select: { id: true, nameTr: true },
          })
        : [];
      const nameById = new Map(segNames.map((c) => [c.id, c.nameTr]));
      const categorySavings = [...catAgg.entries()]
        .map(([id, a]) => ({
          label: nameById.get(id) ?? id,
          amount: round2(a.savings),
          percent: a.volume > 0 ? round2((a.savings / a.volume) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);

      // ── Top-5 tasarruflu ihale (dönem içi) ──
      const topSavings = awardedAll
        .filter((l) => l.awardedAt! >= start && l.awardedAt! < end)
        .map((l) => ({ number: l.number ?? "—", title: l.title, amount: round2(savingsOf(l)) }))
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // ── Rekabet skoru ──
      const decidedOrOpen = pListings;
      const avgBidsPerListing =
        decidedOrOpen.length > 0
          ? round2(decidedOrOpen.reduce((s, l) => s + l.bids.length, 0) / decidedOrOpen.length)
          : 0;
      const lowCompetition = openListings
        .filter((l) => l.bids.length < 2)
        .map((l) => ({
          id: l.id, number: l.number ?? "—", title: l.title,
          bidCount: l.bids.length, closesAt: l.closesAt?.toISOString() ?? null,
        }))
        .slice(0, 6);

      // ── Tedarikçi tablosu (12 ay): teklif + kazanma + ort. yanıt ──
      const inviteAt = new Map<string, Date>();
      for (const l of listings)
        for (const iv of l.invitations) {
          const k = `${l.id}:${iv.invitedCompanyId}`;
          const cur = inviteAt.get(k);
          if (!cur || iv.createdAt < cur) inviteAt.set(k, iv.createdAt);
        }
      const supAgg = new Map<string, { bids: number; won: number; decided: number; respSum: number; respN: number }>();
      for (const l of listings)
        for (const b of l.bids) {
          const name = b.bidderCompany.name;
          const cur = supAgg.get(name) ?? { bids: 0, won: 0, decided: 0, respSum: 0, respN: 0 };
          cur.bids += 1;
          if (b.status !== "SUBMITTED") {
            cur.decided += 1;
            if (b.status !== "LOST") cur.won += 1;
          }
          cur.respN += 0; // yanıt süresi davet eşleşmesiyle aşağıda
          supAgg.set(name, cur);
        }
      // Yanıt süresi: davet→ilk teklif (firma bazında ortalama saat).
      for (const l of listings) {
        const firstBidBy = new Map<string, Date>();
        for (const b of l.bids) {
          if (!b.submittedAt) continue;
          const name = b.bidderCompany.name;
          const cur = firstBidBy.get(name);
          if (!cur || b.submittedAt < cur) firstBidBy.set(name, b.submittedAt);
        }
        for (const iv of l.invitations) {
          // davetli firma adı elimizde yok (yalnız id) — teklif verenle eşleşme
          // isim üzerinden yapılamaz; TODO: invitation'a firma adı select'i
          // eklenirse yanıt süresi davetliye bağlanır. Şimdilik teklif
          // zamanı - ihale yayınının yaklaşıklaması KULLANILMAZ (uydurma olur).
          void iv;
        }
      }
      const suppliers = [...supAgg.entries()]
        .map(([name, a]) => ({
          name,
          bids: a.bids,
          winRatePct: a.decided > 0 ? Math.round((a.won / a.decided) * 100) : null,
          avgResponseHours: null as number | null, // TODO: davetli adı yok (üstteki not)
        }))
        .sort((a, b) => b.bids - a.bids)
        .slice(0, 8);

      // ── Nakit takvimi: önümüzdeki 30 gün, haftalık kalan-borç ──
      const weeks: { start: Date; label: string; amount: number }[] = [];
      for (let i = 0; i < 5; i++) {
        const ws = new Date(now.getTime() + i * 7 * 86_400_000);
        weeks.push({
          start: ws,
          label: `${ws.getDate()} ${MONTHS_TR[ws.getMonth()]}`,
          amount: 0,
        });
      }
      for (const o of liveOrders) {
        const due = dueDateOf(o);
        if (!due || o.currency !== "TRY") continue;
        if (due < now || due > in30d) continue;
        const remaining = Number(o.amount) - (confirmedByOrder.get(o.id) ?? 0);
        if (remaining <= 0) continue;
        const idx = Math.min(4, Math.floor((+due - +now) / (7 * 86_400_000)));
        weeks[idx]!.amount = round2(weeks[idx]!.amount + remaining);
      }
      const cashCalendar = weeks.map((w) => ({ label: w.label, amount: w.amount }));

      // ── KPI serileri + delta ──
      const kpiSeries = {
        listings: bucketize(listings, (l) => l.createdAt, () => 1, windows),
        bids: bucketize(bids, (b) => b.createdAt, () => 1, windows),
        awarded: bucketize(awardedAll, (l) => l.awardedAt, () => 1, windows),
        orders: bucketize(liveOrders, (o) => o.createdAt, () => 1, windows),
      };
      const deltas = {
        listings: deltaPct(pListings.length, inWin(listings, prev.start, prev.end).length),
        bids: deltaPct(pBids.length, inWin(bids, prev.start, prev.end).length),
        awarded: deltaPct(
          pAwarded.length,
          awardedAll.filter((l) => l.awardedAt! >= prev.start && l.awardedAt! < prev.end).length,
        ),
        orders: deltaPct(pOrders.length, inWin(liveOrders, prev.start, prev.end).length),
      };

      return {
        actions, funnel, cycleTrend, savingsTrend, categorySavings, topSavings,
        competition: { avgBidsPerListing, lowCompetition },
        suppliers, cashCalendar, kpiSeries, deltas,
      };
    });
  }

  // ── SATIŞ ────────────────────────────────────────────────────────────────
  async satis(companyId: string, period: SavingsPeriod, range?: PeriodRange) {
    const rangeKey = range ? `:${+range.from}-${+range.to}` : "";
    return this.cached(`st:${companyId}:${period}${rangeKey}`, async () => {
      const now = new Date();
      const start = range?.from ?? periodStart(period, now);
      const end = range?.to ?? now;
      const prev = range
        ? { start: new Date(2 * +start - +end), end: start }
        : previousWindow(period, now);
      const windows = monthWindows(now);
      const from = [windows[0]!.start, prev.start, start].reduce((a, b) =>
        a < b ? a : b,
      );

      const [bids, invitations, orders] = await Promise.all([
        this.prisma.listingBid.findMany({
          where: {
            bidderCompanyId: companyId,
            status: { in: ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] },
            createdAt: { gte: from },
          },
          select: {
            createdAt: true, submittedAt: true, eliminatedAt: true,
            status: true, amount: true, currency: true, listingId: true,
            listing: {
              select: {
                status: true, awardedAt: true, closesAt: true, categoryIds: true,
              },
            },
          },
        }),
        this.prisma.listingInvitation.findMany({
          where: { invitedCompanyId: companyId, createdAt: { gte: from } },
          select: {
            createdAt: true, listingId: true,
            listing: { select: { status: true, closesAt: true } },
          },
        }),
        this.prisma.companyOrder.findMany({
          where: {
            sellerCompanyId: companyId,
            status: { notIn: ["REJECTED", "CANCELLED"] },
            createdAt: { gte: from },
          },
          select: {
            createdAt: true, amount: true, currency: true,
            buyerCompanyId: true, expectedDeliveryDate: true, status: true,
            buyer: { select: { name: true } },
          },
        }),
      ]);

      // ── Aksiyonlar ──
      const bidByListing = new Set(bids.map((b) => b.listingId));
      const openInvitesNoBid = invitations.filter(
        (iv) => iv.listing.status === "OPEN" && !bidByListing.has(iv.listingId),
      );
      const soon = new Date(now.getTime() + 3 * 86_400_000);
      const actions = {
        unansweredInvites: openInvitesNoBid.length,
        closingSoonInvites: openInvitesNoBid.filter(
          (iv) => iv.listing.closesAt && iv.listing.closesAt > now && iv.listing.closesAt <= soon,
        ).length,
        overdueDeliveries: orders.filter(
          (o) =>
            ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"].includes(o.status) &&
            o.expectedDeliveryDate && o.expectedDeliveryDate < now,
        ).length,
      };

      // ── Gelir trendi (TRY siparişler) + kümülatif ──
      const tryOrders = orders.filter((o) => o.currency === "TRY");
      const revenueMonthly = bucketize(
        tryOrders, (o) => o.createdAt, (o) => Number(o.amount), windows,
      ).map((p) => ({ ...p, value: round2(p.value) }));
      let cum = 0;
      const revenueTrend = revenueMonthly.map((p) => {
        cum = round2(cum + p.value);
        return { ...p, cumulative: cum };
      });

      // ── Kazanma/kaybetme aylık yığın (karar tarihine göre) ──
      const decidedAt = (b: (typeof bids)[number]): Date | null =>
        b.status === "LOST"
          ? (b.eliminatedAt ?? b.listing.awardedAt ?? null)
          : b.status === "WON" || b.status === "AWARDED_PARTIAL"
            ? (b.listing.awardedAt ?? null)
            : null;
      const winLoss = windows.map((w) => {
        let won = 0, lost = 0, pending = 0;
        for (const b of bids) {
          const d = decidedAt(b);
          if (d) {
            if (d >= w.start && d < w.end)
              b.status === "LOST" ? lost++ : won++;
          } else if (b.createdAt >= w.start && b.createdAt < w.end) {
            pending++;
          }
        }
        return { key: w.key, label: w.label, won, lost, pending };
      });

      // ── Pipeline (dönem içi): davet ADET (tutar bilinemez — teklif yok),
      //    sonrası TRY tutar. ──
      const pBids = bids.filter((b) => b.createdAt >= start && b.createdAt < end);
      const tryAmt = (rows: typeof bids) =>
        round2(rows.filter((b) => b.currency === "TRY").reduce((s, b) => s + Number(b.amount), 0));
      const submitted = pBids;
      const evaluating = pBids.filter(
        (b) => b.status === "SUBMITTED" && ["IN_AWARD", "IN_AWARD_APPROVAL"].includes(b.listing.status),
      );
      const wonBids = pBids.filter((b) => b.status === "WON" || b.status === "AWARDED_PARTIAL");
      const pipeline = [
        {
          key: "invites", label: "Davet",
          count: invitations.filter(
            (iv) => iv.createdAt >= start && iv.createdAt < end,
          ).length,
          amountTry: null as number | null, // TODO: teklifsiz davetin tutarı yok
        },
        { key: "submitted", label: "Teklif Verildi", count: submitted.length, amountTry: tryAmt(submitted) },
        { key: "evaluating", label: "Değerlendirmede", count: evaluating.length, amountTry: tryAmt(evaluating) },
        { key: "won", label: "Kazanıldı", count: wonBids.length, amountTry: tryAmt(wonBids) },
      ];

      // ── Müşteri Pareto (12 ay TRY gelir) ──
      const byBuyer = new Map<string, number>();
      for (const o of tryOrders) {
        const name = o.buyer?.name ?? o.buyerCompanyId;
        byBuyer.set(name, round2((byBuyer.get(name) ?? 0) + Number(o.amount)));
      }
      const totalRev = round2([...byBuyer.values()].reduce((a, b) => a + b, 0));
      const paretoRows = [...byBuyer.entries()]
        .map(([name, amount]) => ({
          name, amount,
          sharePct: totalRev > 0 ? Math.round((amount / totalRev) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      const pareto = {
        rows: paretoRows,
        totalTry: totalRev,
        concentrationWarning: paretoRows.some((r) => r.sharePct > 40),
      };

      // ── Yanıt süresi trendi: davet → aynı ihaledeki İLK teklifim ──
      const firstInvite = new Map<string, Date>();
      for (const iv of invitations) {
        const cur = firstInvite.get(iv.listingId);
        if (!cur || iv.createdAt < cur) firstInvite.set(iv.listingId, iv.createdAt);
      }
      const responses: { at: Date; hours: number }[] = [];
      for (const b of bids) {
        const inv = firstInvite.get(b.listingId);
        if (!inv || !b.submittedAt || b.submittedAt < inv) continue;
        responses.push({ at: b.submittedAt, hours: (+b.submittedAt - +inv) / 3_600_000 });
      }
      const responseTrend = avgBucketize(responses, (r) => r.at, (r) => r.hours, windows);

      // ── Kategori bazlı kazanma oranı (12 ay, karara bağlananlar) ──
      const catAgg = new Map<string, { won: number; decided: number }>();
      for (const b of bids) {
        if (b.status === "SUBMITTED") continue;
        const seg = b.listing.categoryIds[0]
          ? `${b.listing.categoryIds[0].slice(0, 2)}000000`
          : null;
        if (!seg) continue;
        const cur = catAgg.get(seg) ?? { won: 0, decided: 0 };
        cur.decided += 1;
        if (b.status !== "LOST") cur.won += 1;
        catAgg.set(seg, cur);
      }
      const segIds = [...catAgg.keys()];
      const segNames = segIds.length
        ? await this.prisma.category.findMany({
            where: { id: { in: segIds } },
            select: { id: true, nameTr: true },
          })
        : [];
      const nameById = new Map(segNames.map((c) => [c.id, c.nameTr]));
      const categoryWinRate = [...catAgg.entries()]
        .map(([id, a]) => ({
          label: nameById.get(id) ?? id,
          winPct: Math.round((a.won / a.decided) * 100),
          decided: a.decided,
        }))
        .sort((a, b) => b.decided - a.decided)
        .slice(0, 6);

      // ── Kaçırılan fırsatlar: teklifsiz KAPANMIŞ davetler (12 ay) ──
      const missed = invitations.filter(
        (iv) => iv.listing.status !== "OPEN" && !bidByListing.has(iv.listingId),
      );
      // TODO: kaçırılan fırsatın TUTARI bilinemez (teklif verilmedi; ihale
      // toplam değeri platformda tutulmuyor) — yalnız adet.

      // ── KPI serileri + delta ──
      const kpiSeries = {
        bidsSubmitted: bucketize(bids, (b) => b.createdAt, () => 1, windows),
        won: bucketize(bids.filter((b) => decidedAt(b) && b.status !== "LOST"), decidedAt, () => 1, windows),
        orders: bucketize(orders, (o) => o.createdAt, () => 1, windows),
        revenue: revenueMonthly,
      };
      const inWin = <T,>(rows: T[], at: (r: T) => Date, s: Date, e?: Date) =>
        rows.filter((r) => at(r) >= s && (!e || at(r) < e)).length;
      const deltas = {
        bidsSubmitted: deltaPct(
          pBids.length,
          inWin(bids, (b) => b.createdAt, prev.start, prev.end),
        ),
        orders: deltaPct(
          inWin(orders, (o) => o.createdAt, start, end),
          inWin(orders, (o) => o.createdAt, prev.start, prev.end),
        ),
        revenue: deltaPct(
          round2(tryOrders.filter((o) => o.createdAt >= start && o.createdAt < end).reduce((s, o) => s + Number(o.amount), 0)),
          round2(tryOrders.filter((o) => o.createdAt >= prev.start && o.createdAt < prev.end).reduce((s, o) => s + Number(o.amount), 0)),
        ),
      };

      return {
        actions, revenueTrend, winLoss, pipeline, pareto,
        responseTrend, categoryWinRate,
        missed: { count: missed.length, amountTry: null as number | null },
        kpiSeries, deltas,
      };
    });
  }
}
