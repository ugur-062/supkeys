import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { BidComparisonReportDto } from "../dto/bid-comparison-report.dto";
import type { GeneralReportDto } from "../dto/general-report.dto";
import type { SavingsReportDto } from "../dto/savings-report.dto";

/**
 * V2-7+ — Alıcı tarafı raporlama service'i.
 * Üç rapor türü: Genel İhale, Tasarruf, Teklif Karşılaştırma.
 * Veri agregasyonu burada — PDF/Excel formatlama ayrı service'lerde.
 */
@Injectable()
export class TenantReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // 1) GENEL İHALE RAPORU
  // ============================================================

  async general(tenantId: string, dto: GeneralReportDto) {
    if (dto.mode === "SINGLE") {
      if (!dto.tenderId)
        throw new NotFoundException("tenderId zorunlu");
      const tender = await this.findTenderInScope(tenantId, dto.tenderId);
      return {
        mode: "SINGLE" as const,
        generatedAt: new Date().toISOString(),
        tenders: [this.serializeGeneralRow(tender)],
        summary: this.summarizeGeneral([tender]),
      };
    }

    // RANGE
    if (!dto.rangeStart || !dto.rangeEnd)
      throw new NotFoundException("Tarih aralığı zorunlu");

    const tenders = await this.prisma.tender.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(dto.rangeStart),
          lte: new Date(dto.rangeEnd),
        },
        ...(dto.tenderType ? { type: dto.tenderType } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.currency ? { primaryCurrency: dto.currency } : {}),
        ...(dto.supplierIds && dto.supplierIds.length > 0
          ? { invitations: { some: { supplierId: { in: dto.supplierIds } } } }
          : {}),
      },
      include: {
        invitations: { select: { id: true, status: true } },
        bids: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            supplier: { select: { companyName: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      mode: "RANGE" as const,
      generatedAt: new Date().toISOString(),
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
      tenders: tenders.map((t) => this.serializeGeneralRow(t)),
      summary: this.summarizeGeneral(tenders),
    };
  }

  /**
   * Kullanıcı ihale NUMARASI (SUPK-2026-0007) ya da ID girebilir → gerçek ID'ye
   * çözer. Tenant scope'unda; bulunamazsa NotFound. Client-side liste eşleştirme
   * yerine bunu kullanmak, "ilk 100 ihale" sınırını kaldırır.
   */
  private async resolveTenderId(
    tenantId: string,
    idOrNumber: string,
  ): Promise<string> {
    const v = idOrNumber.trim();
    const tender = await this.prisma.tender.findFirst({
      where: { tenantId, OR: [{ id: v }, { tenderNumber: v }] },
      select: { id: true },
    });
    if (!tender)
      throw new NotFoundException(
        "İhale bulunamadı — numara veya ID hatalı olabilir",
      );
    return tender.id;
  }

  private async findTenderInScope(tenantId: string, idOrNumber: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { tenantId, OR: [{ id: idOrNumber }, { tenderNumber: idOrNumber }] },
      include: {
        invitations: { select: { id: true, status: true } },
        bids: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            supplier: { select: { companyName: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId) throw new ForbiddenException();
    return tender;
  }

  private serializeGeneralRow(
    t: Awaited<ReturnType<TenantReportsService["findTenderInScope"]>>,
  ) {
    // Kazanan = kalem/ihale bazlı kazandırma sonrası AWARDED_* statüsü
    // (Bid modelinde ayrı isWinner alanı yok). Kalem bazlı kazandırmada
    // birden çok tedarikçi AWARDED_PARTIAL olabilir → toplamı al.
    const awardedBids = t.bids.filter(
      (b) => b.status === "AWARDED_FULL" || b.status === "AWARDED_PARTIAL",
    );
    const submittedCount = t.bids.filter((b) =>
      ["SUBMITTED", "AWARDED_FULL", "AWARDED_PARTIAL", "LOST", "REJECTED"].includes(
        b.status,
      ),
    ).length;
    const winningTotal = awardedBids.length
      ? awardedBids.reduce((sum, b) => sum + Number(b.totalAmount), 0)
      : null;
    const winnerName =
      awardedBids.length > 0
        ? Array.from(
            new Set(awardedBids.map((b) => b.supplier.companyName)),
          ).join(", ")
        : null;
    const invitedCount = t.invitations.length;
    const responseRate =
      invitedCount > 0
        ? Math.round((submittedCount / invitedCount) * 1000) / 10
        : null;
    const estimatedTotal =
      t.estimatedTotal != null ? Number(t.estimatedTotal) : null;
    // Tasarruf = tahmini (hedef) toplam − kazanan toplam (her ikisi de varsa)
    const savings =
      estimatedTotal != null && winningTotal != null
        ? estimatedTotal - winningTotal
        : null;
    return {
      id: t.id,
      tenderNumber: t.tenderNumber,
      title: t.title,
      type: t.type,
      status: t.status,
      currency: t.primaryCurrency,
      bidsCloseAt: t.bidsCloseAt.toISOString(),
      publishedAt: t.publishedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      createdBy: t.createdBy
        ? `${t.createdBy.firstName} ${t.createdBy.lastName}`
        : null,
      invitedCount,
      submittedBidCount: submittedCount,
      responseRate,
      estimatedTotal,
      winningTotal,
      winnerName,
      savings,
      roundNumber: t.roundNumber,
    };
  }

  private summarizeGeneral(
    tenders: Array<
      Awaited<ReturnType<TenantReportsService["findTenderInScope"]>>
    >,
  ) {
    const totalTenders = tenders.length;
    const awarded = tenders.filter((t) => t.status === "AWARDED").length;

    // Durum dağılımı
    const statusBreakdown: Record<string, number> = {};
    for (const t of tenders) {
      statusBreakdown[t.status] = (statusBreakdown[t.status] ?? 0) + 1;
    }

    const totalInvited = tenders.reduce(
      (s, t) => s + t.invitations.length,
      0,
    );
    const totalSubmittedBids = tenders.reduce((s, t) => {
      return (
        s +
        t.bids.filter((b) =>
          [
            "SUBMITTED",
            "AWARDED_FULL",
            "AWARDED_PARTIAL",
            "LOST",
            "REJECTED",
          ].includes(b.status),
        ).length
      );
    }, 0);

    const isAwardedBid = (s: string) =>
      s === "AWARDED_FULL" || s === "AWARDED_PARTIAL";
    const totalAwardedValue = tenders.reduce((sum, t) => {
      return (
        sum +
        t.bids
          .filter((b) => isAwardedBid(b.status))
          .reduce((s, b) => s + Number(b.totalAmount), 0)
      );
    }, 0);

    // Tahmini (hedef) toplam — sadece estimatedTotal'ı olan ihalelerde
    const totalEstimated = tenders.reduce(
      (s, t) => s + (t.estimatedTotal != null ? Number(t.estimatedTotal) : 0),
      0,
    );
    // Toplam tasarruf — awarded + hem tahmini hem kazanan tutarı olanlar
    const totalSavings = tenders.reduce((sum, t) => {
      if (t.status !== "AWARDED" || t.estimatedTotal == null) return sum;
      const win = t.bids
        .filter((b) => isAwardedBid(b.status))
        .reduce((s, b) => s + Number(b.totalAmount), 0);
      if (win === 0) return sum;
      return sum + (Number(t.estimatedTotal) - win);
    }, 0);

    return {
      totalTenders,
      awardedTenders: awarded,
      cancelledTenders: statusBreakdown.CANCELLED ?? 0,
      statusBreakdown,
      totalInvited,
      totalSubmittedBids,
      overallResponseRate:
        totalInvited > 0
          ? Math.round((totalSubmittedBids / totalInvited) * 1000) / 10
          : 0,
      avgBidsPerTender:
        totalTenders > 0
          ? Math.round((totalSubmittedBids / totalTenders) * 10) / 10
          : 0,
      totalEstimated,
      totalAwardedValue,
      totalSavings,
    };
  }

  // ============================================================
  // 2) TASARRUF RAPORU
  // ============================================================

  async savings(tenantId: string, dto: SavingsReportDto) {
    const tenders = await this.prisma.tender.findMany({
      where: {
        tenantId,
        status: "AWARDED",
        createdAt: {
          gte: new Date(dto.rangeStart),
          lte: new Date(dto.rangeEnd),
        },
        ...(dto.currency ? { primaryCurrency: dto.currency } : {}),
        ...(dto.supplierIds && dto.supplierIds.length > 0
          ? { invitations: { some: { supplierId: { in: dto.supplierIds } } } }
          : {}),
      },
      include: {
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            targetUnitPrice: true,
          },
        },
        bids: {
          // Madde 28 — en yüksek/en düşük için TÜM gönderilmiş teklifler
          // (elenen/kaybeden dahil; geri çekilenler hariç).
          where: { submittedAt: { not: null }, status: { not: "WITHDRAWN" } },
          include: {
            supplier: { select: { id: true, companyName: true } },
            items: {
              select: {
                tenderItemId: true,
                unitPrice: true,
                totalPrice: true,
                awardedQuantity: true,
                isWinner: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = tenders.map((t) => {
      // Kazanan kalemleri tek haritada topla: tenderItemId → kazanan BidItem + tedarikçi.
      // KISMİ kazandırma için yalnızca isWinner=true kalemler sayılır (eski kod tüm
      // bid.items.totalPrice'ı topluyordu → kazanılmayan kalemleri de sayıyordu).
      const winningByItem = new Map<
        string,
        {
          supplierId: string;
          supplierName: string;
          unitPrice: number | null;
          awardedQty: number;
          totalPrice: number | null;
        }
      >();
      for (const bid of t.bids) {
        if (!bid.supplier) continue;
        for (const bi of bid.items) {
          if (!bi.isWinner) continue;
          winningByItem.set(bi.tenderItemId, {
            supplierId: bid.supplier.id,
            supplierName: bid.supplier.companyName,
            unitPrice: bi.unitPrice != null ? Number(bi.unitPrice) : null,
            awardedQty:
              bi.awardedQuantity != null ? Number(bi.awardedQuantity) : 0,
            totalPrice: bi.totalPrice != null ? Number(bi.totalPrice) : null,
          });
        }
      }

      let targetTotal = 0;
      let actualTotal = 0;
      const winners = new Map<string, { name: string; total: number }>();

      const items = t.items.map((item) => {
        const win = winningByItem.get(item.id);
        const targetUnit =
          item.targetUnitPrice != null ? Number(item.targetUnitPrice) : null;
        // Kazanılan adet: awardedQuantity varsa onu, yoksa kalem miktarını kullan
        const qty =
          win && win.awardedQty > 0 ? win.awardedQty : Number(item.quantity);
        const winningUnit = win?.unitPrice ?? null;
        const itemActual =
          win == null
            ? null
            : winningUnit != null
              ? winningUnit * qty
              : (win.totalPrice ?? 0);
        const itemTarget =
          win != null && targetUnit != null ? targetUnit * qty : null;
        const itemSavings =
          itemTarget != null && itemActual != null
            ? itemTarget - itemActual
            : null;

        // Toplamlara yalnızca kazanılan (awarded) kalemler katılır → adil kıyas
        if (itemActual != null) actualTotal += itemActual;
        if (itemTarget != null) targetTotal += itemTarget;
        if (win && itemActual != null) {
          const agg = winners.get(win.supplierId) ?? {
            name: win.supplierName,
            total: 0,
          };
          agg.total += itemActual;
          winners.set(win.supplierId, agg);
        }

        return {
          name: item.name,
          unit: item.unit,
          quantity: Number(item.quantity),
          awardedQuantity: win ? qty : null,
          targetUnitPrice: targetUnit,
          winningUnitPrice: winningUnit,
          winnerName: win?.supplierName ?? null,
          itemTarget,
          itemActual,
          savings: itemSavings,
        };
      });

      // Madde 28 — Tasarruf = en yüksek teklif − en düşük teklif (ihale bazında,
      // tüm gönderilmiş teklif toplamlarından). Tek teklifte tasarruf yok.
      const bidTotals = t.bids
        .map((b) => Number(b.totalAmount))
        .filter((n) => Number.isFinite(n));
      const highestBid = bidTotals.length > 0 ? Math.max(...bidTotals) : null;
      const lowestBid = bidTotals.length > 0 ? Math.min(...bidTotals) : null;
      const savings =
        bidTotals.length >= 2 && highestBid != null && lowestBid != null
          ? highestBid - lowestBid
          : null;
      const savingsPct =
        savings != null && highestBid && highestBid > 0
          ? (savings / highestBid) * 100
          : null;

      return {
        id: t.id,
        tenderNumber: t.tenderNumber,
        title: t.title,
        currency: t.primaryCurrency,
        bidCount: bidTotals.length,
        highestBid,
        lowestBid,
        savings,
        savingsPct,
        // Hedef-vs-kazanan detayı (bilgi amaçlı; başlık metrik artık en yüksek−en düşük)
        targetTotal,
        actualTotal,
        winners: Array.from(winners.values()),
        items,
        awardedAt: t.bidsCloseAt.toISOString(),
      };
    });

    const grandTarget = rows.reduce((s, r) => s + r.targetTotal, 0);
    const grandActual = rows.reduce((s, r) => s + r.actualTotal, 0);
    // Madde 28 — toplam tasarruf = Σ (en yüksek − en düşük)
    const grandHighest = rows.reduce((s, r) => s + (r.highestBid ?? 0), 0);
    const grandLowest = rows.reduce((s, r) => s + (r.lowestBid ?? 0), 0);
    const grandSavings = rows.reduce((s, r) => s + (r.savings ?? 0), 0);

    // En iyi / en kötü tasarruflu ihale (yüzdeye göre)
    const withPct = rows.filter((r) => r.savingsPct != null);
    const best =
      withPct.length > 0
        ? withPct.reduce((a, b) => (b.savingsPct! > a.savingsPct! ? b : a))
        : null;
    const worst =
      withPct.length > 0
        ? withPct.reduce((a, b) => (b.savingsPct! < a.savingsPct! ? b : a))
        : null;

    // Tedarikçi bazlı tasarruf agregasyonu (tüm ihaleler genelinde)
    const bySupplier = new Map<string, { name: string; awarded: number }>();
    for (const r of rows) {
      for (const w of r.winners) {
        const agg = bySupplier.get(w.name) ?? { name: w.name, awarded: 0 };
        agg.awarded += w.total;
        bySupplier.set(w.name, agg);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
      currency: dto.currency ?? null,
      rows,
      summary: {
        totalTenders: rows.length,
        grandHighest,
        grandLowest,
        grandTarget,
        grandActual,
        grandSavings,
        grandSavingsPct:
          grandHighest > 0 ? (grandSavings / grandHighest) * 100 : 0,
        avgSavingsPct:
          withPct.length > 0
            ? withPct.reduce((s, r) => s + r.savingsPct!, 0) / withPct.length
            : 0,
        bestTender: best
          ? {
              tenderNumber: best.tenderNumber,
              title: best.title,
              savingsPct: best.savingsPct,
            }
          : null,
        worstTender: worst
          ? {
              tenderNumber: worst.tenderNumber,
              title: worst.title,
              savingsPct: worst.savingsPct,
            }
          : null,
        bySupplier: Array.from(bySupplier.values()).sort(
          (a, b) => b.awarded - a.awarded,
        ),
      },
    };
  }

  // ============================================================
  // 3) TEKLİF KARŞILAŞTIRMA RAPORU
  // ============================================================

  async bidComparison(tenantId: string, dto: BidComparisonReportDto) {
    // Numara ya da ID kabul et → gerçek ID'ye çöz (bulunamazsa NotFound)
    const rootId = await this.resolveTenderId(tenantId, dto.tenderId);
    // Tek tender ya da tüm round chain
    const tenderIds = dto.includeAllRounds
      ? await this.collectRoundChainIds(tenantId, rootId)
      : [rootId];

    const tenders = await this.prisma.tender.findMany({
      where: { id: { in: tenderIds }, tenantId },
      include: {
        items: {
          select: {
            id: true,
            name: true,
            unit: true,
            quantity: true,
            targetUnitPrice: true,
            customQuestion: true,
            questions: true,
            orderIndex: true,
          },
          orderBy: { orderIndex: "asc" },
        },
        invitations: {
          include: {
            supplier: { select: { id: true, companyName: true } },
          },
        },
        bids: {
          include: {
            supplier: { select: { id: true, companyName: true } },
            items: true,
          },
        },
      },
      orderBy: { roundNumber: "asc" },
    });

    if (tenders.length === 0)
      throw new NotFoundException("İhale bulunamadı");

    const includePrice =
      dto.criteria.includes("PRICE") || dto.criteria.includes("BOTH");
    const includeAnswers =
      dto.criteria.includes("ANSWERS") || dto.criteria.includes("BOTH");

    const rounds = tenders.map((t) => {
      const invitedSupplierIds = t.invitations.map((i) => i.supplierId);
      const bidSupplierIds = new Set(t.bids.map((b) => b.supplierId));

      // Eğer "teklif vermeyenleri göster" istemiyorsa, sadece bid olanlar
      const supplierIdsToShow = dto.includeNonBidders
        ? invitedSupplierIds
        : invitedSupplierIds.filter((id) => bidSupplierIds.has(id));

      const supplierLookup = new Map(
        t.invitations.map((i) => [i.supplierId, i.supplier.companyName]),
      );

      const itemMeta = t.items.map((it) => ({
        id: it.id,
        name: it.name,
        unit: it.unit,
        quantity: Number(it.quantity),
        targetUnitPrice:
          it.targetUnitPrice != null ? Number(it.targetUnitPrice) : null,
        customQuestion: it.customQuestion,
      }));

      // Kalem bazında en düşük birim fiyat (teklif veren tedarikçiler arasında)
      const lowestByItem = new Map<
        string,
        { supplierId: string; unitPrice: number }
      >();
      if (includePrice) {
        for (const it of t.items) {
          let best: { supplierId: string; unitPrice: number } | null = null;
          for (const b of t.bids) {
            if (b.status === "DRAFT") continue;
            const bi = b.items.find((x) => x.tenderItemId === it.id);
            const up = bi?.unitPrice != null ? Number(bi.unitPrice) : null;
            if (up == null || up <= 0) continue;
            if (!best || up < best.unitPrice)
              best = { supplierId: b.supplierId, unitPrice: up };
          }
          if (best) lowestByItem.set(it.id, best);
        }
      }

      const targetTotal = itemMeta.reduce(
        (sum, it) =>
          sum +
          (it.targetUnitPrice != null
            ? it.targetUnitPrice * it.quantity
            : 0),
        0,
      );

      const suppliers = supplierIdsToShow.map((sid) => {
        const bid = t.bids.find((b) => b.supplierId === sid);
        const totalAmount =
          includePrice && bid?.totalAmount ? Number(bid.totalAmount) : null;
        return {
          supplierId: sid,
          companyName: supplierLookup.get(sid) ?? "(bilinmiyor)",
          submitted: !!bid && bid.status !== "DRAFT",
          status: bid?.status ?? "NO_BID",
          totalAmount,
          bidCurrency: dto.showBidCurrencies ? bid?.currency ?? null : null,
          rank: null as number | null,
          savingsVsTarget:
            totalAmount != null && targetTotal > 0
              ? targetTotal - totalAmount
              : null,
          itemPrices:
            includePrice && bid
              ? itemMeta.map((it) => {
                  const bi = bid.items.find((x) => x.tenderItemId === it.id);
                  const unitPrice =
                    bi?.unitPrice != null ? Number(bi.unitPrice) : null;
                  const low = lowestByItem.get(it.id);
                  return {
                    tenderItemId: it.id,
                    unitPrice,
                    totalPrice:
                      bi?.totalPrice != null ? Number(bi.totalPrice) : null,
                    isLowest:
                      low != null &&
                      unitPrice != null &&
                      low.supplierId === sid &&
                      Math.abs(low.unitPrice - unitPrice) < 1e-9,
                    deltaVsTargetPct:
                      unitPrice != null &&
                      it.targetUnitPrice != null &&
                      it.targetUnitPrice > 0
                        ? Math.round(
                            ((unitPrice - it.targetUnitPrice) /
                              it.targetUnitPrice) *
                              1000,
                          ) / 10
                        : null,
                  };
                })
              : [],
          itemAnswers:
            includeAnswers && bid
              ? itemMeta.map((it) => {
                  const bi = bid.items.find((x) => x.tenderItemId === it.id);
                  // V2-7+ — çoklu cevapları "Soru: Cevap" olarak katla;
                  // yoksa legacy customAnswer'a düş.
                  const ans = Array.isArray(bi?.answers)
                    ? (bi!.answers as Array<{
                        questionId: string;
                        value: string;
                      }>)
                    : [];
                  let display: string | null = bi?.customAnswer ?? null;
                  if (ans.length > 0) {
                    const src = t.items.find((x) => x.id === it.id);
                    const qs = Array.isArray(src?.questions)
                      ? (src!.questions as Array<{ id: string; text: string }>)
                      : [];
                    const qText = new Map(qs.map((q) => [q.id, q.text]));
                    display = ans
                      .map((a) => `${qText.get(a.questionId) ?? "Soru"}: ${a.value}`)
                      .join(" | ");
                  }
                  return {
                    tenderItemId: it.id,
                    customAnswer: display,
                  };
                })
              : [],
        };
      });

      // Tedarikçi sıralaması (teklif toplamına göre artan; en ucuz = 1)
      suppliers
        .filter((s) => s.totalAmount != null)
        .sort((a, b) => a.totalAmount! - b.totalAmount!)
        .forEach((s, i) => {
          s.rank = i + 1;
        });

      // Önerilen kazanan — her kalemde en düşük teklifi veren tedarikçi
      const recommendedAwards = Array.from(lowestByItem.entries()).map(
        ([itemId, low]) => ({
          tenderItemId: itemId,
          supplierId: low.supplierId,
          supplierName: supplierLookup.get(low.supplierId) ?? "(bilinmiyor)",
          unitPrice: low.unitPrice,
        }),
      );

      return {
        tenderId: t.id,
        tenderNumber: t.tenderNumber,
        roundNumber: t.roundNumber,
        title: t.title,
        currency: t.primaryCurrency,
        targetTotal,
        items: itemMeta.map((it) => ({
          ...it,
          lowestUnitPrice: lowestByItem.get(it.id)?.unitPrice ?? null,
          lowestSupplierId: lowestByItem.get(it.id)?.supplierId ?? null,
        })),
        suppliers,
        recommendedAwards,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      includePrice,
      includeAnswers,
      includeAllRounds: !!dto.includeAllRounds,
      includeNonBidders: !!dto.includeNonBidders,
      showBidCurrencies: !!dto.showBidCurrencies,
      rounds,
    };
  }

  /**
   * Verilen tender'ın round chain'indeki tüm ID'leri toplar (önceki + sonraki).
   */
  private async collectRoundChainIds(
    tenantId: string,
    tenderId: string,
  ): Promise<string[]> {
    const seed = await this.prisma.tender.findFirst({
      where: { id: tenderId, tenantId },
      select: { id: true, previousTenderId: true },
    });
    if (!seed) throw new NotFoundException("İhale bulunamadı");

    const ids = new Set<string>([seed.id]);
    let cursorId: string | null = seed.previousTenderId;
    while (cursorId && !ids.has(cursorId)) {
      const prev: { id: string; previousTenderId: string | null } | null =
        await this.prisma.tender.findFirst({
          where: { id: cursorId, tenantId },
          select: { id: true, previousTenderId: true },
        });
      if (!prev) break;
      ids.add(prev.id);
      cursorId = prev.previousTenderId;
    }
    let lastId = seed.id;
    while (true) {
      const next: { id: string } | null = await this.prisma.tender.findFirst({
        where: { previousTenderId: lastId, tenantId },
        select: { id: true },
      });
      if (!next || ids.has(next.id)) break;
      ids.add(next.id);
      lastId = next.id;
    }
    return Array.from(ids);
  }
}
