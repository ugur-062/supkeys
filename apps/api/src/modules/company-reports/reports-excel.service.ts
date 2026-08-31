import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { CompanyReportsService } from "./company-reports.service";

type GeneralResult = Awaited<
  ReturnType<CompanyReportsService["general"]>
>;
type SavingsResult = Awaited<ReturnType<CompanyReportsService["savings"]>>;
type BidComparisonResult = Awaited<
  ReturnType<CompanyReportsService["bidComparison"]>
>;

// Monokrom marka (Catalyst siyah) — koyu başlık + açık vurgu.
const INK = "18181B"; // zinc-900
const INK_LIGHT = "F4F4F5"; // zinc-100
const GOOD = "166534"; // emerald-800 (en iyi hücre vurgusu)
const GOOD_LIGHT = "DCFCE7";

const STATUS_TR: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onay Bekliyor",
  OPEN: "Yayında",
  CLOSED: "Teklife Kapalı",
  IN_AWARD_APPROVAL: "Kazandırma Onayı",
  AWARDED: "Tamamlandı",
  CANCELLED: "İptal",
  CLOSED_NO_AWARD: "Kazansız Kapatıldı",
};
const statusTr = (s: string) => STATUS_TR[s] ?? s;

const FORMAT_TR: Record<string, string> = {
  RFQ: "Teklif Toplama",
  ENGLISH_AUCTION: "Pazarlık",
};

@Injectable()
export class ReportsExcelService {
  private headerRow(ws: ExcelJS.Worksheet, cells: string[]) {
    const row = ws.addRow(cells);
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });
    return row;
  }

  private title(ws: ExcelJS.Worksheet, text: string, generatedAt: string) {
    ws.addRow([text]).font = { bold: true, size: 16, color: { argb: INK } };
    ws.addRow([
      `Oluşturulma: ${format(new Date(generatedAt), "dd.MM.yyyy HH:mm", { locale: tr })}`,
    ]).font = { italic: true, color: { argb: "64748B" } };
  }

  async general(data: GeneralResult): Promise<Buffer> {
    const isAlim = data.type === "ALIM";
    const deltaWord = isAlim ? "Tasarruf" : "Rekabet Kazancı";
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();
    const ws = wb.addWorksheet(
      isAlim ? "Genel İhale Raporu" : "Genel İlan Raporu",
    );
    this.title(
      ws,
      isAlim ? "Genel İhale Raporu" : "Genel Satış İlanı Raporu",
      data.generatedAt,
    );
    if (data.mode === "RANGE" && data.rangeStart && data.rangeEnd) {
      ws.addRow([
        `Aralık: ${format(new Date(data.rangeStart), "dd.MM.yyyy", { locale: tr })} – ${format(new Date(data.rangeEnd), "dd.MM.yyyy", { locale: tr })}`,
      ]);
    }
    ws.addRow([]);

    this.headerRow(ws, [
      "No",
      "Başlık",
      "Usul",
      "Durum",
      "Para",
      "Tur",
      "Kapanış",
      "Davetli",
      "Teklif",
      "Yanıt %",
      isAlim ? "Hedef Toplam" : "Taban",
      "En Düşük (TRY)",
      "En Yüksek (TRY)",
      "Kazanan (TRY)",
      isAlim ? "Kazanan Tedarikçi" : "Kazanan Alıcı",
      `${deltaWord} (TRY)`,
      "Oluşturan",
    ]);
    data.listings.forEach((t) => {
      ws.addRow([
        t.number ?? "-",
        t.title,
        t.format ? (FORMAT_TR[t.format] ?? t.format) : "-",
        statusTr(t.status),
        t.currency,
        `Tur ${t.round}`,
        t.closesAt
          ? format(new Date(t.closesAt), "dd.MM.yyyy HH:mm", { locale: tr })
          : "-",
        t.invitedCount,
        t.submittedBidCount,
        t.responseRate != null ? `${t.responseRate}%` : "-",
        t.estimatedTotal ?? "-",
        t.lowestTotal ?? "-",
        t.highestTotal ?? "-",
        t.winningTotal ?? "-",
        t.winnerName ?? "-",
        t.delta ?? "-",
        t.createdBy ?? "-",
      ]);
    });

    const s = data.summary;
    ws.addRow([]);
    ws.addRow(["Özet"]).font = { bold: true, size: 13, color: { argb: INK } };
    (
      [
        [isAlim ? "Toplam İhale" : "Toplam İlan", s.totalListings],
        ["Kazandırılan", s.awardedListings],
        ["İptal", s.cancelledListings],
        ["Toplam Davet", s.totalInvited],
        ["Toplam Teklif", s.totalSubmittedBids],
        ["Yanıt Oranı", `${s.overallResponseRate}%`],
        ["Ort. Teklif / İhale", s.avgBidsPerListing],
        [isAlim ? "Hedef Toplam" : "Taban Toplam", s.totalEstimated],
        ["Kazanan Toplam (TRY)", s.totalAwardedValue],
        [`Toplam ${deltaWord} (TRY)`, s.totalDelta],
      ] as Array<[string, string | number]>
    ).forEach(([k, v]) => {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });

    ws.addRow([]);
    ws.addRow(["Durum Dağılımı"]).font = { bold: true, color: { argb: INK } };
    Object.entries(s.statusBreakdown).forEach(([st, count]) => {
      ws.addRow([statusTr(st), count]);
    });

    this.autoFit(ws);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async savings(data: SavingsResult): Promise<Buffer> {
    const isAlim = data.type === "ALIM";
    const deltaWord = isAlim ? "Tasarruf" : "Kazanç";
    const partyWord = isAlim ? "Tedarikçi" : "Alıcı";
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();

    const ws = wb.addWorksheet(`${deltaWord} Raporu`);
    this.title(
      ws,
      isAlim ? "Tasarruf Raporu" : "Rekabet Kazancı Raporu",
      data.generatedAt,
    );
    ws.addRow([
      `Aralık: ${format(new Date(data.rangeStart), "dd.MM.yyyy", { locale: tr })} – ${format(new Date(data.rangeEnd), "dd.MM.yyyy", { locale: tr })}`,
    ]);
    ws.addRow([]);

    this.headerRow(ws, [
      "No",
      "Başlık",
      "Para",
      "Teklif",
      "En Düşük (TRY)",
      "En Yüksek (TRY)",
      "Kazanan (TRY)",
      `${deltaWord} (TRY)`,
      `${deltaWord} %`,
      `Kazanan ${partyWord}ler`,
    ]);
    data.rows.forEach((r) => {
      ws.addRow([
        r.number ?? "-",
        r.title,
        r.currency,
        r.bidCount,
        r.lowestBid ?? "-",
        r.highestBid ?? "-",
        r.winningTotal ?? "-",
        r.delta ?? "-",
        r.deltaPct != null ? `${r.deltaPct.toFixed(2)}%` : "-",
        r.winners.map((w) => w.name).join(", "),
      ]);
    });

    ws.addRow([]);
    const sm = data.summary;
    const sumRow = ws.addRow([
      "Toplam:",
      `${sm.totalListings} kayıt`,
      "",
      "",
      sm.grandLowest,
      sm.grandHighest,
      sm.grandActual,
      sm.grandDelta,
      `${sm.grandDeltaPct.toFixed(2)}%`,
      "",
    ]);
    sumRow.font = { bold: true };
    sumRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: INK_LIGHT },
      };
    });

    ws.addRow([]);
    ws.addRow([`Ortalama ${deltaWord} %`, `${sm.avgDeltaPct.toFixed(2)}%`]);
    if (sm.best)
      ws.addRow([
        "En İyi",
        `${sm.best.number ?? ""} — ${sm.best.title}`,
        sm.best.deltaPct != null ? `${sm.best.deltaPct.toFixed(2)}%` : "-",
      ]);
    if (sm.worst)
      ws.addRow([
        "En Zayıf",
        `${sm.worst.number ?? ""} — ${sm.worst.title}`,
        sm.worst.deltaPct != null ? `${sm.worst.deltaPct.toFixed(2)}%` : "-",
      ]);
    if (sm.byParty.length > 0) {
      ws.addRow([]);
      ws.addRow([`${partyWord} Bazlı Kazanılan Tutar`]).font = {
        bold: true,
        color: { argb: INK },
      };
      sm.byParty.forEach((b) => ws.addRow([b.name, b.awarded]));
    }
    this.autoFit(ws);

    // 2. sayfa — kalem bazlı.
    const wsItems = wb.addWorksheet("Kalem Bazlı");
    this.headerRow(wsItems, [
      "No",
      "Kalem",
      "Birim",
      "Kazanan Adet",
      isAlim ? "Hedef Birim" : "Taban Birim",
      "Kazanan Birim",
      `Kazanan ${partyWord}`,
      isAlim ? "Hedef Tutar" : "Taban Tutar",
      "Kazanan Tutar",
      deltaWord,
    ]);
    data.rows.forEach((r) => {
      r.items.forEach((it) => {
        wsItems.addRow([
          r.number ?? "-",
          it.name,
          it.unit,
          it.awardedQuantity ?? "-",
          it.referenceUnitPrice ?? "-",
          it.winningUnitPrice ?? "-",
          it.winnerName ?? "-",
          it.itemReference ?? "-",
          it.itemActual ?? "-",
          it.delta ?? "-",
        ]);
      });
    });
    this.autoFit(wsItems);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async bidComparison(data: BidComparisonResult): Promise<Buffer> {
    const isAlim = data.type === "ALIM";
    const partyWord = isAlim ? "Tedarikçi" : "Alıcı";
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();

    const ws = wb.addWorksheet(
      `${data.listing.number ?? "Rapor"} - Tur ${data.listing.round}`,
    );
    ws.addRow([data.listing.title]).font = {
      bold: true,
      size: 14,
      color: { argb: INK },
    };
    ws.addRow([
      `${data.listing.number ?? "-"} · ${data.listing.currency} · Tur ${data.listing.round}`,
    ]).font = { italic: true, color: { argb: "64748B" } };
    if (data.includePrice && data.listing.referenceTotal > 0)
      ws.addRow([
        `${isAlim ? "Hedef" : "Taban"} Toplam: ${data.listing.referenceTotal}`,
      ]).font = { bold: true, color: { argb: INK } };
    ws.addRow([]);

    const headerCells: string[] = [
      "Kalem",
      "Birim",
      "Adet",
      isAlim ? "Hedef Birim" : "Taban Birim",
    ];
    data.parties.forEach((p) => {
      if (data.includePrice) {
        headerCells.push(`${p.companyName} - Birim Fiyat`);
        headerCells.push(`${p.companyName} - Toplam`);
      }
      if (data.includeAnswers) headerCells.push(`${p.companyName} - Yanıt`);
    });
    this.headerRow(ws, headerCells);

    data.items.forEach((item) => {
      const row: (string | number | null)[] = [
        item.name,
        item.unit,
        item.quantity,
        item.referenceUnitPrice ?? "-",
      ];
      const bestCols: number[] = [];
      let col = 4;
      data.parties.forEach((p) => {
        if (data.includePrice) {
          const ip = p.itemPrices.find((x) => x.itemId === item.id);
          row.push(ip?.unitPrice ?? "-");
          col++;
          if (ip?.isBest) bestCols.push(col);
          row.push(ip?.totalPrice ?? "-");
          col++;
        }
        if (data.includeAnswers) {
          const ia = p.itemAnswers.find((x) => x.itemId === item.id);
          row.push(ia?.answer ?? "-");
          col++;
        }
      });
      const added = ws.addRow(row);
      bestCols.forEach((c) => {
        const cell = added.getCell(c);
        cell.font = { bold: true, color: { argb: GOOD } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GOOD_LIGHT },
        };
      });
    });

    if (data.includePrice) {
      ws.addRow([]);
      const totalRow: (string | number)[] = ["GENEL TOPLAM", "", "", ""];
      const rankRow: (string | number)[] = [
        isAlim ? "SIRA (en ucuz=1)" : "SIRA (en yüksek=1)",
        "",
        "",
        "",
      ];
      const deltaRow: (string | number)[] = [
        isAlim ? "Hedefe Göre Tasarruf" : "Taban Üstü Kazanç",
        "",
        "",
        "",
      ];
      data.parties.forEach((p) => {
        totalRow.push(p.totalAmount ?? "-");
        totalRow.push(p.bidCurrency ?? "");
        rankRow.push(p.rank ?? "-");
        rankRow.push("");
        deltaRow.push(p.deltaVsReference ?? "-");
        deltaRow.push("");
        if (data.includeAnswers) {
          totalRow.push("");
          rankRow.push("");
          deltaRow.push("");
        }
      });
      const r = ws.addRow(totalRow);
      r.font = { bold: true };
      r.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: INK_LIGHT },
        };
      });
      ws.addRow(rankRow).font = { bold: true };
      ws.addRow(deltaRow);

      if (data.recommendedAwards.length > 0) {
        ws.addRow([]);
        ws.addRow([
          isAlim
            ? "Önerilen Kazanan (kalem bazında en düşük)"
            : "Önerilen Kazanan (kalem bazında en yüksek)",
        ]).font = { bold: true, color: { argb: INK } };
        const recHeader = ws.addRow(["Kalem", partyWord, "Birim Fiyat"]);
        recHeader.eachCell((cell) => {
          cell.font = { bold: true };
        });
        data.recommendedAwards.forEach((ra) => {
          ws.addRow([ra.itemName, ra.companyName, ra.unitPrice]);
        });
      }
    }
    this.autoFit(ws);

    // Tur geçmişi sayfası (arşiv: ad + tutar + BİRİM).
    // P12 #11: birim sütunu eklendi — çok-birimli pazarlıkta arşivlenen tutarın
    // hangi para biriminde olduğu ayırt edilemiyordu (müzakere geçmişi delil
    // niteliğinde). Sıralama servis tarafında TRY karşılığına göre yapılıyor.
    if (data.roundHistory.length > 0) {
      const wsHist = wb.addWorksheet("Tur Geçmişi");
      this.headerRow(wsHist, ["Tur", partyWord, "Tutar", "Para Birimi"]);
      data.roundHistory.forEach((h) => {
        wsHist.addRow([`Tur ${h.round}`, h.bidderName, h.amount, h.currency]);
      });
      this.autoFit(wsHist);
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private autoFit(ws: ExcelJS.Worksheet) {
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
