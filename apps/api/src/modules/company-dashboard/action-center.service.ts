import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Aksiyon Merkezi — "bugün ne yapmalıyım" tek uyarı sistemi (pano refactor
 * Faz 2). Her satır SAYI + ZAMAN bilgisi taşır (en yakın son tarih / en büyük
 * gecikme / en eski bekleme); metin ve CTA frontend'de tek harita.
 *
 * Bilinçli karar: bildirim (Notification) tablosuyla BİRLEŞTİRİLMEDİ —
 * bildirimler geçmiş olay kaydıdır (severity/dueAt/resolvedAt alanı yok),
 * buradaki satırlar canlı sorgudan gelir; dedupe yapısal olarak mümkün değil.
 *
 * Cache YOK: satırlar aksiyona bağlı anlık durumdur (5 dk bayat "ödemesi
 * gecikti" uyarısı yanıltır); sorgular dar select'li ve indeksli.
 */

export type ActionSeverity = "critical" | "warning" | "info";

export interface ActionCenterRow {
  key: string;
  severity: ActionSeverity;
  count: number;
  /** En yakın gelecekteki son tarih (ISO) — "N gün kaldı / bugün / yarın". */
  dueAt: string | null;
  /** En büyük gecikme (gün) — "N gün gecikti". */
  overdueDays: number | null;
  /** En eski bekleme (gün) — "N gündür bekliyor". */
  waitingDays: number | null;
}

const DAY_MS = 86_400_000;
const SEVERITY_RANK: Record<ActionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function daysAgo(d: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
}

function minDate(dates: (Date | null | undefined)[]): Date | null {
  let min: Date | null = null;
  for (const d of dates) {
    if (d && (!min || d < min)) min = d;
  }
  return min;
}

/** Satır kurucu — count 0 ise null (sahte satır üretilmez). */
function row(
  key: string,
  severity: ActionSeverity,
  count: number,
  time: {
    dueAt?: Date | null;
    overdueDays?: number | null;
    waitingDays?: number | null;
  } = {},
): ActionCenterRow | null {
  if (count <= 0) return null;
  return {
    key,
    severity,
    count,
    dueAt: time.dueAt ? time.dueAt.toISOString() : null,
    overdueDays: time.overdueDays ?? null,
    waitingDays: time.waitingDays ?? null,
  };
}

/** Sıralama: severity DESC → gecikme (büyük önce) → son tarih ASC → bekleme DESC. */
function sortRows(rows: ActionCenterRow[]): ActionCenterRow[] {
  return rows.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const aOver = a.overdueDays ?? -1;
    const bOver = b.overdueDays ?? -1;
    if (aOver !== bOver) return bOver - aOver;
    const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return (b.waitingDays ?? 0) - (a.waitingDays ?? 0);
  });
}

@Injectable()
export class ActionCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async satinalma(companyId: string): Promise<{ rows: ActionCenterRow[] }> {
    const now = new Date();
    const in2d = new Date(now.getTime() + 2 * DAY_MS);
    const in3d = new Date(now.getTime() + 3 * DAY_MS);

    const [openListings, decisionListings, approvals, orders, payments] =
      await Promise.all([
        // Açık ihaleler: kapanış + teklif varlığı (bugün/yarın + 0-teklif satırları).
        this.prisma.listing.findMany({
          where: { companyId, type: "ALIM", status: "OPEN" },
          select: {
            closesAt: true,
            bids: {
              where: { status: { not: "DRAFT" } },
              select: { id: true },
              take: 1,
            },
          },
        }),
        // Karar bekleyen: OPEN/IN_AWARD + SUBMITTED teklif (en eski gönderim).
        this.prisma.listing.findMany({
          where: {
            companyId,
            type: "ALIM",
            status: { in: ["OPEN", "IN_AWARD"] },
            bids: { some: { status: "SUBMITTED" } },
          },
          select: {
            bids: {
              where: { status: "SUBMITTED" },
              select: { submittedAt: true },
            },
          },
        }),
        this.prisma.approvalRequest.findMany({
          where: { companyId, status: "PENDING" },
          select: { createdAt: true },
        }),
        this.prisma.companyOrder.findMany({
          where: {
            buyerCompanyId: companyId,
            // P8 HIGH: COMPLETED DIŞLANMAZ. Madde 17 ile "Teslim Aldım"
            // siparişi doğrudan COMPLETED yapıyor; borç ise AYRI izleniyor
            // (business-rules §3: "COMPLETED = operasyonel bitiş, ödeme
            // bağımsız"). COMPLETED evrenden atılınca vadesi geçmiş ödeme
            // sinyali pratikte hiç ateşlenmiyordu. Operasyonel satırlar
            // (teslim/onay bekleyen) zaten kendi status filtrelerini uygular.
            status: { notIn: ["REJECTED", "CANCELLED", "DISPUTED"] },
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            amount: true,
            expectedDeliveryDate: true,
            paymentDays: true,
            deliveredAt: true,
            completedAt: true,
          },
        }),
        this.prisma.companyOrderPayment.findMany({
          where: { order: { buyerCompanyId: companyId }, status: "CONFIRMED" },
          select: { orderId: true, amount: true },
        }),
      ]);

    // ── Ödeme vadesi (S7 kuralı: vade kolonu yok → teslim + paymentDays) ──
    const confirmedByOrder = new Map<string, number>();
    for (const p of payments) {
      confirmedByOrder.set(
        p.orderId,
        (confirmedByOrder.get(p.orderId) ?? 0) + Number(p.amount),
      );
    }
    const unpaid = (o: (typeof orders)[number]) =>
      Number(o.amount) - (confirmedByOrder.get(o.id) ?? 0) > 0.01;
    const dueDateOf = (o: (typeof orders)[number]): Date | null => {
      const base = o.deliveredAt ?? o.completedAt;
      if (!base || o.paymentDays == null) return null;
      return new Date(base.getTime() + o.paymentDays * DAY_MS);
    };

    const overduePay = orders.filter((o) => {
      const due = dueDateOf(o);
      return due && due < now && unpaid(o);
    });
    const overdueDel = orders.filter(
      (o) =>
        ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"].includes(o.status) &&
        o.expectedDeliveryDate &&
        o.expectedDeliveryDate < now,
    );
    // 0 teklif + kapanışa <3 gün — davetli ekleme penceresi (kesişim sorgusu).
    const zeroBidSoon = openListings.filter(
      (l) =>
        l.bids.length === 0 && l.closesAt && l.closesAt > now && l.closesAt <= in3d,
    );
    // Bugün/yarın kapananlar — 0-teklif satırıyla çakışmasın (ayrık kümeler).
    const closingSoon = openListings.filter(
      (l) =>
        l.bids.length > 0 && l.closesAt && l.closesAt > now && l.closesAt <= in2d,
    );
    const oldestSubmitted = minDate(
      decisionListings.flatMap((l) => l.bids.map((b) => b.submittedAt)),
    );
    const sellerApproval = orders.filter((o) => o.status === "PENDING");
    const receive = orders.filter((o) => o.status === "IN_DELIVERY");
    const paymentWindow = orders.filter((o) => {
      // Madde 17: teslim alma siparişi COMPLETED yapıyor → yalnız DELIVERED'a
      // bakmak bu satırı ölü bırakıyordu (P8 HIGH ile aynı kök).
      if (
        (o.status !== "DELIVERED" && o.status !== "COMPLETED") ||
        !unpaid(o)
      ) {
        return false;
      }
      const due = dueDateOf(o);
      return !due || due >= now; // vadesi geçenler kırmızı satırda
    });

    const rows = [
      row("overduePayments", "critical", overduePay.length, {
        overdueDays: overduePay.length
          ? Math.max(...overduePay.map((o) => daysAgo(dueDateOf(o)!, now)))
          : null,
      }),
      row("overdueDeliveries", "critical", overdueDel.length, {
        overdueDays: overdueDel.length
          ? Math.max(...overdueDel.map((o) => daysAgo(o.expectedDeliveryDate!, now)))
          : null,
      }),
      row("zeroBidClosingSoon", "warning", zeroBidSoon.length, {
        dueAt: minDate(zeroBidSoon.map((l) => l.closesAt)),
      }),
      row("closingSoon", "warning", closingSoon.length, {
        dueAt: minDate(closingSoon.map((l) => l.closesAt)),
      }),
      row("awaitingDecision", "warning", decisionListings.length, {
        waitingDays: oldestSubmitted ? daysAgo(oldestSubmitted, now) : null,
      }),
      row("pendingApprovals", "warning", approvals.length, {
        waitingDays: approvals.length
          ? Math.max(...approvals.map((a) => daysAgo(a.createdAt, now)))
          : null,
      }),
      row("sellerApproval", "info", sellerApproval.length, {
        waitingDays: sellerApproval.length
          ? Math.max(...sellerApproval.map((o) => daysAgo(o.createdAt, now)))
          : null,
      }),
      row("receiveOrders", "info", receive.length),
      row("paymentWindow", "info", paymentWindow.length, {
        dueAt: minDate(paymentWindow.map((o) => dueDateOf(o))),
      }),
    ].filter((r): r is ActionCenterRow => r !== null);

    return { rows: sortRows(rows) };
  }

  async satis(companyId: string): Promise<{ rows: ActionCenterRow[] }> {
    const now = new Date();
    const in1d = new Date(now.getTime() + DAY_MS);
    const in3d = new Date(now.getTime() + 3 * DAY_MS);

    const [invitations, myBids, submittedBids, orders] = await Promise.all([
      // Açık davetler (teklif verilmemişleri frontend değil BURADA süzüyoruz).
      this.prisma.listingInvitation.findMany({
        where: { invitedCompanyId: companyId, listing: { status: "OPEN" } },
        select: {
          listingId: true,
          listing: { select: { closesAt: true } },
        },
      }),
      this.prisma.listingBid.findMany({
        where: { bidderCompanyId: companyId, status: { not: "DRAFT" } },
        select: { listingId: true },
      }),
      // Geçerliliği dolmak üzere teklifler: SUBMITTED + validityDays dolu,
      // ihale karar aşamasında (cron'daki mantığın panoya açılmış hali).
      this.prisma.listingBid.findMany({
        where: {
          bidderCompanyId: companyId,
          status: "SUBMITTED",
          validityDays: { not: null },
          submittedAt: { not: null },
          listing: { status: { in: ["OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"] } },
        },
        select: { submittedAt: true, validityDays: true },
      }),
      this.prisma.companyOrder.findMany({
        where: {
          sellerCompanyId: companyId,
          status: { notIn: ["REJECTED", "CANCELLED", "COMPLETED", "DISPUTED"] },
        },
        select: {
          status: true,
          createdAt: true,
          expectedDeliveryDate: true,
        },
      }),
    ]);

    const bidListingIds = new Set(myBids.map((b) => b.listingId));
    const unanswered = invitations.filter((iv) => !bidListingIds.has(iv.listingId));
    const unansweredDue = minDate(
      unanswered.map((iv) => iv.listing.closesAt).filter((d) => d && d > now),
    );

    const expiring = submittedBids
      .map((b) => new Date(b.submittedAt!.getTime() + b.validityDays! * DAY_MS))
      .filter((exp) => exp > now && exp <= in3d);

    const overdueDel = orders.filter(
      (o) =>
        ["ACCEPTED", "CREATED", "IN_DELIVERY"].includes(o.status) &&
        o.expectedDeliveryDate &&
        o.expectedDeliveryDate < now,
    );
    const pendingAccept = orders.filter((o) => o.status === "PENDING");
    const paymentWindow = orders.filter((o) => o.status === "DELIVERED");

    const rows = [
      row("overdueDeliveries", "critical", overdueDel.length, {
        overdueDays: overdueDel.length
          ? Math.max(...overdueDel.map((o) => daysAgo(o.expectedDeliveryDate!, now)))
          : null,
      }),
      // Son güne kalan davet = kritik; değilse uyarı.
      row(
        "unansweredInvites",
        unansweredDue && unansweredDue <= in1d ? "critical" : "warning",
        unanswered.length,
        { dueAt: unansweredDue },
      ),
      row("expiringBids", "warning", expiring.length, {
        dueAt: minDate(expiring),
      }),
      row("pendingOrders", "warning", pendingAccept.length, {
        waitingDays: pendingAccept.length
          ? Math.max(...pendingAccept.map((o) => daysAgo(o.createdAt, now)))
          : null,
      }),
      row("paymentWindow", "info", paymentWindow.length),
    ].filter((r): r is ActionCenterRow => r !== null);

    return { rows: sortRows(rows) };
  }
}
