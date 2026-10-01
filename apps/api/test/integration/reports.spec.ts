/**
 * Raporlama motoru (eski sistem portu) — Genel (SINGLE/RANGE), Tasarruf,
 * Teklif Karşılaştırma. Hesaplar + kiracı izolasyonu + kapalı zarf (yalnız
 * sahip) doğrulanır.
 */
import { CompanyReportsService } from "../../src/modules/company-reports/company-reports.service";
import { ReportsExcelService } from "../../src/modules/company-reports/reports-excel.service";
import { YES_NO_ANSWER_VALUES } from "@rothern/shared";
import ExcelJS from "exceljs";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

const svc = () => new CompanyReportsService(prisma as never);
const past = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();
const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** AWARDED ALIM: kazanan 800 (hedef 900), kaybeden 1000 → tasarruf 200. */
async function awardedAlim(owner: {
  company: { id: string };
  user: { id: string };
}) {
  const s1 = await makeCompanyWithUser(prisma, { country: "TR" });
  const s2 = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "AWARDED",
    awardedAt: new Date(),
  });
  const item = await makeItem(prisma, listing.id, {
    quantity: 1,
    targetPrice: 900,
  } as never);
  await prisma.listingInvitation.createMany({
    data: [
      {
        listingId: listing.id,
        invitedCompanyId: s1.company.id,
        invitedById: owner.user.id,
      },
      {
        listingId: listing.id,
        invitedCompanyId: s2.company.id,
        invitedById: owner.user.id,
      },
    ],
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: s1.company.id,
    createdById: s1.user.id,
    amount: 800,
    status: "WON",
    items: [{ itemId: item.id, unitPrice: 800 }],
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: s2.company.id,
    createdById: s2.user.id,
    amount: 1000,
    status: "LOST",
    items: [{ itemId: item.id, unitPrice: 1000 }],
  });
  return { listing, item, s1, s2 };
}

/**
 * Kalem bazlı (kısmi) kazandırma: iki kalem iki ayrı tedarikçiye verildi. Her
 * kısmi kazananın teklifi İKİ kalemi de fiyatlar (A: 100+220=320, B: 110+200=310);
 * kalem 1 → A (100), kalem 2 → B (200), siparişler kazandırmayı yansıtır.
 * Doğru kazanan tutarı 300, en yüksek teklif 320 → tasarruf +20 (eski hesap
 * 320+310=630 → −310; arayüz testi Y-04).
 */
async function splitAwardAlim(owner: {
  company: { id: string };
  user: { id: string };
}) {
  const a = await makeCompanyWithUser(prisma, { country: "TR" });
  const b = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "AWARDED",
    awardedAt: new Date(),
  });
  const i1 = await makeItem(prisma, listing.id, { name: "Civata", quantity: 1, targetPrice: 120 } as never);
  const i2 = await makeItem(prisma, listing.id, { name: "Somun", lineNo: 2, quantity: 1, targetPrice: 210 } as never);
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: a.company.id,
    createdById: a.user.id,
    amount: 320,
    status: "AWARDED_PARTIAL",
    items: [
      { itemId: i1.id, unitPrice: 100 },
      { itemId: i2.id, unitPrice: 220 },
    ],
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: b.company.id,
    createdById: b.user.id,
    amount: 310,
    status: "AWARDED_PARTIAL",
    items: [
      { itemId: i1.id, unitPrice: 110 },
      { itemId: i2.id, unitPrice: 200 },
    ],
  });
  for (const [seller, name, unitPrice] of [
    [a.company.id, "Civata", 100],
    [b.company.id, "Somun", 200],
  ] as const) {
    await prisma.companyOrder.create({
      data: {
        listingId: listing.id,
        buyerCompanyId: owner.company.id,
        sellerCompanyId: seller,
        amount: unitPrice,
        currency: "TRY",
        items: { create: [{ name, quantity: 1, unit: "adet", unitPrice }] },
      },
    });
  }
  return { listing, a, b };
}

describe("Kalem bazlı (kısmi) kazandırma — kazanan tutarı iki kez sayılmaz (arayüz testi Y-04)", () => {
  it("Tasarruf raporu: kazanan = fiilen kazandırılan kalemler, tasarruf pozitif", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await splitAwardAlim(owner);
    const r = await svc().savings(owner.company.id, { rangeStart: past(7), rangeEnd: future(1) });
    const row = r.rows[0]!;
    expect(row.highestBid).toBe(320);
    expect(row.winningTotal).toBe(300);
    expect(row.actualTotal).toBe(300);
    expect(row.delta).toBe(20);
    expect(row.deltaPct).toBeCloseTo(6.25, 5);
    expect(r.summary.grandDelta).toBe(20);
  });

  it("Genel rapor: aynı kazanan tutarı ve tasarruf (iki rapor tek yardımcı)", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing } = await splitAwardAlim(owner);
    const g = await svc().general(owner.company.id, { mode: "SINGLE", listingId: listing.id });
    expect(g.listings[0]!.winningTotal).toBe(300);
    expect(g.listings[0]!.delta).toBe(20);
    expect(g.summary.totalAwardedValue).toBe(300);
    expect(g.summary.totalDelta).toBe(20);
  });
});

describe("Ters tarih aralığı (arayüz testi D-113)", () => {
  it("bitiş başlangıçtan önceyse Genel ve Tasarruf raporu 400 döner", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc().general(owner.company.id, { mode: "RANGE", rangeStart: past(1), rangeEnd: past(10) }),
    ).rejects.toMatchObject({ response: { code: "REPORT_RANGE_INVERTED" } });
    await expect(
      svc().savings(owner.company.id, { rangeStart: past(1), rangeEnd: past(10) }),
    ).rejects.toMatchObject({ response: { code: "REPORT_RANGE_INVERTED" } });
  });
});

describe("Genel rapor", () => {
  it("SINGLE: numarayla çözer; satır katılım+tasarruf içerir; sahip-dışı 404", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing } = await awardedAlim(owner);

    const r = await service.general(owner.company.id, {
      mode: "SINGLE",
      listingId: listing.id,
    });
    expect(r.listings).toHaveLength(1);
    const row = r.listings[0]!;
    expect(row.invitedCount).toBe(2);
    expect(row.submittedBidCount).toBe(2);
    expect(row.responseRate).toBe(100);
    expect(row.winningTotal).toBe(800);
    expect(row.delta).toBe(200);
    expect(row.estimatedTotal).toBe(900);

    await expect(
      service.general(outsider.company.id, {
        mode: "SINGLE",
        listingId: listing.id,
      }),
    ).rejects.toThrow(/bulunamadı/);
  });

  it("RANGE: tarih aralığı süzer; başka firmanın verisi karışmaz", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await awardedAlim(owner);
    await awardedAlim(other);

    const r = await service.general(owner.company.id, {
      mode: "RANGE",
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    expect(r.listings).toHaveLength(1);
    expect(r.summary.totalListings).toBe(1);
    expect(r.summary.totalAwardedValue).toBe(800);
    expect(r.summary.totalDelta).toBe(200);

    // Aralık dışı → boş.
    const empty = await service.general(owner.company.id, {
      mode: "RANGE",
      rangeStart: past(30),
      rangeEnd: past(14),
    });
    expect(empty.listings).toHaveLength(0);
  });
});

describe("Tasarruf raporu", () => {
  it("tasarruf = en yüksek − kazanan; kalem detayı hedef-vs-kazanan", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await awardedAlim(owner);

    const r = await service.savings(owner.company.id, {
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    expect(row.highestBid).toBe(1000);
    expect(row.winningTotal).toBe(800);
    expect(row.delta).toBe(200);
    expect(row.items[0]!.referenceUnitPrice).toBe(900);
    expect(row.items[0]!.winningUnitPrice).toBe(800);
    expect(row.items[0]!.delta).toBe(100); // hedef 900 − kazanan 800
    expect(r.summary.grandDelta).toBe(200);
  });
});

describe("Teklif Karşılaştırma raporu", () => {
  it("matris: en iyi birim vurgusu, sıra, önerilen kazanan; teklif vermeyen davetli opsiyonel", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, item, s1, s2 } = await awardedAlim(owner);
    // Teklif vermeyen üçüncü davetli.
    const s3 = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: s3.company.id,
        invitedById: owner.user.id,
      },
    });

    const r = await service.bidComparison(owner.company.id, {
      listingId: listing.id,
      criteria: "PRICE",
      includeNonBidders: false,
    });
    expect(r.parties).toHaveLength(2);
    const p1 = r.parties.find((p) => p.companyId === s1.company.id)!;
    const p2 = r.parties.find((p) => p.companyId === s2.company.id)!;
    expect(p1.rank).toBe(1); // ALIM: en ucuz = 1
    expect(p2.rank).toBe(2);
    expect(p1.itemPrices[0]!.isBest).toBe(true);
    expect(p2.itemPrices[0]!.isBest).toBe(false);
    expect(r.items[0]!.bestUnitPrice).toBe(800);
    expect(r.recommendedAwards[0]!.companyName).toBeTruthy();
    expect(r.recommendedAwards[0]!.unitPrice).toBe(800);
    // Hedefe göre tasarruf (hedef 900 − kazanan 800 = 100).
    expect(p1.deltaVsReference).toBe(100);

    const withNon = await service.bidComparison(owner.company.id, {
      listingId: listing.id,
      criteria: "PRICE",
      includeNonBidders: true,
    });
    expect(withNon.parties).toHaveLength(3);
    const noBid = withNon.parties.find((p) => p.companyId === s3.company.id)!;
    expect(noBid.submitted).toBe(false);
    expect(noBid.status).toBe("NO_BID");
    void item;
  });

  it("kazandırmada kaybeden ucuz teklif vurgu, öneri ve SIRA'da tutarlı; yalnız ELENEN dışlanır (arayüz testi O-027)", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const s1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const s2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const s3 = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "AWARDED",
      awardedAt: new Date(),
    });
    const item = await makeItem(prisma, listing.id, { quantity: 1, targetPrice: 900 } as never);
    // Pahalı kazanan, ucuz kaybeden (kazandırmayla LOST, elenmedi), en ucuz elenen.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: s1.company.id,
      createdById: s1.user.id,
      amount: 950,
      status: "WON",
      items: [{ itemId: item.id, unitPrice: 950 }],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: s2.company.id,
      createdById: s2.user.id,
      amount: 800,
      status: "LOST",
      items: [{ itemId: item.id, unitPrice: 800 }],
    });
    const elim = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: s3.company.id,
      createdById: s3.user.id,
      amount: 500,
      status: "LOST",
      items: [{ itemId: item.id, unitPrice: 500 }],
    });
    await prisma.listingBid.update({ where: { id: elim.id }, data: { eliminatedAt: new Date() } });

    const r = await svc().bidComparison(owner.company.id, {
      listingId: listing.id,
      criteria: "PRICE",
    });
    const won = r.parties.find((p) => p.companyId === s1.company.id)!;
    const lost = r.parties.find((p) => p.companyId === s2.company.id)!;
    const eliminated = r.parties.find((p) => p.companyId === s3.company.id)!;
    // Kaybeden elenmedi: en iyi fiyat, öneri ve SIRA 1 aynı teklif.
    expect(lost.eliminated).toBe(false);
    expect(lost.rank).toBe(1);
    expect(lost.itemPrices[0]!.isBest).toBe(true);
    expect(r.items[0]!.bestCompanyId).toBe(s2.company.id);
    expect(r.recommendedAwards[0]!.unitPrice).toBe(800);
    expect(won.rank).toBe(2);
    expect(won.itemPrices[0]!.isBest).toBe(false);
    // Elenen iki hesaptan da dışlanır.
    expect(eliminated.eliminated).toBe(true);
    expect(eliminated.rank).toBeNull();
    expect(eliminated.itemPrices[0]!.isBest).toBe(false);
  });

  it("YES_NO cevabı istek dilinde gösterilir (saklanan sabit değer çevrilir; derin denetim LU-21)", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, item } = await awardedAlim(owner);
    const q = await prisma.listingItemQuestion.create({
      data: { itemId: item.id, text: "CE certified?", answerType: "YES_NO" },
    });
    const qText = await prisma.listingItemQuestion.create({
      data: { itemId: item.id, text: "Brand", answerType: "TEXT" },
    });
    const bids = await prisma.listingBid.findMany({
      where: { listingId: listing.id },
      orderBy: { amount: "asc" },
    });
    await prisma.listingBidAnswer.createMany({
      data: [
        { bidId: bids[0]!.id, questionId: q.id, value: YES_NO_ANSWER_VALUES.yes },
        { bidId: bids[0]!.id, questionId: qText.id, value: "Evet" },
        { bidId: bids[1]!.id, questionId: q.id, value: YES_NO_ANSWER_VALUES.no },
      ],
    });
    const r = await runWithLocale("en", () =>
      service.bidComparison(owner.company.id, {
        listingId: listing.id,
        criteria: "ANSWERS",
        includeNonBidders: false,
      }),
    );
    const answers = r.parties
      .map((p) => (p.itemAnswers[0]?.answer ?? "").split(" | ").sort().join(" | "))
      .sort();
    // TEXT sorusunun serbest cevabı aynen kalır; yalnız YES_NO çevrilir.
    expect(answers).toEqual(["Brand: Evet | CE certified?: Yes", "CE certified?: No"]);
  });

  it("Excel çıktıları üç rapor için de üretilir (buffer)", async () => {
    const service = svc();
    const excel = new ReportsExcelService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing } = await awardedAlim(owner);

    const g = await service.general(owner.company.id, {
      mode: "SINGLE",
      listingId: listing.id,
    });
    const s = await service.savings(owner.company.id, {
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    const c = await service.bidComparison(owner.company.id, {
      listingId: listing.id,
      criteria: "BOTH",
    });
    const [gb, sb, cb] = await Promise.all([
      excel.general(g),
      excel.savings(s),
      excel.bidComparison(c),
    ]);
    // xlsx = zip → "PK" imzası.
    for (const buf of [gb, sb, cb]) {
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 2).toString()).toBe("PK");
    }
  });

  it("Excel yüzde hücreleri SAYI + yüzde biçimi (metin '100%' değil; arayüz testi O-033)", async () => {
    const service = svc();
    const excel = new ReportsExcelService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing } = await awardedAlim(owner);
    const load = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as never);
      return wb.worksheets[0]!;
    };
    const percentCells = (ws: ExcelJS.Worksheet) => {
      const out: ExcelJS.Cell[] = [];
      ws.eachRow((row) => row.eachCell((cell) => {
        if (cell.numFmt === "0.0%") out.push(cell);
      }));
      return out;
    };
    const textPercent = (ws: ExcelJS.Worksheet) => {
      let n = 0;
      ws.eachRow((row) => row.eachCell((cell) => {
        if (typeof cell.value === "string" && /^-?[\d.,]+%$/.test(cell.value)) n += 1;
      }));
      return n;
    };

    const g = await load(await excel.general(await service.general(owner.company.id, { mode: "SINGLE", listingId: listing.id })));
    const gp = percentCells(g);
    expect(gp.length).toBeGreaterThanOrEqual(2); // satır yanıt oranı + özet
    expect(gp.every((c) => c.value === 1)).toBe(true); // %100 → 1
    expect(textPercent(g)).toBe(0);

    const s = await load(await excel.savings(await service.savings(owner.company.id, { rangeStart: past(7), rangeEnd: future(1) })));
    const sp = percentCells(s);
    expect(sp.length).toBeGreaterThanOrEqual(3);
    expect(sp.every((c) => typeof c.value === "number")).toBe(true);
    expect(sp[0]!.value).toBeCloseTo(0.2, 6); // (1000 − 800) / 1000
    expect(textPercent(s)).toBe(0);
  });
});
