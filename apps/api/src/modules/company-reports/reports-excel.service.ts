import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { tApi } from "../../common/i18n/i18n.service";
import type { CompanyReportsService } from "./company-reports.service";

type GeneralResult = Awaited<
  ReturnType<CompanyReportsService["general"]>
>;
type SavingsResult = Awaited<ReturnType<CompanyReportsService["savings"]>>;
type BidComparisonResult = Awaited<
  ReturnType<CompanyReportsService["bidComparison"]>
>;

/**
 * Rapor metinleri isteği yapan kullanıcının dilinde üretilir — dil ALS'den
 * (`currentLocale()`) gelir, indirme bir HTTP isteği içinde koştuğu için
 * doğrudur. DI (`I18nService`) yerine `tApi`: servis testlerde argümansız
 * (`new ReportsExcelService()`) kuruluyor, kurucuya bağımlılık eklenmedi.
 * Sayı/tarih/para biçimleri DEĞİŞMEDİ — sayısal yer tutucular ICU'ya dize
 * olarak geçer, hücre biçimleri olduğu gibi kalır.
 */
type MsgKey = Parameters<typeof tApi>[0];
const msg = (key: MsgKey, values?: Parameters<typeof tApi>[1]) =>
  tApi(key, values);

// Monokrom marka (Catalyst siyah) — koyu başlık + açık vurgu.
const INK = "18181B"; // zinc-900
const INK_LIGHT = "F4F4F5"; // zinc-100
const GOOD = "166534"; // emerald-800 (en iyi hücre vurgusu)
const GOOD_LIGHT = "DCFCE7";

const STATUS_KEYS: Record<string, MsgKey> = {
  DRAFT: "api.companyReports.durumTaslak",
  IN_APPROVAL: "api.companyReports.durumOnayBekliyor",
  OPEN: "api.companyReports.durumYayinda",
  CLOSED: "api.companyReports.durumTeklifeKapali",
  IN_AWARD_APPROVAL: "api.companyReports.durumKazandirmaOnayi",
  AWARDED: "api.companyReports.durumTamamlandi",
  CANCELLED: "api.companyReports.durumIptal",
  CLOSED_NO_AWARD: "api.companyReports.durumKazansizKapatildi",
};
const statusLabel = (s: string) => {
  const key = STATUS_KEYS[s];
  return key ? msg(key) : s;
};

const FORMAT_KEYS: Record<string, MsgKey> = {
  RFQ: "api.companyReports.usulTeklifToplama",
  ENGLISH_AUCTION: "api.companyReports.usulPazarlik",
};
const formatLabel = (f: string) => {
  const key = FORMAT_KEYS[f];
  return key ? msg(key) : f;
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

  /**
   * Excel sayfa adı kısıtlıdır: `* ? : / \ [ ]` yasak, 31 karakter tavanı,
   * boş olamaz (ExcelJS yasak karakterde İSTİSNA atar → kitap hiç üretilemez).
   * Türkçe adların hepsi sınırın içinde; kapı çevrilen adlar için.
   */
  private sheet(wb: ExcelJS.Workbook, name: string) {
    const safe = name
      .replace(/[*?:/\\[\]]/g, " ")
      .replace(/^'+|'+$/g, "")
      .trim()
      .slice(0, 31)
      .trim();
    return wb.addWorksheet(safe || undefined);
  }

  private title(ws: ExcelJS.Worksheet, text: string, generatedAt: string) {
    ws.addRow([text]).font = { bold: true, size: 16, color: { argb: INK } };
    ws.addRow([
      msg("api.companyReports.olusturulmaTarih", {
        tarih: format(new Date(generatedAt), "dd.MM.yyyy HH:mm", { locale: tr }),
      }),
    ]).font = { italic: true, color: { argb: "64748B" } };
  }

  async general(data: GeneralResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();
    const reportTitle = msg("api.companyReports.genelSatinAlmaTalebiRaporu");
    const ws = this.sheet(wb, reportTitle);
    this.title(ws, reportTitle, data.generatedAt);
    if (data.mode === "RANGE" && data.rangeStart && data.rangeEnd) {
      ws.addRow([
        msg("api.companyReports.aralikBaslangicBitis", {
          bas: format(new Date(data.rangeStart), "dd.MM.yyyy", { locale: tr }),
          bit: format(new Date(data.rangeEnd), "dd.MM.yyyy", { locale: tr }),
        }),
      ]);
    }
    ws.addRow([]);

    this.headerRow(ws, [
      msg("api.companyReports.basNo"),
      msg("api.companyReports.basBaslik"),
      msg("api.companyReports.basUsul"),
      msg("api.companyReports.basDurum"),
      msg("api.companyReports.basPara"),
      msg("api.companyReports.basTur"),
      msg("api.companyReports.basKapanis"),
      msg("api.companyReports.basDavetli"),
      msg("api.companyReports.basTeklif"),
      msg("api.companyReports.basYanitYuzde"),
      msg("api.companyReports.basHedefToplam"),
      msg("api.companyReports.basEnDusukTry"),
      msg("api.companyReports.basEnYuksekTry"),
      msg("api.companyReports.basKazananTry"),
      msg("api.companyReports.basKazananTedarikci"),
      msg("api.companyReports.basTasarrufTry"),
      msg("api.companyReports.basOlusturan"),
    ]);
    data.listings.forEach((t) => {
      ws.addRow([
        t.number ?? "-",
        t.title,
        t.format ? formatLabel(t.format) : "-",
        statusLabel(t.status),
        t.currency,
        msg("api.companyReports.turN", { n: String(t.round) }),
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
    ws.addRow([msg("api.companyReports.ozet")]).font = {
      bold: true,
      size: 13,
      color: { argb: INK },
    };
    (
      [
        [msg("api.companyReports.toplamSatinAlmaTalebi"), s.totalListings],
        [msg("api.companyReports.kazandirilan"), s.awardedListings],
        [msg("api.companyReports.ozetIptal"), s.cancelledListings],
        [msg("api.companyReports.toplamDavet"), s.totalInvited],
        [msg("api.companyReports.toplamTeklif"), s.totalSubmittedBids],
        [
          msg("api.companyReports.yanitOrani"),
          `${s.overallResponseRate}%`,
        ],
        [
          msg("api.companyReports.ortTeklifSatinAlmaTalebi"),
          s.avgBidsPerListing,
        ],
        [msg("api.companyReports.basHedefToplam"), s.totalEstimated],
        [msg("api.companyReports.kazananToplamTry"), s.totalAwardedValue],
        [msg("api.companyReports.toplamTasarrufTry"), s.totalDelta],
      ] as Array<[string, string | number]>
    ).forEach(([k, v]) => {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });

    ws.addRow([]);
    ws.addRow([msg("api.companyReports.durumDagilimi")]).font = {
      bold: true,
      color: { argb: INK },
    };
    Object.entries(s.statusBreakdown).forEach(([st, count]) => {
      ws.addRow([statusLabel(st), count]);
    });

    this.autoFit(ws);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async savings(data: SavingsResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();

    const reportTitle = msg("api.companyReports.tasarrufRaporu");
    const ws = this.sheet(wb, reportTitle);
    this.title(ws, reportTitle, data.generatedAt);
    ws.addRow([
      msg("api.companyReports.aralikBaslangicBitis", {
        bas: format(new Date(data.rangeStart), "dd.MM.yyyy", { locale: tr }),
        bit: format(new Date(data.rangeEnd), "dd.MM.yyyy", { locale: tr }),
      }),
    ]);
    ws.addRow([]);

    this.headerRow(ws, [
      msg("api.companyReports.basNo"),
      msg("api.companyReports.basBaslik"),
      msg("api.companyReports.basPara"),
      msg("api.companyReports.basTeklif"),
      msg("api.companyReports.basEnDusukTry"),
      msg("api.companyReports.basEnYuksekTry"),
      msg("api.companyReports.basKazananTry"),
      msg("api.companyReports.basTasarrufTry"),
      msg("api.companyReports.basTasarrufYuzde"),
      msg("api.companyReports.basKazananTedarikciler"),
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
      msg("api.companyReports.toplamIkiNokta"),
      msg("api.companyReports.nKayit", { n: String(sm.totalListings) }),
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
    ws.addRow([
      msg("api.companyReports.ortalamaTasarrufYuzde"),
      `${sm.avgDeltaPct.toFixed(2)}%`,
    ]);
    if (sm.best)
      ws.addRow([
        msg("api.companyReports.enIyi"),
        `${sm.best.number ?? ""} — ${sm.best.title}`,
        sm.best.deltaPct != null ? `${sm.best.deltaPct.toFixed(2)}%` : "-",
      ]);
    if (sm.worst)
      ws.addRow([
        msg("api.companyReports.enZayif"),
        `${sm.worst.number ?? ""} — ${sm.worst.title}`,
        sm.worst.deltaPct != null ? `${sm.worst.deltaPct.toFixed(2)}%` : "-",
      ]);
    if (sm.byParty.length > 0) {
      ws.addRow([]);
      ws.addRow([msg("api.companyReports.tedarikciBazliKazanilanTutar")]).font =
        {
          bold: true,
          color: { argb: INK },
        };
      sm.byParty.forEach((b) => ws.addRow([b.name, b.awarded]));
    }
    this.autoFit(ws);

    // 2. sayfa — kalem bazlı.
    const wsItems = this.sheet(wb, msg("api.companyReports.kalemBazli"));
    this.headerRow(wsItems, [
      msg("api.companyReports.basNo"),
      msg("api.companyReports.basKalem"),
      msg("api.companyReports.basBirim"),
      msg("api.companyReports.basKazananAdet"),
      msg("api.companyReports.basHedefBirim"),
      msg("api.companyReports.basKazananBirim"),
      msg("api.companyReports.basKazananTedarikci"),
      msg("api.companyReports.basHedefTutar"),
      msg("api.companyReports.basKazananTutar"),
      msg("api.companyReports.basTasarruf"),
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
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    wb.created = new Date();

    const ws = this.sheet(
      wb,
      msg("api.companyReports.noTurSayfaAdi", {
        no: data.listing.number ?? msg("api.companyReports.rapor"),
        tur: String(data.listing.round),
      }),
    );
    ws.addRow([data.listing.title]).font = {
      bold: true,
      size: 14,
      color: { argb: INK },
    };
    ws.addRow([
      `${data.listing.number ?? "-"} · ${data.listing.currency} · ${msg(
        "api.companyReports.turN",
        { n: String(data.listing.round) },
      )}`,
    ]).font = { italic: true, color: { argb: "64748B" } };
    if (data.includePrice && data.listing.referenceTotal > 0)
      ws.addRow([
        msg("api.companyReports.hedefToplamTutar", {
          tutar: String(data.listing.referenceTotal),
        }),
      ]).font = {
        bold: true,
        color: { argb: INK },
      };
    ws.addRow([]);

    const headerCells: string[] = [
      msg("api.companyReports.basKalem"),
      msg("api.companyReports.basBirim"),
      msg("api.companyReports.basAdet"),
      msg("api.companyReports.basHedefBirim"),
    ];
    data.parties.forEach((p) => {
      if (data.includePrice) {
        headerCells.push(
          msg("api.companyReports.firmaBirimFiyat", { firma: p.companyName }),
        );
        headerCells.push(
          msg("api.companyReports.firmaToplam", { firma: p.companyName }),
        );
      }
      if (data.includeAnswers)
        headerCells.push(
          msg("api.companyReports.firmaYanit", { firma: p.companyName }),
        );
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
      const totalRow: (string | number)[] = [
        msg("api.companyReports.genelToplam"),
        "",
        "",
        "",
      ];
      const rankRow: (string | number)[] = [
        msg("api.companyReports.siraEnUcuz"),
        "",
        "",
        "",
      ];
      const deltaRow: (string | number)[] = [
        msg("api.companyReports.hedefeGoreTasarruf"),
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
        ws.addRow([msg("api.companyReports.onerilenKazanan")]).font = {
          bold: true,
          color: { argb: INK },
        };
        const recHeader = ws.addRow([
          msg("api.companyReports.basKalem"),
          msg("api.companyReports.basTedarikci"),
          msg("api.companyReports.basBirimFiyat"),
        ]);
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
      const wsHist = this.sheet(wb, msg("api.companyReports.turGecmisi"));
      this.headerRow(wsHist, [
        msg("api.companyReports.basTur"),
        msg("api.companyReports.basTedarikci"),
        msg("api.companyReports.basTutar"),
        msg("api.companyReports.basParaBirimi"),
      ]);
      data.roundHistory.forEach((h) => {
        wsHist.addRow([
          msg("api.companyReports.turN", { n: String(h.round) }),
          h.bidderName,
          h.amount,
          h.currency,
        ]);
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
