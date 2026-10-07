/**
 * Raporlar hub özeti — `POST /company/reports/summary`
 * (`CompanyReportsService.summary`). Sözleşme: son 6 ayın sipariş toplamı her
 * siparişin KENDİ biriminden GÜNCEL kurla firmanın rapor birimine çevrilir;
 * REJECTED/CANCELLED sipariş sayılmaz; yalnız firmanın ALICI olduğu siparişler;
 * ay kovaları ve pencere sınırı Europe/Istanbul takvimiyle (sunucu UTC'de
 * koşar — tek kaynak `common/time/app-calendar.ts`).
 *
 * NOT: ay sınırı testleri sunucunun yerel saatine bağlı eski hesabı yalnız
 * süreç UTC'deyken (CI, canlı) kırmızıya düşürür; İstanbul saatli geliştirici
 * makinesinde eski kod tesadüfen doğruydu. Yerelde doğrulamak için `TZ=UTC`.
 */
import { CompanyReportsService } from "../../src/modules/company-reports/company-reports.service";
import { resetFxRates, setFxRates } from "../../src/common/currency/fx-rates";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";

const svc = () => new CompanyReportsService(prisma as never);

/** "Şimdi": 15 Ekim 2026 12:00 İstanbul. Pencere Mayıs…Ekim 2026. */
const NOW = new Date("2026-10-15T09:00:00.000Z");

beforeAll(() => {
  // Yalnız `Date` sahte; zamanlayıcılar gerçek kalır (Prisma/pg onlara dayanır).
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});
afterAll(async () => {
  jest.useRealTimers();
  resetFxRates();
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  resetFxRates();
  await truncateAll();
});

let seq = 0;
async function order(
  buyerCompanyId: string,
  sellerCompanyId: string,
  over: {
    amount: number;
    currency?: string;
    status?: string;
    createdAt: string;
  },
) {
  seq += 1;
  return prisma.companyOrder.create({
    data: {
      number: `ROT-ORD-S${String(seq).padStart(5, "0")}`,
      buyerCompanyId,
      sellerCompanyId,
      amount: over.amount,
      currency: (over.currency ?? "TRY") as never,
      status: (over.status ?? "ACCEPTED") as never,
      paymentTiming: "AFTER_DELIVERY",
      createdAt: new Date(over.createdAt),
    } as never,
  });
}

const month = (
  res: Awaited<ReturnType<CompanyReportsService["summary"]>>,
  key: string,
) => {
  const m = res.months.find((x) => x.key === key);
  if (!m) throw new Error(`ay kovası yok: ${key}`);
  return m;
};

describe("Raporlar özeti — sipariş toplamı", () => {
  it("TRY + USD siparişler GÜNCEL kurla rapor birimine çevrilir; REJECTED/CANCELLED ve satıcı tarafı siparişler dışarıda", async () => {
    setFxRates({ USD: 40, EUR: 50 });
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = me.company.id;
    const s = other.company.id;

    await order(b, s, { amount: 1000, createdAt: "2026-10-10T10:00:00Z" });
    await order(b, s, { amount: 100, currency: "USD", createdAt: "2026-10-11T10:00:00Z" });
    await order(b, s, { amount: 10, currency: "EUR", status: "COMPLETED", createdAt: "2026-09-10T10:00:00Z" });
    await order(b, s, { amount: 250, status: "PENDING", createdAt: "2026-09-12T10:00:00Z" });
    // Sayılmayanlar:
    await order(b, s, { amount: 9999, status: "REJECTED", createdAt: "2026-10-10T10:00:00Z" });
    await order(b, s, { amount: 9999, currency: "USD", status: "CANCELLED", createdAt: "2026-10-10T10:00:00Z" });
    await order(s, b, { amount: 7777, createdAt: "2026-10-10T10:00:00Z" }); // firma SATICI
    const third = await makeCompanyWithUser(prisma, { country: "TR" });
    await order(third.company.id, s, { amount: 5555, createdAt: "2026-10-10T10:00:00Z" });

    const res = await svc().summary(b);

    expect(res.currency).toBe("TRY");
    expect(res.months.map((m) => m.key)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    // Ekim: 1.000 + 100 USD × 40. Eylül: 10 EUR × 50 + 250.
    expect(month(res, "2026-10").orderTotalTry).toBe(5000);
    expect(month(res, "2026-09").orderTotalTry).toBe(750);
    expect(month(res, "2026-08").orderTotalTry).toBe(0);
    expect(res.orders).toEqual({ count: 4, avgTry: 1437.5 });
  });

  it("çevrim damgalı değil GÜNCEL kurladır: kur tablosu değişince aynı sipariş yeni kurla toplanır", async () => {
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await order(me.company.id, other.company.id, {
      amount: 100,
      currency: "USD",
      createdAt: "2026-10-11T10:00:00Z",
    });

    setFxRates({ USD: 40 });
    expect(month(await svc().summary(me.company.id), "2026-10").orderTotalTry).toBe(4000);
    setFxRates({ USD: 50 });
    const res = await svc().summary(me.company.id);
    expect(month(res, "2026-10").orderTotalTry).toBe(5000);
    expect(res.orders).toEqual({ count: 1, avgTry: 5000 });
  });

  it("rapor birimi TRY değilse (Talep Şartları ana birimi USD) tutarlar o birime çevrilir", async () => {
    setFxRates({ USD: 40, EUR: 50 });
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: me.company.id },
      data: { requestDefaults: { primaryCurrency: "USD" } },
    });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = me.company.id;
    const s = other.company.id;
    await order(b, s, { amount: 4000, createdAt: "2026-10-10T10:00:00Z" }); // 100 USD
    await order(b, s, { amount: 100, currency: "USD", createdAt: "2026-10-10T11:00:00Z" });
    await order(b, s, { amount: 80, currency: "EUR", createdAt: "2026-10-10T12:00:00Z" }); // 100 USD

    const res = await svc().summary(b);

    expect(res.currency).toBe("USD");
    expect(month(res, "2026-10").orderTotalTry).toBe(300);
    expect(res.orders).toEqual({ count: 3, avgTry: 100 });
  });

  it("sipariş yokken toplam 0, ortalama null, altı kova da çizilir", async () => {
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const res = await svc().summary(me.company.id);
    expect(res.months).toHaveLength(6);
    expect(res.months.every((m) => m.orderTotalTry === 0 && m.listings === 0 && m.bids === 0)).toBe(true);
    expect(res.orders).toEqual({ count: 0, avgTry: null });
    expect(res.winRate).toEqual({ won: 0, total: 0 });
    expect(res.categories).toEqual([]);
  });
});

describe("Raporlar özeti — ay sınırı Europe/Istanbul (UTC değil)", () => {
  it("1 Ekim 00:30 (TR) = 30 Eylül 21:30 UTC siparişi EKİM kovasına; 30 Eylül 23:30 (TR) EYLÜL'e yazılır", async () => {
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = me.company.id;
    const s = other.company.id;
    await order(b, s, { amount: 500, createdAt: "2026-09-30T21:30:00Z" }); // TR 1 Eki 00:30
    await order(b, s, { amount: 300, createdAt: "2026-09-30T20:30:00Z" }); // TR 30 Eyl 23:30

    const res = await svc().summary(b);

    expect(month(res, "2026-10").orderTotalTry).toBe(500);
    expect(month(res, "2026-09").orderTotalTry).toBe(300);
  });

  it("pencerenin başı İstanbul'un ay başıdır: 1 Mayıs 00:30 (TR) içeride, 30 Nisan 23:30 (TR) dışarıda", async () => {
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = me.company.id;
    const s = other.company.id;
    await order(b, s, { amount: 200, createdAt: "2026-04-30T21:30:00Z" }); // TR 1 May 00:30
    await order(b, s, { amount: 7777, createdAt: "2026-04-30T20:30:00Z" }); // TR 30 Nis 23:30

    const res = await svc().summary(b);

    expect(month(res, "2026-05").orderTotalTry).toBe(200);
    expect(res.orders).toEqual({ count: 1, avgTry: 200 });
  });

  it("talep ve teklif adetleri de aynı takvimle kovalanır; kazanma oranı son 12 ayın sonuçlanan taleplerinden", async () => {
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const mk = (status: string, createdAt: string) =>
      makeListing(prisma, {
        companyId: me.company.id,
        createdById: me.user.id,
        type: "ALIM",
        status: status as never,
        createdAt: new Date(createdAt),
      });
    const l1 = await mk("AWARDED", "2026-09-30T21:30:00Z"); // TR Ekim
    await mk("AWARDED", "2026-09-30T20:30:00Z"); // TR Eylül
    await mk("CLOSED_NO_AWARD", "2026-06-10T10:00:00Z");
    await mk("CANCELLED", "2026-01-10T10:00:00Z"); // 6 ay dışı, 12 ay içi
    await mk("OPEN", "2026-10-05T10:00:00Z"); // karar yok → orana girmez
    await mk("AWARDED", "2025-10-31T20:30:00Z"); // TR 31 Eki 2025 → 12 ay dışı
    // Başka firmanın talebi sayılmaz.
    await makeListing(prisma, {
      companyId: bidder.company.id,
      createdById: bidder.user.id,
      type: "ALIM",
      status: "AWARDED",
      createdAt: new Date("2026-10-05T10:00:00Z"),
    });
    const bid = await makeBid(prisma, {
      listingId: l1.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      status: "WON",
    });
    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { createdAt: new Date("2026-09-30T21:30:00Z") }, // TR Ekim
    });

    const res = await svc().summary(me.company.id);

    expect(month(res, "2026-10").listings).toBe(2);
    expect(month(res, "2026-09").listings).toBe(1);
    expect(month(res, "2026-06").listings).toBe(1);
    expect(month(res, "2026-10").bids).toBe(1);
    expect(month(res, "2026-09").bids).toBe(0);
    expect(res.winRate).toEqual({ won: 2, total: 4 });
  });
});
