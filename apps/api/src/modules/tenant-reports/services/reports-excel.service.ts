import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

type GeneralResult = Awaited<
  ReturnType<
    typeof import("./tenant-reports.service").TenantReportsService.prototype.general
  >
>;
type SavingsResult = Awaited<
  ReturnType<
    typeof import("./tenant-reports.service").TenantReportsService.prototype.savings
  >
>;
type BidComparisonResult = Awaited<
  ReturnType<
    typeof import("./tenant-reports.service").TenantReportsService.prototype.bidComparison
  >
>;

const BRAND = "1E3A8A"; // brand-900
const BRAND_LIGHT = "DBEAFE"; // brand-100

// Ham TenderStatus enum'unu Excel çıktısında Türkçe göster (frontend ile aynı
// etiketler). DB/iş mantığı değişmez — yalnızca üretilen dosyadaki görünüm.
const TENDER_STATUS_TR: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onay Bekliyor",
  OPEN_FOR_BIDS: "Yayında",
  IN_AWARD: "Kazandırma Aşamasında",
  IN_AWARD_APPROVAL: "Kazandırma Onay Bekliyor",
  AWARDED: "Tamamlandı",
  CANCELLED: "İptal",
  CLOSED_NO_AWARD: "Kapatıldı",
};
const tenderStatusTr = (s: string): string => TENDER_STATUS_TR[s] ?? s;

const TENDER_TYPE_TR: Record<string, string> = {
  RFQ: "RFQ",
  ENGLISH_AUCTION: "İngiliz Usulü",
};
const tenderTypeTr = (s: string): string => TENDER_TYPE_TR[s] ?? s;

@Injectable()
export class ReportsExcelService {
  async general(data: GeneralResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Supkeys";
    wb.created = new Date();

    const ws = wb.addWorksheet("Genel İhale Raporu");
    ws.addRow(["Genel İhale Raporu"]).font = {
      bold: true,
      size: 16,
      color: { argb: BRAND },
    };
    ws.addRow([
      `Oluşturulma: ${format(new Date(data.generatedAt), "dd.MM.yyyy HH:mm", { locale: tr })}`,
    ]).font = { italic: true, color: { argb: "64748B" } };
    if (data.mode === "RANGE") {
      ws.addRow([
        `Aralık: ${format(new Date(data.rangeStart!), "dd.MM.yyyy", { locale: tr })} – ${format(new Date(data.rangeEnd!), "dd.MM.yyyy", { locale: tr })}`,
      ]);
    }
    ws.addRow([]);

    const header = [
      "İhale No",
      "Başlık",
      "Tipi",
      "Statü",
      "Para Birimi",
      "Tur",
      "Kapanış",
      "Davetli",
      "Teklif",
      "Yanıt %",
      "Tahmini Toplam",
      "Kazanan Tutar",
      "Kazanan Tedarikçi",
      "Tasarruf",
      "Oluşturan",
    ];
    const headerRow = ws.addRow(header);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    data.tenders.forEach((t) => {
      ws.addRow([
        t.tenderNumber,
        t.title,
        tenderTypeTr(t.type),
        tenderStatusTr(t.status),
        t.currency,
        `Tur #${t.roundNumber}`,
        format(new Date(t.bidsCloseAt), "dd.MM.yyyy HH:mm", { locale: tr }),
        t.invitedCount,
        t.submittedBidCount,
        t.responseRate != null ? `${t.responseRate}%` : "-",
        t.estimatedTotal ?? "-",
        t.winningTotal ?? "-",
        t.winnerName ?? "-",
        t.savings ?? "-",
        t.createdBy ?? "-",
      ]);
    });

    // ── Özet KPI bloğu ──
    const s = data.summary;
    ws.addRow([]);
    ws.addRow(["Özet"]).font = { bold: true, size: 13, color: { argb: BRAND } };
    const kpis: Array<[string, string | number]> = [
      ["Toplam İhale", s.totalTenders],
      ["Kazandırılan", s.awardedTenders],
      ["İptal", s.cancelledTenders],
      ["Toplam Davet", s.totalInvited],
      ["Toplam Teklif", s.totalSubmittedBids],
      ["Yanıt Oranı", `${s.overallResponseRate}%`],
      ["Ort. Teklif / İhale", s.avgBidsPerTender],
      ["Tahmini Toplam", s.totalEstimated],
      ["Kazanan Toplam", s.totalAwardedValue],
      ["Toplam Tasarruf", s.totalSavings],
    ];
    kpis.forEach(([k, v]) => {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });

    ws.addRow([]);
    ws.addRow(["Durum Dağılımı"]).font = {
      bold: true,
      color: { argb: BRAND },
    };
    Object.entries(s.statusBreakdown).forEach(([st, count]) => {
      ws.addRow([tenderStatusTr(st), count]);
    });

    this.autoFitColumns(ws);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async savings(data: SavingsResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Supkeys";
    wb.created = new Date();

    const ws = wb.addWorksheet("Tasarruf Raporu");
    ws.addRow(["Tasarruf Raporu"]).font = {
      bold: true,
      size: 16,
      color: { argb: BRAND },
    };
    ws.addRow([
      `Oluşturulma: ${format(new Date(data.generatedAt), "dd.MM.yyyy HH:mm", { locale: tr })}`,
    ]).font = { italic: true, color: { argb: "64748B" } };
    ws.addRow([
      `Aralık: ${format(new Date(data.rangeStart), "dd.MM.yyyy", { locale: tr })} – ${format(new Date(data.rangeEnd), "dd.MM.yyyy", { locale: tr })}`,
    ]);
    ws.addRow([]);

    const header = [
      "İhale No",
      "Başlık",
      "Para",
      "En Yüksek Teklif",
      "En Düşük Teklif",
      "Tasarruf",
      "Tasarruf %",
      "Kazanan Tedarikçiler",
    ];
    const headerRow = ws.addRow(header);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    data.rows.forEach((r) => {
      ws.addRow([
        r.tenderNumber,
        r.title,
        r.currency,
        r.highestBid ?? "-",
        r.lowestBid ?? "-",
        r.savings ?? "-",
        r.savingsPct !== null ? `${r.savingsPct.toFixed(2)}%` : "-",
        r.winners.map((w) => w.name).join(", "),
      ]);
    });

    ws.addRow([]);
    const summary = ws.addRow([
      "Toplam:",
      `${data.summary.totalTenders} ihale`,
      "",
      data.summary.grandHighest,
      data.summary.grandLowest,
      data.summary.grandSavings,
      `${data.summary.grandSavingsPct.toFixed(2)}%`,
      "",
    ]);
    summary.font = { bold: true };
    summary.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND_LIGHT },
      };
    });

    const sm = data.summary;
    ws.addRow([]);
    ws.addRow(["Ortalama Tasarruf %", `${sm.avgSavingsPct.toFixed(2)}%`]);
    if (sm.bestTender)
      ws.addRow([
        "En İyi",
        `${sm.bestTender.tenderNumber} — ${sm.bestTender.title}`,
        sm.bestTender.savingsPct != null
          ? `${sm.bestTender.savingsPct.toFixed(2)}%`
          : "-",
      ]);
    if (sm.worstTender)
      ws.addRow([
        "En Düşük",
        `${sm.worstTender.tenderNumber} — ${sm.worstTender.title}`,
        sm.worstTender.savingsPct != null
          ? `${sm.worstTender.savingsPct.toFixed(2)}%`
          : "-",
      ]);

    if (sm.bySupplier.length > 0) {
      ws.addRow([]);
      ws.addRow(["Tedarikçi Bazlı Kazanılan Tutar"]).font = {
        bold: true,
        color: { argb: BRAND },
      };
      sm.bySupplier.forEach((b) => ws.addRow([b.name, b.awarded]));
    }

    this.autoFitColumns(ws);

    // ── 2. sayfa: Kalem bazlı tasarruf ──
    const wsItems = wb.addWorksheet("Kalem Bazlı");
    const itemHeader = wsItems.addRow([
      "İhale No",
      "Kalem",
      "Birim",
      "Kazanan Adet",
      "Hedef Birim",
      "Kazanan Birim",
      "Kazanan Tedarikçi",
      "Hedef Tutar",
      "Kazanan Tutar",
      "Tasarruf",
    ]);
    itemHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    data.rows.forEach((r) => {
      r.items.forEach((it) => {
        wsItems.addRow([
          r.tenderNumber,
          it.name,
          it.unit,
          it.awardedQuantity ?? "-",
          it.targetUnitPrice ?? "-",
          it.winningUnitPrice ?? "-",
          it.winnerName ?? "-",
          it.itemTarget ?? "-",
          it.itemActual ?? "-",
          it.savings ?? "-",
        ]);
      });
    });
    this.autoFitColumns(wsItems);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async bidComparison(data: BidComparisonResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Supkeys";
    wb.created = new Date();

    data.rounds.forEach((round) => {
      const ws = wb.addWorksheet(
        `${round.tenderNumber} - Tur ${round.roundNumber}`,
      );
      ws.addRow([round.title]).font = {
        bold: true,
        size: 14,
        color: { argb: BRAND },
      };
      ws.addRow([
        `${round.tenderNumber} · ${round.currency} · Tur #${round.roundNumber}`,
      ]).font = { italic: true, color: { argb: "64748B" } };
      if (data.includePrice && round.targetTotal > 0)
        ws.addRow([`Hedef Toplam: ${round.targetTotal}`]).font = {
          bold: true,
          color: { argb: BRAND },
        };
      ws.addRow([]);

      // Header: Kalem | (her tedarikçi için fiyat/yanıt sütunları)
      const headerCells: string[] = ["Kalem", "Birim", "Adet", "Hedef Birim"];
      round.suppliers.forEach((s) => {
        if (data.includePrice) {
          headerCells.push(`${s.companyName} - Birim Fiyat`);
          headerCells.push(`${s.companyName} - Toplam`);
        }
        if (data.includeAnswers) {
          headerCells.push(`${s.companyName} - Yanıt`);
        }
      });
      const headerRow = ws.addRow(headerCells);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: BRAND },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
      });

      round.items.forEach((item) => {
        const row: (string | number | null)[] = [
          item.name,
          item.unit,
          item.quantity,
          item.targetUnitPrice ?? "-",
        ];
        // En düşük birim fiyat hücrelerini yeşil vurgulamak için kolon takibi
        const lowestCols: number[] = [];
        let col = 4;
        round.suppliers.forEach((s) => {
          if (data.includePrice) {
            const ip = s.itemPrices.find((x) => x.tenderItemId === item.id);
            row.push(ip?.unitPrice ?? "-");
            col++;
            if (ip?.isLowest) lowestCols.push(col);
            row.push(ip?.totalPrice ?? "-");
            col++;
          }
          if (data.includeAnswers) {
            const ia = s.itemAnswers.find((x) => x.tenderItemId === item.id);
            row.push(ia?.customAnswer ?? "-");
            col++;
          }
        });
        const added = ws.addRow(row);
        lowestCols.forEach((c) => {
          const cell = added.getCell(c);
          cell.font = { bold: true, color: { argb: "166534" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "DCFCE7" },
          };
        });
      });

      // Toplam + sıra + hedefe göre tasarruf satırları (sadece price varsa)
      if (data.includePrice) {
        ws.addRow([]);
        const totalRow: (string | number)[] = ["GENEL TOPLAM", "", "", ""];
        const rankRow: (string | number)[] = ["SIRA (en ucuz=1)", "", "", ""];
        const savRow: (string | number)[] = ["Hedefe Göre Tasarruf", "", "", ""];
        round.suppliers.forEach((s) => {
          totalRow.push(s.totalAmount ?? "-");
          totalRow.push("");
          rankRow.push(s.rank ?? "-");
          rankRow.push("");
          savRow.push(s.savingsVsTarget ?? "-");
          savRow.push("");
          if (data.includeAnswers) {
            totalRow.push("");
            rankRow.push("");
            savRow.push("");
          }
        });
        const r = ws.addRow(totalRow);
        r.font = { bold: true };
        r.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: BRAND_LIGHT },
          };
        });
        ws.addRow(rankRow).font = { bold: true };
        ws.addRow(savRow);

        // Önerilen kazanan (kalem bazında en düşük teklif)
        if (round.recommendedAwards.length > 0) {
          ws.addRow([]);
          ws.addRow(["Önerilen Kazanan (kalem bazında en düşük)"]).font = {
            bold: true,
            color: { argb: BRAND },
          };
          const recHeader = ws.addRow(["Kalem", "Tedarikçi", "Birim Fiyat"]);
          recHeader.eachCell((cell) => {
            cell.font = { bold: true };
          });
          round.recommendedAwards.forEach((ra) => {
            const itemName =
              round.items.find((i) => i.id === ra.tenderItemId)?.name ??
              ra.tenderItemId;
            ws.addRow([itemName, ra.supplierName, ra.unitPrice]);
          });
        }
      }

      this.autoFitColumns(ws);
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private autoFitColumns(ws: ExcelJS.Worksheet) {
    ws.columns.forEach((col) => {
      let maxLength = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > maxLength) maxLength = len;
      });
      col.width = Math.min(maxLength + 2, 60);
    });
  }
}
