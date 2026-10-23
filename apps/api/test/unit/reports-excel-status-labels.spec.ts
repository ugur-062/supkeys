import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import {
  ReportsExcelService,
  STATUS_KEYS,
  statusLabel,
} from "../../src/modules/company-reports/reports-excel.service";

/**
 * Arayüz testi son tur webB-1: Genel rapor Excel'i kazandırılan talepleri
 * "Tamamlandı" yazıyordu, ekran aynı talepleri "Kazandırıldı" gösteriyordu.
 * Excel'deki her talep durumu etiketi, ekranın kullandığı
 * `web.domain.listingStatus` etiketiyle her dilde birebir aynı olmalı.
 */
const LOCALES = ["tr", "en", "ru"] as const;
const webStatusLabels = (locale: string): Record<string, string> => {
  const file = path.resolve(
    __dirname,
    `../../../../packages/i18n/src/messages/${locale}/web.json`,
  );
  return JSON.parse(readFileSync(file, "utf8")).domain.listingStatus;
};

describe("Genel rapor Excel'i — durum etiketleri ekranla aynı (arayüz testi son tur webB-1)", () => {
  it.each(LOCALES)("%s: her ListingStatus etiketi web.domain.listingStatus ile aynı", (locale) => {
    const web = webStatusLabels(locale);
    expect(Object.keys(STATUS_KEYS).sort()).toEqual(Object.keys(web).sort());
    for (const status of Object.keys(STATUS_KEYS)) {
      expect([status, runWithLocale(locale, () => statusLabel(status))]).toEqual([
        status,
        web[status],
      ]);
    }
  });

  it("AWARDED satırı ve Durum Dağılımı 'Kazandırıldı' yazar, 'Tamamlandı' değil", async () => {
    const data = {
      mode: "SINGLE",
      generatedAt: new Date("2026-09-30T10:00:00Z").toISOString(),
      baseCurrency: "TRY",
      listings: [
        {
          number: "ROT-000392",
          title: "Kazandırılmış talep",
          format: "RFQ",
          status: "AWARDED",
          currency: "TRY",
          round: 1,
          closesAt: null,
          invitedCount: 2,
          submittedBidCount: 2,
          responseRate: 100,
          estimatedTotal: 900,
          lowestTotal: 800,
          highestTotal: 1000,
          winningTotal: 800,
          winnerName: "Tedarikçi A",
          delta: 100,
          createdBy: "Alıcı",
        },
      ],
      summary: {
        totalListings: 1,
        awardedListings: 1,
        cancelledListings: 0,
        totalInvited: 2,
        totalSubmittedBids: 2,
        overallResponseRate: 100,
        avgBidsPerListing: 2,
        totalEstimated: 900,
        totalAwardedValue: 800,
        totalDelta: 100,
        statusBreakdown: { AWARDED: 1 },
      },
    };
    for (const [locale, label, stale] of [
      ["tr", "Kazandırıldı", "Tamamlandı"],
      ["en", "Awarded", "Completed"],
      ["ru", "Победитель выбран", "Завершён"],
    ] as const) {
      const buf = await runWithLocale(locale, () =>
        new ReportsExcelService().general(data as never),
      );
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as never);
      const texts: string[] = [];
      wb.worksheets[0]!.eachRow((rw) =>
        rw.eachCell((c) => {
          if (typeof c.value === "string") texts.push(c.value);
        }),
      );
      expect(texts).not.toContain(stale);
      // Satırdaki Durum hücresi + Durum Dağılımı satırı (EN özetteki "Awarded" de sayılır).
      expect(texts.filter((t) => t === label).length).toBeGreaterThanOrEqual(2);
    }
  });
});
