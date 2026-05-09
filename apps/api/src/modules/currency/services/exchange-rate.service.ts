import { Injectable, Logger } from "@nestjs/common";
import type { Currency } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { TcmbService } from "./tcmb.service";

/**
 * Bid'e ilişkilendirilen snapshot — Json field'a yazılır.
 */
export interface ExchangeRateSnapshot {
  rate: number;
  rateDate: string; // ISO YYYY-MM-DD
  fetchedAt: string; // ISO timestamp
  source: "TCMB" | "MANUAL" | "FALLBACK";
}

/**
 * TCMB API down ise / DB boşken kullanılan koruma kurları.
 * V2-3 başlangıcında 2026 ortalama tahminleri; production'a geçince ilk
 * cron fetch ile güncellenir.
 */
const FALLBACK_RATES: Record<Exclude<Currency, "TRY">, number> = {
  USD: 34,
  EUR: 37,
};

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tcmb: TcmbService,
  ) {}

  async getCurrentRate(currency: Currency): Promise<number> {
    if (currency === "TRY") return 1;
    const latest = await this.prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { rateDate: "desc" },
    });
    if (!latest) return FALLBACK_RATES[currency] ?? 1;
    return Number(latest.rate);
  }

  /**
   * Belirli tarihteki en güncel kur — bid submit anındaki snapshot için.
   * `rateDate <= date` filtresi: TCMB hafta sonu yayınlamaz, son iş günü kuru kullanılır.
   */
  async getRateOnDate(currency: Currency, date: Date): Promise<number> {
    if (currency === "TRY") return 1;
    const row = await this.prisma.exchangeRate.findFirst({
      where: { currency, rateDate: { lte: date } },
      orderBy: { rateDate: "desc" },
    });
    if (!row) return FALLBACK_RATES[currency] ?? 1;
    return Number(row.rate);
  }

  /** Public endpoint için { TRY: 1, USD: ..., EUR: ... } shape'i */
  async getCurrentRates(): Promise<Record<Currency, number>> {
    const [usd, eur] = await Promise.all([
      this.getCurrentRate("USD"),
      this.getCurrentRate("EUR"),
    ]);
    return { TRY: 1, USD: usd, EUR: eur };
  }

  /**
   * Bid submit anında çağrılır. TRY için snapshot null döner — caller
   * direkt kullanmaz.
   */
  async takeSnapshot(currency: Currency): Promise<ExchangeRateSnapshot | null> {
    if (currency === "TRY") return null;
    const row = await this.prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { rateDate: "desc" },
    });
    if (row) {
      return {
        rate: Number(row.rate),
        rateDate: row.rateDate.toISOString().slice(0, 10),
        fetchedAt: row.fetchedAt.toISOString(),
        source: row.source as "TCMB" | "MANUAL" | "FALLBACK",
      };
    }
    return {
      rate: FALLBACK_RATES[currency] ?? 1,
      rateDate: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
      source: "FALLBACK",
    };
  }

  async toTry(amount: number, currency: Currency, onDate?: Date): Promise<number> {
    if (currency === "TRY") return amount;
    const rate = onDate
      ? await this.getRateOnDate(currency, onDate)
      : await this.getCurrentRate(currency);
    return amount * rate;
  }

  /**
   * TCMB'den fetch + upsert. İdempotent: aynı gün tekrar çağrılınca update.
   */
  async refreshFromTcmb(): Promise<{
    success: boolean;
    date?: string;
    rates?: { USD: number; EUR: number };
    reason?: string;
  }> {
    const rates = await this.tcmb.fetchTodayRates();
    if (!rates) {
      return { success: false, reason: "TCMB unreachable or invalid response" };
    }

    // Prisma `@db.Date` field UTC midnight Date object bekler.
    const rateDate = new Date(rates.date);
    if (Number.isNaN(rateDate.getTime())) {
      this.logger.error(`TCMB tarihi parse edilemedi: ${rates.date}`);
      return { success: false, reason: "Invalid TCMB date" };
    }

    await this.prisma.$transaction([
      this.prisma.exchangeRate.upsert({
        where: { currency_rateDate: { currency: "USD", rateDate } },
        create: {
          currency: "USD",
          rate: rates.USD,
          rateDate,
          source: "TCMB",
        },
        update: { rate: rates.USD, fetchedAt: new Date(), source: "TCMB" },
      }),
      this.prisma.exchangeRate.upsert({
        where: { currency_rateDate: { currency: "EUR", rateDate } },
        create: {
          currency: "EUR",
          rate: rates.EUR,
          rateDate,
          source: "TCMB",
        },
        update: { rate: rates.EUR, fetchedAt: new Date(), source: "TCMB" },
      }),
    ]);

    this.logger.log(`ExchangeRate upsert OK ${rates.date}`);
    return {
      success: true,
      date: rates.date,
      rates: { USD: rates.USD, EUR: rates.EUR },
    };
  }
}
