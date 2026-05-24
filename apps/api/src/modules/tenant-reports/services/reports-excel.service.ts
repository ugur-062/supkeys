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
      "Kazanan Tutar",
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
        t.type,
        t.status,
        t.currency,
        `Tur #${t.roundNumber}`,
        format(new Date(t.bidsCloseAt), "dd.MM.yyyy HH:mm", { locale: tr }),
        t.invitedCount,
        t.submittedBidCount,
        t.winningTotal ?? "-",
        t.createdBy ?? "-",
      ]);
    });

    ws.addRow([]);
    const summary = ws.addRow([
      "Toplam:",
      `${data.summary.totalTenders} ihale`,
      `${data.summary.awardedTenders} kazandırıldı`,
      "",
      "",
      "",
      "",
      "",
      "",
      data.summary.totalAwardedValue,
    ]);
    summary.font = { bold: true };
    summary.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND_LIGHT },
      };
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
      "Hedef Toplam",
      "Kazanan Toplam",
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
        r.targetTotal,
        r.actualTotal,
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
      data.summary.grandTarget,
      data.summary.grandActual,
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

    this.autoFitColumns(ws);
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
        round.suppliers.forEach((s) => {
          if (data.includePrice) {
            const ip = s.itemPrices.find((x) => x.tenderItemId === item.id);
            row.push(ip?.unitPrice ?? "-");
            row.push(ip?.totalPrice ?? "-");
          }
          if (data.includeAnswers) {
            const ia = s.itemAnswers.find((x) => x.tenderItemId === item.id);
            row.push(ia?.customAnswer ?? "-");
          }
        });
        ws.addRow(row);
      });

      // Toplam satırı (sadece price varsa)
      if (data.includePrice) {
        ws.addRow([]);
        const totalRow: (string | number | null)[] = ["GENEL TOPLAM", "", "", ""];
        round.suppliers.forEach((s) => {
          totalRow.push("");
          totalRow.push(s.totalAmount ?? "-");
          if (data.includeAnswers) totalRow.push("");
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
