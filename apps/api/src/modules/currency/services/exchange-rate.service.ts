import { Injectable, Logger } from "@nestjs/common";
import type { Currency } from "@rothern/db";
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
 * V2-6 — Türk B2B'de en yaygın 8 birim. TRY base, diğer 7'si TCMB'den fetch'lenir.
 */
const TRACKED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
] as const satisfies readonly Exclude<Currency, "TRY">[];

/**
 * TCMB API down ise / DB boşken kullanılan koruma kurları (2026 ortalama tahminleri).
 * Production'a geçince ilk cron fetch ile güncellenir.
 */
const FALLBACK_RATES: Record<Exclude<Currency, "TRY">, number> = {
  USD: 34,
  EUR: 37,
  GBP: 43,
  CHF: 38,
  JPY: 0.23,
  AED: 9.25,
  CNY: 4.75,
};

/**
 * Bayatlık eşiği — TCMB hafta sonu/resmî tatilde yayınlamaz (4 güne kadar
 * boşluk meşrudur); 7 günü aşan yaş cron arızası işaretidir.
 */
const STALE_AFTER_MS = 7 * 86_400_000;

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  // Aynı uyarıyı log'a boğmamak için birim başına saatte bir yazılır.
  private readonly lastWarnAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tcmb: TcmbService,
  ) {}

  private warnThrottled(key: string, msg: string): void {
    const now = Date.now();
    if (now - (this.lastWarnAt.get(key) ?? 0) < 3_600_000) return;
    this.lastWarnAt.set(key, now);
    this.logger.warn(msg);
  }

  async getCurrentRate(currency: Currency): Promise<number> {
    if (currency === "TRY") return 1;
    const latest = await this.prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { rateDate: "desc" },
    });
    if (!latest) {
      // Sessiz fallback taban kıyasını/TRY karşılığını yanlış kurla yapardı —
      // en azından gözlemlenebilir olsun (boot seed normalde doldurur).
      this.warnThrottled(
        `fallback:${currency}`,
        `Kur tablosu boş — ${currency} için FALLBACK kuru (${FALLBACK_RATES[currency] ?? 1}) kullanılıyor; TCMB cron'unu kontrol edin`,
      );
      return FALLBACK_RATES[currency] ?? 1;
    }
    const ageMs = Date.now() - latest.rateDate.getTime();
    if (ageMs > STALE_AFTER_MS) {
      this.warnThrottled(
        `stale:${currency}`,
        `${currency} kuru BAYAT: son kayıt ${latest.rateDate.toISOString().slice(0, 10)} (${Math.floor(ageMs / 86_400_000)} gün önce) — TCMB cron'u çalışmıyor olabilir; taban kıyası/TRY karşılığı bu kurla hesaplanıyor`,
      );
    }
    return Number(latest.rate);
  }

  /**
   * Kur tazeliği — health endpoint'i için: en son kayıt tarihi ve bayatlık.
   * DB boşsa stale=true (fallback kullanılıyor demektir).
   */
  async freshness(): Promise<{ latestRateDate: string | null; stale: boolean }> {
    const latest = await this.prisma.exchangeRate.findFirst({
      orderBy: { rateDate: "desc" },
      select: { rateDate: true },
    });
    if (!latest) return { latestRateDate: null, stale: true };
    return {
      latestRateDate: latest.rateDate.toISOString().slice(0, 10),
      stale: Date.now() - latest.rateDate.getTime() > STALE_AFTER_MS,
    };
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
    if (!row) {
      // Sessiz fallback tehlikeli: dashboard/rapor para hesapları sabit tahminle
      // (ör. USD=34) yapılır. Gözlemlenebilirlik için uyar (saatte bir).
      this.warnThrottled(
        `rateOnDate:${currency}`,
        `Kur bulunamadı (${currency} @ ${date.toISOString().slice(0, 10)}) → FALLBACK kullanılıyor; para hesapları yaklaşık olabilir.`,
      );
      return FALLBACK_RATES[currency] ?? 1;
    }
    return Number(row.rate);
  }

  /** Public endpoint için { TRY: 1, USD: ..., EUR: ..., GBP: ..., ... } shape'i */
  async getCurrentRates(): Promise<Record<Currency, number>> {
    const values = await Promise.all(
      TRACKED_CURRENCIES.map((c) => this.getCurrentRate(c)),
    );
    const result = { TRY: 1 } as Record<Currency, number>;
    TRACKED_CURRENCIES.forEach((c, i) => {
      result[c] = values[i] ?? FALLBACK_RATES[c] ?? 1;
    });
    return result;
  }

  /** Yayındaki en güncel kur GÜNÜ (TCMB günlük gösterge) — widget başlığında
   *  fetch saati değil bu tarih gösterilir. Kayıt yoksa null. */
  async latestRateDate(): Promise<string | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      orderBy: { rateDate: "desc" },
      select: { rateDate: true },
    });
    return row ? row.rateDate.toISOString().slice(0, 10) : null;
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
    this.warnThrottled(
      `snapshot:${currency}`,
      `Kur snapshot yok (${currency}) → FALLBACK; teklif TRY karşılığı yaklaşık olabilir.`,
    );
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
   * TCMB'den fetch + upsert (8 birim için). İdempotent: aynı gün tekrar çağrılınca update.
   */
  async refreshFromTcmb(): Promise<{
    success: boolean;
    date?: string;
    rates?: Partial<Record<Currency, number>>;
    reason?: string;
  }> {
    const fetched = await this.tcmb.fetchTodayRates();
    if (!fetched) {
      return { success: false, reason: "TCMB unreachable or invalid response" };
    }

    const rateDate = new Date(fetched.date);
    if (Number.isNaN(rateDate.getTime())) {
      this.logger.error(`TCMB tarihi parse edilemedi: ${fetched.date}`);
      return { success: false, reason: "Invalid TCMB date" };
    }

    const upserts = TRACKED_CURRENCIES.flatMap((currency) => {
      const rate = fetched.rates[currency];
      if (typeof rate !== "number" || !Number.isFinite(rate)) return [];
      return [
        this.prisma.exchangeRate.upsert({
          where: { currency_rateDate: { currency, rateDate } },
          create: { currency, rate, rateDate, source: "TCMB" },
          update: { rate, fetchedAt: new Date(), source: "TCMB" },
        }),
      ];
    });

    if (upserts.length === 0) {
      return { success: false, reason: "No tracked currencies in TCMB response" };
    }

    await this.prisma.$transaction(upserts);

    const persisted: Partial<Record<Currency, number>> = {};
    for (const c of TRACKED_CURRENCIES) {
      const v = fetched.rates[c];
      if (typeof v === "number") persisted[c] = v;
    }

    this.logger.log(
      `ExchangeRate upsert OK ${fetched.date} (${Object.keys(persisted).length}/${TRACKED_CURRENCIES.length} kur)`,
    );
    return { success: true, date: fetched.date, rates: persisted };
  }
}
