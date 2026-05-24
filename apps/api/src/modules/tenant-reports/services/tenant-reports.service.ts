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
      invitedCount: t.invitations.length,
      submittedBidCount: submittedCount,
      winningTotal,
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
    const totalAwardedValue = tenders.reduce((sum, t) => {
      const awarded = t.bids
        .filter(
          (b) => b.status === "AWARDED_FULL" || b.status === "AWARDED_PARTIAL",
        )
        .reduce((s, b) => s + Number(b.totalAmount), 0);
      return sum + awarded;
    }, 0);
    return {
      totalTenders,
      awardedTenders: awarded,
      totalAwardedValue,
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
          where: { status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] } },
          include: {
            supplier: { select: { id: true, companyName: true } },
            items: {
              select: {
                tenderItemId: true,
                unitPrice: true,
                totalPrice: true,
                awardedQuantity: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = tenders.map((t) => {
      let targetTotal = 0;
      let actualTotal = 0;
      const winners = new Map<string, { name: string; total: number }>();

      for (const item of t.items) {
        const target = item.targetUnitPrice
          ? Number(item.targetUnitPrice) * Number(item.quantity)
          : null;
        if (target !== null) targetTotal += target;
      }

      for (const bid of t.bids) {
        const sup = bid.supplier
          ? winners.get(bid.supplier.id) ?? {
              name: bid.supplier.companyName,
              total: 0,
            }
          : null;
        const bidTotal = bid.items.reduce(
          (sum, bi) => sum + (bi.totalPrice ? Number(bi.totalPrice) : 0),
          0,
        );
        actualTotal += bidTotal;
        if (sup && bid.supplier) {
          sup.total += bidTotal;
          winners.set(bid.supplier.id, sup);
        }
      }

      const savings = targetTotal > 0 ? targetTotal - actualTotal : null;
      const savingsPct =
        targetTotal > 0 ? ((targetTotal - actualTotal) / targetTotal) * 100 : null;

      return {
        id: t.id,
        tenderNumber: t.tenderNumber,
        title: t.title,
        currency: t.primaryCurrency,
        targetTotal,
        actualTotal,
        savings,
        savingsPct,
        winners: Array.from(winners.values()),
        awardedAt: t.bidsCloseAt.toISOString(),
      };
    });

    const grandTarget = rows.reduce((s, r) => s + r.targetTotal, 0);
    const grandActual = rows.reduce((s, r) => s + r.actualTotal, 0);

    return {
      generatedAt: new Date().toISOString(),
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
      currency: dto.currency ?? null,
      rows,
      summary: {
        totalTenders: rows.length,
        grandTarget,
        grandActual,
        grandSavings: grandTarget > 0 ? grandTarget - grandActual : 0,
        grandSavingsPct:
          grandTarget > 0 ? ((grandTarget - grandActual) / grandTarget) * 100 : 0,
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

      const suppliers = supplierIdsToShow.map((sid) => {
        const bid = t.bids.find((b) => b.supplierId === sid);
        return {
          supplierId: sid,
          companyName: supplierLookup.get(sid) ?? "(bilinmiyor)",
          submitted: !!bid && bid.status !== "DRAFT",
          status: bid?.status ?? "NO_BID",
          totalAmount:
            includePrice && bid?.totalAmount ? Number(bid.totalAmount) : null,
          bidCurrency: dto.showBidCurrencies ? bid?.currency ?? null : null,
          itemPrices:
            includePrice && bid
              ? t.items.map((it) => {
                  const bi = bid.items.find(
                    (x) => x.tenderItemId === it.id,
                  );
                  return {
                    tenderItemId: it.id,
                    unitPrice: bi?.unitPrice ? Number(bi.unitPrice) : null,
                    totalPrice: bi?.totalPrice ? Number(bi.totalPrice) : null,
                  };
                })
              : [],
          itemAnswers:
            includeAnswers && bid
              ? t.items.map((it) => {
                  const bi = bid.items.find(
                    (x) => x.tenderItemId === it.id,
                  );
                  return {
                    tenderItemId: it.id,
                    customAnswer: bi?.customAnswer ?? null,
                  };
                })
              : [],
        };
      });

      return {
        tenderId: t.id,
        tenderNumber: t.tenderNumber,
        roundNumber: t.roundNumber,
        title: t.title,
        currency: t.primaryCurrency,
        items: t.items.map((it) => ({
          id: it.id,
          name: it.name,
          unit: it.unit,
          quantity: Number(it.quantity),
          targetUnitPrice: it.targetUnitPrice
            ? Number(it.targetUnitPrice)
            : null,
          customQuestion: it.customQuestion,
        })),
        suppliers,
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
