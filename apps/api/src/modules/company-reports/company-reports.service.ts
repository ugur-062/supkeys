import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ListingType, Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Raporlama motoru — eski sistemin (tenant-reports) birleşik Company modeline
 * portu, iki portal için tip-farkında: type=ALIM (tasarruf dili, en düşük
 * kazanır) / type=SATIS (kazanç dili, en yüksek kazanır).
 * Üç rapor: Genel (SINGLE/RANGE), Tasarruf-Kazanç, Teklif Karşılaştırma.
 * Veri agregasyonu burada — Excel formatlama ReportsExcelService'te.
 */

export interface GeneralReportInput {
  mode: "SINGLE" | "RANGE";
  /** SINGLE: ihale numarası (ROT-…) ya da id. */
  listingId?: string;
  rangeStart?: string;
  rangeEnd?: string;
  format?: string; // RFQ | ENGLISH_AUCTION
  status?: string;
  currency?: string;
}

export interface SavingsReportInput {
  rangeStart: string;
  rangeEnd: string;
  currency?: string;
}

export interface ReportsSummary {
  /** Son 6 ay — adet bazlı hacim + TRY sipariş toplamı (yalnız TRY siparişler). */
  months: {
    key: string;
    label: string;
    listings: number;
    bids: number;
    orderTotalTry: number;
  }[];
  /** ALIM: sonuçlanan ihalelerden kazandırılan; SATIS: karara bağlanan tekliflerden kazanılan. */
  winRate: { won: number; total: number };
  orders: { count: number; avgTry: number | null };
  categories: { name: string; count: number }[];
}

export interface BidComparisonInput {
  /** İhale numarası ya da id. */
  listingId: string;
  criteria: "PRICE" | "ANSWERS" | "BOTH";
  includeNonBidders?: boolean;
  showBidCurrencies?: boolean;
  /** Önceki turların arşiv özetini (tur geçmişi) ekle. */
  includeRoundHistory?: boolean;
}

/** Gerçekten verilmiş teklif statüleri (taslak/geri çekilen hariç). */
const REAL_BID = ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] as const;

const BID_SELECT = {
  id: true,
  status: true,
  amount: true,
  currency: true,
  exchangeRateSnapshot: true,
  bidderCompanyId: true,
  round: true,
  isBuyNow: true,
  bidderCompany: { select: { name: true } },
} as const;

/** TRY karşılığı — çoklu birimde adil kıyas; snapshot'sız yabancı → null. */
function bidTry(b: {
  amount: unknown;
  currency: string;
  exchangeRateSnapshot: unknown | null;
}): number | null {
  const amt = Number(b.amount);
  if (b.currency === "TRY") return amt;
  if (b.exchangeRateSnapshot != null) return amt * Number(b.exchangeRateSnapshot);
  return null;
}

/**
 * Rapor satır tavanı (denetim 2026-08-24 Parça 5): aralık raporları `take`
 * olmadan tüm ihale + teklif + kalem + davet ağacını belleğe alıyordu. Rapor
 * bir ARŞİV değil, karar aracıdır; tavana dayanan rapor kullanıcıya "aralığı
 * daraltın" uyarısı döndürür.
 */
const MAX_REPORT_LISTINGS = 500;

@Injectable()
export class CompanyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Numara (ROT-…) ya da id → sahibin ilanının id'si (scope'ta değilse 404). */
  private async resolveListingId(
    companyId: string,
    idOrNumber: string,
  ): Promise<string> {
    const v = idOrNumber.trim();
    const row = await this.prisma.listing.findFirst({
      where: { companyId, OR: [{ id: v }, { number: v }] },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(
        "İhale bulunamadı — numara veya ID hatalı olabilir",
      );
    }
    return row.id;
  }

  /** Oluşturan kişi adları (Listing.createdById → CompanyUser). */
  private async userNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.companyUser.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`] as const),
    );
  }

  // ============================================================
  // 1) GENEL RAPOR — tek ihale VEYA tarih aralığı
  // ============================================================

  async general(companyId: string, type: ListingType, dto: GeneralReportInput) {
    const include = {
      invitations: { select: { id: true } },
      bids: { select: BID_SELECT },
      items: {
        select: { quantity: true, targetPrice: true, minUnitPrice: true },
      },
    } satisfies Prisma.ListingInclude;

    let listings;
    if (dto.mode === "SINGLE") {
      if (!dto.listingId?.trim()) {
        throw new BadRequestException("İhale numarası ya da ID zorunlu");
      }
      const id = await this.resolveListingId(companyId, dto.listingId);
      const one = await this.prisma.listing.findFirst({
        where: { id, companyId, type },
        include,
      });
      if (!one) throw new NotFoundException("İhale bulunamadı");
      listings = [one];
    } else {
      if (!dto.rangeStart || !dto.rangeEnd) {
        throw new BadRequestException("Tarih aralığı zorunlu");
      }
      listings = await this.prisma.listing.findMany({
        where: {
          companyId,
          type,
          createdAt: {
            gte: new Date(dto.rangeStart),
            lte: new Date(dto.rangeEnd),
          },
          ...(dto.format ? { format: dto.format as never } : {}),
          ...(dto.status ? { status: dto.status as never } : {}),
          ...(dto.currency ? { primaryCurrency: dto.currency as never } : {}),
        },
        include,
        orderBy: { createdAt: "desc" },
        take: MAX_REPORT_LISTINGS + 1,
      });
    }
    const truncated = listings.length > MAX_REPORT_LISTINGS;
    if (truncated) listings = listings.slice(0, MAX_REPORT_LISTINGS);

    const names = await this.userNames(listings.map((l) => l.createdById));
    const rows = listings.map((l) =>
      this.generalRow(l, type, names.get(l.createdById) ?? null),
    );

    return {
      mode: dto.mode,
      type,
      // Tavana dayandıysa kullanıcı bilir (sessiz kesme yok).
      truncated,
      maxRows: MAX_REPORT_LISTINGS,
      generatedAt: new Date().toISOString(),
      rangeStart: dto.rangeStart ?? null,
      rangeEnd: dto.rangeEnd ?? null,
      listings: rows,
      summary: this.summarizeGeneral(rows),
    };
  }

  private generalRow(
    l: {
      id: string;
      number: string | null;
      title: string;
      format: string | null;
      status: string;
      primaryCurrency: string;
      currentRound: number;
      closesAt: Date | null;
      publishedAt: Date | null;
      createdAt: Date;
      minPrice: unknown | null;
      invitations: { id: string }[];
      bids: Array<{
        status: string;
        amount: unknown;
        currency: string;
        exchangeRateSnapshot: unknown | null;
        bidderCompany: { name: string };
      }>;
      items: Array<{
        quantity: unknown;
        targetPrice: unknown | null;
        minUnitPrice: unknown | null;
      }>;
    },
    type: ListingType,
    createdBy: string | null,
  ) {
    const realBids = l.bids.filter((b) =>
      (REAL_BID as readonly string[]).includes(b.status),
    );
    const awardedBids = realBids.filter(
      (b) => b.status === "WON" || b.status === "AWARDED_PARTIAL",
    );
    const tryAmounts = realBids
      .map(bidTry)
      .filter((v): v is number => v != null);
    const winningTotal = awardedBids.length
      ? awardedBids.reduce((s, b) => s + (bidTry(b) ?? 0), 0)
      : null;
    const winnerName = awardedBids.length
      ? [...new Set(awardedBids.map((b) => b.bidderCompany.name))].join(", ")
      : null;
    const invitedCount = l.invitations.length;
    const responseRate =
      invitedCount > 0
        ? Math.round((realBids.length / invitedCount) * 1000) / 10
        : null;
    // Beklenen hacim: ALIM hedef fiyatlar; SATIS taban.
    const estimatedTotal =
      type === "ALIM"
        ? l.items.reduce(
            (s, it) =>
              s +
              (it.targetPrice ? Number(it.targetPrice) : 0) *
                Number(it.quantity),
            0,
          ) || null
        : l.minPrice != null
          ? Number(l.minPrice)
          : l.items.reduce(
              (s, it) =>
                s +
                (it.minUnitPrice ? Number(it.minUnitPrice) : 0) *
                  Number(it.quantity),
              0,
            ) || null;
    const highestTotal = tryAmounts.length ? Math.max(...tryAmounts) : null;
    const lowestTotal = tryAmounts.length ? Math.min(...tryAmounts) : null;
    // ALIM: tasarruf = en yüksek − kazanan; SATIS: kazanç = kazanan − en düşük.
    const delta =
      winningTotal == null
        ? null
        : type === "ALIM"
          ? highestTotal != null
            ? highestTotal - winningTotal
            : null
          : lowestTotal != null
            ? winningTotal - lowestTotal
            : null;

    return {
      id: l.id,
      number: l.number,
      title: l.title,
      format: l.format,
      status: l.status,
      currency: l.primaryCurrency,
      round: l.currentRound,
      closesAt: l.closesAt?.toISOString() ?? null,
      publishedAt: l.publishedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      createdBy,
      invitedCount,
      submittedBidCount: realBids.length,
      responseRate,
      estimatedTotal,
      highestTotal,
      lowestTotal,
      winningTotal,
      winnerName,
      delta,
    };
  }

  private summarizeGeneral(
    rows: ReturnType<CompanyReportsService["generalRow"]>[],
  ) {
    const statusBreakdown: Record<string, number> = {};
    for (const r of rows) {
      statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + 1;
    }
    const totalInvited = rows.reduce((s, r) => s + r.invitedCount, 0);
    const totalSubmittedBids = rows.reduce(
      (s, r) => s + r.submittedBidCount,
      0,
    );
    return {
      totalListings: rows.length,
      awardedListings: rows.filter((r) => r.status === "AWARDED").length,
      cancelledListings: statusBreakdown.CANCELLED ?? 0,
      statusBreakdown,
      totalInvited,
      totalSubmittedBids,
      overallResponseRate:
        totalInvited > 0
          ? Math.round((totalSubmittedBids / totalInvited) * 1000) / 10
          : 0,
      avgBidsPerListing:
        rows.length > 0
          ? Math.round((totalSubmittedBids / rows.length) * 10) / 10
          : 0,
      totalEstimated: rows.reduce((s, r) => s + (r.estimatedTotal ?? 0), 0),
      totalAwardedValue: rows.reduce((s, r) => s + (r.winningTotal ?? 0), 0),
      totalDelta: rows.reduce((s, r) => s + (r.delta ?? 0), 0),
    };
  }

  // ============================================================
  // 2) TASARRUF (ALIM) / KAZANÇ (SATIS) RAPORU
  // ============================================================

  async savings(companyId: string, type: ListingType, dto: SavingsReportInput) {
    if (!dto.rangeStart || !dto.rangeEnd) {
      throw new BadRequestException("Tarih aralığı zorunlu");
    }
    const listings = await this.prisma.listing.findMany({
      where: {
        companyId,
        type,
        status: "AWARDED",
        createdAt: {
          gte: new Date(dto.rangeStart),
          lte: new Date(dto.rangeEnd),
        },
        ...(dto.currency ? { primaryCurrency: dto.currency as never } : {}),
      },
      include: {
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            targetPrice: true,
            minUnitPrice: true,
            awardedQuantity: true,
          },
        },
        bids: {
          where: { status: { in: [...REAL_BID] } },
          select: {
            ...BID_SELECT,
            items: { select: { itemId: true, unitPrice: true } },
          },
        },
      },
      orderBy: { awardedAt: "desc" },
      // Bkz. MAX_REPORT_LISTINGS — sınırsız aralık tüm ihale/teklif/kalem
      // ağacını belleğe alıyordu.
      take: MAX_REPORT_LISTINGS,
    });

    const bestIsMax = type === "SATIS";
    const rows = listings.map((l) => {
      const awarded = l.bids.filter(
        (b) => b.status === "WON" || b.status === "AWARDED_PARTIAL",
      );
      // Kalem kazananı: WON teklif varsa onun kalemi; kalem-bazlı (PARTIAL)
      // kazandırmada aynı kalemi fiyatlayan kazananlar arasından EN İYİ fiyat
      // (kazandırmanın olağan seçimi) — modelde kalem-başına kazanan ayrıca
      // saklanmadığından en-iyi-fiyat yaklaşımı kullanılır.
      const winningByItem = new Map<
        string,
        { bidderName: string; unitPrice: number }
      >();
      for (const it of l.items) {
        let best: { bidderName: string; unitPrice: number } | null = null;
        for (const b of awarded) {
          const bi = b.items.find((x) => x.itemId === it.id);
          if (!bi) continue;
          const up = Number(bi.unitPrice);
          if (
            !best ||
            (bestIsMax ? up > best.unitPrice : up < best.unitPrice)
          ) {
            best = { bidderName: b.bidderCompany.name, unitPrice: up };
          }
        }
        if (best) winningByItem.set(it.id, best);
      }

      let targetTotal = 0;
      let actualTotal = 0;
      const winners = new Map<string, number>();
      const items = l.items.map((it) => {
        const win = winningByItem.get(it.id) ?? null;
        // ALIM referansı hedef fiyat; SATIS referansı kalem tabanı.
        const refUnit =
          type === "ALIM"
            ? it.targetPrice != null
              ? Number(it.targetPrice)
              : null
            : it.minUnitPrice != null
              ? Number(it.minUnitPrice)
              : null;
        const qty =
          it.awardedQuantity != null && Number(it.awardedQuantity) > 0
            ? Number(it.awardedQuantity)
            : Number(it.quantity);
        const itemActual = win ? win.unitPrice * qty : null;
        const itemRef = win && refUnit != null ? refUnit * qty : null;
        // ALIM: tasarruf = hedef − kazanan; SATIS: kazanç = kazanan − taban.
        const itemDelta =
          itemRef != null && itemActual != null
            ? type === "ALIM"
              ? itemRef - itemActual
              : itemActual - itemRef
            : null;
        if (itemActual != null) actualTotal += itemActual;
        if (itemRef != null) targetTotal += itemRef;
        if (win && itemActual != null) {
          winners.set(
            win.bidderName,
            (winners.get(win.bidderName) ?? 0) + itemActual,
          );
        }
        return {
          name: it.name,
          unit: it.unit,
          quantity: Number(it.quantity),
          awardedQuantity: win ? qty : null,
          referenceUnitPrice: refUnit,
          winningUnitPrice: win?.unitPrice ?? null,
          winnerName: win?.bidderName ?? null,
          itemReference: itemRef,
          itemActual,
          delta: itemDelta,
        };
      });

      const tryAmounts = l.bids
        .map(bidTry)
        .filter((v): v is number => v != null);
      const highestBid = tryAmounts.length ? Math.max(...tryAmounts) : null;
      const lowestBid = tryAmounts.length ? Math.min(...tryAmounts) : null;
      const winningTotal = awarded.length
        ? awarded.reduce((s, b) => s + (bidTry(b) ?? 0), 0)
        : null;
      // Rekabet delta'sı: ALIM en yüksek − kazanan; SATIS kazanan − en düşük.
      const delta =
        winningTotal == null
          ? null
          : type === "ALIM"
            ? highestBid != null
              ? highestBid - winningTotal
              : null
            : lowestBid != null
              ? winningTotal - lowestBid
              : null;
      const ref = type === "ALIM" ? highestBid : winningTotal;
      const deltaPct =
        delta != null && ref != null && ref > 0 ? (delta / ref) * 100 : null;

      return {
        id: l.id,
        number: l.number,
        title: l.title,
        currency: l.primaryCurrency,
        bidCount: l.bids.length,
        highestBid,
        lowestBid,
        winningTotal,
        delta,
        deltaPct,
        targetTotal,
        actualTotal,
        winners: [...winners.entries()].map(([name, total]) => ({
          name,
          total,
        })),
        items,
        awardedAt: l.awardedAt?.toISOString() ?? null,
      };
    });

    const withPct = rows.filter((r) => r.deltaPct != null);
    const best = withPct.length
      ? withPct.reduce((a, b) => (b.deltaPct! > a.deltaPct! ? b : a))
      : null;
    const worst = withPct.length
      ? withPct.reduce((a, b) => (b.deltaPct! < a.deltaPct! ? b : a))
      : null;
    const byParty = new Map<string, number>();
    for (const r of rows) {
      for (const w of r.winners) {
        byParty.set(w.name, (byParty.get(w.name) ?? 0) + w.total);
      }
    }
    const grandHighest = rows.reduce((s, r) => s + (r.highestBid ?? 0), 0);
    const grandDelta = rows.reduce((s, r) => s + (r.delta ?? 0), 0);

    return {
      type,
      generatedAt: new Date().toISOString(),
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
      currency: dto.currency ?? null,
      rows,
      summary: {
        totalListings: rows.length,
        grandHighest,
        grandLowest: rows.reduce((s, r) => s + (r.lowestBid ?? 0), 0),
        grandTarget: rows.reduce((s, r) => s + r.targetTotal, 0),
        grandActual: rows.reduce((s, r) => s + r.actualTotal, 0),
        grandDelta,
        grandDeltaPct: grandHighest > 0 ? (grandDelta / grandHighest) * 100 : 0,
        avgDeltaPct: withPct.length
          ? withPct.reduce((s, r) => s + r.deltaPct!, 0) / withPct.length
          : 0,
        best: best
          ? { number: best.number, title: best.title, deltaPct: best.deltaPct }
          : null,
        worst: worst
          ? {
              number: worst.number,
              title: worst.title,
              deltaPct: worst.deltaPct,
            }
          : null,
        byParty: [...byParty.entries()]
          .map(([name, awarded]) => ({ name, awarded }))
          .sort((a, b) => b.awarded - a.awarded),
      },
    };
  }

  // ============================================================
  // 3) TEKLİF KARŞILAŞTIRMA RAPORU (kapalı zarf: yalnız sahip)
  // ============================================================

  async bidComparison(
    companyId: string,
    type: ListingType,
    dto: BidComparisonInput,
  ) {
    const id = await this.resolveListingId(companyId, dto.listingId);
    const l = await this.prisma.listing.findFirst({
      where: { id, companyId, type },
      include: {
        items: {
          orderBy: { lineNo: "asc" },
          select: {
            id: true,
            name: true,
            unit: true,
            quantity: true,
            targetPrice: true,
            minUnitPrice: true,
            questions: { select: { id: true, text: true } },
          },
        },
        invitations: {
          include: { invitedCompany: { select: { id: true, name: true } } },
        },
        bids: {
          where: { status: { in: [...REAL_BID] } },
          include: {
            bidderCompany: { select: { id: true, name: true } },
            items: { select: { itemId: true, unitPrice: true } },
            answers: { select: { questionId: true, value: true } },
          },
        },
        roundSnapshots: dto.includeRoundHistory
          ? { orderBy: [{ round: "asc" as const }] }
          : false,
      },
    });
    if (!l) throw new NotFoundException("İhale bulunamadı");

    const includePrice = dto.criteria === "PRICE" || dto.criteria === "BOTH";
    const includeAnswers =
      dto.criteria === "ANSWERS" || dto.criteria === "BOTH";
    const bestIsMax = type === "SATIS";

    const invitedIds = l.invitations.map((i) => i.invitedCompanyId);
    const bidderIds = new Set(l.bids.map((b) => b.bidderCompanyId));
    // Davetsiz (PUBLIC) teklifçiler de rapora girer.
    const allPartyIds = [
      ...new Set([...invitedIds, ...l.bids.map((b) => b.bidderCompanyId)]),
    ];
    const partyIdsToShow = dto.includeNonBidders
      ? allPartyIds
      : allPartyIds.filter((pid) => bidderIds.has(pid));
    const nameLookup = new Map<string, string>([
      ...l.invitations.map(
        (i) => [i.invitedCompanyId, i.invitedCompany.name] as const,
      ),
      ...l.bids.map(
        (b) => [b.bidderCompanyId, b.bidderCompany.name] as const,
      ),
    ]);

    const itemMeta = l.items.map((it) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      quantity: Number(it.quantity),
      referenceUnitPrice:
        type === "ALIM"
          ? it.targetPrice != null
            ? Number(it.targetPrice)
            : null
          : it.minUnitPrice != null
            ? Number(it.minUnitPrice)
            : null,
    }));

    // Kalem bazında EN İYİ birim fiyat (ALIM: en düşük, SATIS: en yüksek).
    const bestByItem = new Map<string, { partyId: string; unitPrice: number }>();
    if (includePrice) {
      for (const it of l.items) {
        let best: { partyId: string; unitPrice: number } | null = null;
        for (const b of l.bids) {
          const bi = b.items.find((x) => x.itemId === it.id);
          const up = bi != null ? Number(bi.unitPrice) : null;
          if (up == null || up <= 0) continue;
          if (
            !best ||
            (bestIsMax ? up > best.unitPrice : up < best.unitPrice)
          ) {
            best = { partyId: b.bidderCompanyId, unitPrice: up };
          }
        }
        if (best) bestByItem.set(it.id, best);
      }
    }

    const referenceTotal = itemMeta.reduce(
      (s, it) =>
        s +
        (it.referenceUnitPrice != null
          ? it.referenceUnitPrice * it.quantity
          : 0),
      0,
    );

    const questionText = new Map(
      l.items.flatMap((it) => it.questions.map((q) => [q.id, q.text] as const)),
    );
    const questionsByItem = new Map(
      l.items.map((it) => [it.id, it.questions.map((q) => q.id)] as const),
    );

    const parties = partyIdsToShow.map((pid) => {
      const bid = l.bids.find((b) => b.bidderCompanyId === pid);
      const totalTry = includePrice && bid ? bidTry(bid) : null;
      return {
        companyId: pid,
        companyName: nameLookup.get(pid) ?? "(bilinmiyor)",
        submitted: !!bid,
        status: bid?.status ?? "NO_BID",
        isBuyNow: bid?.isBuyNow ?? false,
        totalAmount: includePrice && bid ? Number(bid.amount) : null,
        totalTry,
        bidCurrency: dto.showBidCurrencies ? (bid?.currency ?? null) : null,
        rank: null as number | null,
        deltaVsReference:
          totalTry != null && referenceTotal > 0
            ? type === "ALIM"
              ? referenceTotal - totalTry
              : totalTry - referenceTotal
            : null,
        itemPrices:
          includePrice && bid
            ? itemMeta.map((it) => {
                const bi = bid.items.find((x) => x.itemId === it.id);
                const unitPrice = bi != null ? Number(bi.unitPrice) : null;
                const best = bestByItem.get(it.id);
                return {
                  itemId: it.id,
                  unitPrice,
                  totalPrice:
                    unitPrice != null ? unitPrice * it.quantity : null,
                  isBest:
                    best != null &&
                    unitPrice != null &&
                    best.partyId === pid &&
                    Math.abs(best.unitPrice - unitPrice) < 1e-9,
                  deltaVsReferencePct:
                    unitPrice != null &&
                    it.referenceUnitPrice != null &&
                    it.referenceUnitPrice > 0
                      ? Math.round(
                          ((unitPrice - it.referenceUnitPrice) /
                            it.referenceUnitPrice) *
                            1000,
                        ) / 10
                      : null,
                };
              })
            : [],
        itemAnswers:
          includeAnswers && bid
            ? itemMeta.map((it) => {
                const qIds = questionsByItem.get(it.id) ?? [];
                const answers = bid.answers.filter((a) =>
                  qIds.includes(a.questionId),
                );
                return {
                  itemId: it.id,
                  answer:
                    answers.length > 0
                      ? answers
                          .map(
                            (a) =>
                              `${questionText.get(a.questionId) ?? "Soru"}: ${a.value}`,
                          )
                          .join(" | ")
                      : null,
                };
              })
            : [],
      };
    });

    // Sıralama: ALIM artan (en ucuz=1), SATIS azalan (en yüksek=1) — TRY ile.
    parties
      .filter((p) => p.totalTry != null)
      .sort((a, b) =>
        bestIsMax ? b.totalTry! - a.totalTry! : a.totalTry! - b.totalTry!,
      )
      .forEach((p, i) => {
        p.rank = i + 1;
      });

    const recommendedAwards = [...bestByItem.entries()].map(
      ([itemId, best]) => ({
        itemId,
        itemName: itemMeta.find((i) => i.id === itemId)?.name ?? itemId,
        companyName: nameLookup.get(best.partyId) ?? "(bilinmiyor)",
        unitPrice: best.unitPrice,
      }),
    );

    // Tur geçmişi (arşiv) — snapshot yalnız ad+tutar taşır.
    const roundHistory =
      dto.includeRoundHistory && Array.isArray(l.roundSnapshots)
        ? [...l.roundSnapshots]
            .sort((a, b) =>
              a.round === b.round
                ? bestIsMax
                  ? Number(b.amount) - Number(a.amount)
                  : Number(a.amount) - Number(b.amount)
                : a.round - b.round,
            )
            .map((s) => ({
              round: s.round,
              bidderName: s.bidderName,
              amount: Number(s.amount),
            }))
        : [];

    return {
      type,
      generatedAt: new Date().toISOString(),
      includePrice,
      includeAnswers,
      includeNonBidders: !!dto.includeNonBidders,
      showBidCurrencies: !!dto.showBidCurrencies,
      listing: {
        id: l.id,
        number: l.number,
        title: l.title,
        currency: l.primaryCurrency,
        round: l.currentRound,
        referenceTotal,
      },
      items: itemMeta.map((it) => ({
        ...it,
        bestUnitPrice: bestByItem.get(it.id)?.unitPrice ?? null,
        bestCompanyId: bestByItem.get(it.id)?.partyId ?? null,
      })),
      parties,
      recommendedAwards,
      roundHistory,
    };
  }

  /**
   * P2 (frontend denetimi §10.5): Raporlar hub özet grafikleri — adet bazlı
   * aylık hacim (para birimi tuzağı yok), kazanma oranı, sipariş ortalaması
   * (yalnız TRY siparişler — çoklu birim karışmaz) ve kategori dağılımı.
   * ALIM = kendi ihalelerin/gelen teklifler; SATIS = verdiğin teklifler.
   */
  async summary(
    companyId: string,
    type: ListingType,
  ): Promise<ReportsSummary> {
    const now = new Date();
    const start6 = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const start12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const MONTHS_TR = [
      "Oca",
      "Şub",
      "Mar",
      "Nis",
      "May",
      "Haz",
      "Tem",
      "Ağu",
      "Eyl",
      "Eki",
      "Kas",
      "Ara",
    ];
    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const buckets = new Map<
      string,
      { label: string; listings: number; bids: number; orderTotalTry: number }
    >();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(monthKey(d), {
        label: MONTHS_TR[d.getMonth()],
        listings: 0,
        bids: 0,
        orderTotalTry: 0,
      });
    }
    const bump = (
      at: Date,
      field: "listings" | "bids",
    ) => {
      const b = buckets.get(monthKey(at));
      if (b) b[field] += 1;
    };

    const isAlim = type === "ALIM";
    const [listingRows, bidRows, decisionRows, orderRows, catRows] =
      await Promise.all([
        this.prisma.listing.findMany({
          where: { companyId, type, createdAt: { gte: start6 } },
          select: { createdAt: true },
        }),
        isAlim
          ? this.prisma.listingBid.findMany({
              where: {
                listing: { companyId, type },
                status: { in: [...REAL_BID] },
                createdAt: { gte: start6 },
              },
              select: { createdAt: true },
            })
          : this.prisma.listingBid.findMany({
              where: {
                bidderCompanyId: companyId,
                status: { in: [...REAL_BID] },
                createdAt: { gte: start6 },
              },
              select: { createdAt: true },
            }),
        isAlim
          ? this.prisma.listing.findMany({
              where: {
                companyId,
                type,
                status: { in: ["AWARDED", "CLOSED_NO_AWARD", "CANCELLED"] },
                createdAt: { gte: start12 },
              },
              select: { status: true },
            })
          : this.prisma.listingBid.findMany({
              where: {
                bidderCompanyId: companyId,
                status: { in: ["WON", "AWARDED_PARTIAL", "LOST"] },
                createdAt: { gte: start12 },
              },
              select: { status: true },
            }),
        this.prisma.companyOrder.findMany({
          where: {
            ...(isAlim
              ? { buyerCompanyId: companyId }
              : { sellerCompanyId: companyId }),
            status: { notIn: ["REJECTED", "CANCELLED"] },
            createdAt: { gte: start6 },
          },
          select: { createdAt: true, amount: true, currency: true },
        }),
        isAlim
          ? this.prisma.listing.findMany({
              where: { companyId, type, createdAt: { gte: start12 } },
              select: { categoryIds: true },
            })
          : this.prisma.listingBid.findMany({
              where: {
                bidderCompanyId: companyId,
                status: { in: [...REAL_BID] },
                createdAt: { gte: start12 },
              },
              select: { listing: { select: { categoryIds: true } } },
            }),
      ]);

    for (const l of listingRows) bump(l.createdAt, "listings");
    for (const b of bidRows) bump(b.createdAt, "bids");

    // Sipariş toplamı yalnız TRY — çoklu birimi tek eksende toplamak yanıltıcı.
    let tryTotal = 0;
    let tryCount = 0;
    for (const o of orderRows) {
      if (o.currency !== "TRY") continue;
      const amt = Number(o.amount);
      tryTotal += amt;
      tryCount += 1;
      const b = buckets.get(monthKey(o.createdAt));
      if (b) b.orderTotalTry += amt;
    }

    const wonCount = decisionRows.filter((r) =>
      isAlim
        ? r.status === "AWARDED"
        : r.status === "WON" || r.status === "AWARDED_PARTIAL",
    ).length;

    // Kategori dağılımı — L1 segmentine katla (ilk 2 hane + "000000"),
    // yoksa ham kod; ilk 5 + Diğer.
    const catCounts = new Map<string, number>();
    const rawIds = isAlim
      ? (catRows as { categoryIds: string[] }[]).flatMap((r) => r.categoryIds)
      : (catRows as { listing: { categoryIds: string[] } }[]).flatMap(
          (r) => r.listing.categoryIds,
        );
    for (const id of rawIds) {
      const seg = id.length === 8 ? `${id.slice(0, 2)}000000` : id;
      catCounts.set(seg, (catCounts.get(seg) ?? 0) + 1);
    }
    const top = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const catNames = top.length
      ? await this.prisma.category.findMany({
          where: { id: { in: top.map(([id]) => id) } },
          select: { id: true, nameTr: true },
        })
      : [];
    const nameById = new Map(catNames.map((c) => [c.id, c.nameTr]));
    const rest = [...catCounts.values()].reduce((a, b) => a + b, 0) -
      top.reduce((a, [, n]) => a + n, 0);
    const categories = [
      ...top.map(([id, count]) => ({
        name: nameById.get(id) ?? id,
        count,
      })),
      ...(rest > 0 ? [{ name: "Diğer", count: rest }] : []),
    ];

    return {
      months: [...buckets.entries()].map(([key, b]) => ({
        key,
        label: b.label,
        listings: b.listings,
        bids: b.bids,
        orderTotalTry: Math.round(b.orderTotalTry * 100) / 100,
      })),
      winRate: { won: wonCount, total: decisionRows.length },
      orders: {
        count: tryCount,
        avgTry: tryCount > 0 ? Math.round((tryTotal / tryCount) * 100) / 100 : null,
      },
      categories,
    };
  }
}
