import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import type { Currency } from "@rothern/db";
import { FOREIGN_CURRENCY_CODES, productPriceBase } from "@rothern/shared";
import { FALLBACK_RATES, fxRate, setFxRates } from "../../../common/currency/fx-rates";
import { PrismaBypassService, PrismaService } from "../../../common/prisma/prisma.service";
import { TcmbService } from "./tcmb.service";

/**
 * TRY taban, diğerleri TCMB'den çekilir — TEK KAYNAK `@rothern/shared`
 * `CURRENCY_CODES` (2026-09-27: 8 → 20 birim).
 */
const TRACKED_CURRENCIES = FOREIGN_CURRENCY_CODES satisfies readonly Exclude<Currency, "TRY">[];

/** Ürün fiyat tabanı tazelemesi — tek UPDATE'te yazılan satır sayısı. */
const PRICE_BASE_BATCH = 500;

/**
 * Bayatlık eşiği — TCMB hafta sonu/resmî tatilde yayınlamaz (4 güne kadar
 * boşluk meşrudur); 7 günü aşan yaş cron arızası işaretidir.
 */
const STALE_AFTER_MS = 7 * 86_400_000;

@Injectable()
export class ExchangeRateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExchangeRateService.name);
  // Aynı uyarıyı log'a boğmamak için birim başına saatte bir yazılır.
  private readonly lastWarnAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tcmb: TcmbService,
    // Ürün fiyat tabanı tazelemesi TÜM firmaların ürünlerine yazar (bağlamsız
    // sistem işi) → RLS'siz istemci.
    private readonly bypass: PrismaBypassService,
  ) {}

  /** Açılışta bellek içi kur tablosunu DB'den doldurur (`fx-rates.ts`). */
  async onApplicationBootstrap(): Promise<void> {
    await this.syncFxCache().catch((err: unknown) => {
      this.logger.warn(`FX cache load failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /** Bellek içi kur tablosunu DB'deki en güncel kurlarla yeniler. */
  async syncFxCache(): Promise<void> {
    const rows = await this.prisma.exchangeRate.findMany({
      distinct: ["currency"],
      orderBy: [{ currency: "asc" }, { rateDate: "desc" }],
      select: { currency: true, rate: true },
    });
    setFxRates(Object.fromEntries(rows.map((r) => [r.currency, Number(r.rate)])));
  }

  /**
   * Kur değişti (TCMB çekimi ya da admin elle girişi): bellek tablosu
   * tazelenir, ardından ürünlerin TRY karşılığı (`priceAmountBase`) yeniden
   * hesaplanır — ürün dizininin fiyat süzgeci/sıralaması güncel kurla çalışsın.
   * Hata kur işini DÜŞÜRMEZ (taban bir sonraki çekimde yeniden denenir).
   */
  async onRatesChanged(): Promise<void> {
    try {
      await this.syncFxCache();
      const updated = await this.refreshProductPriceBases();
      this.logger.log(`Product price base refreshed: ${updated} rows`);
    } catch (err) {
      this.logger.error(`Product price base refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * `CompanyItem.priceAmountBase` toplu tazeleme. HAM SQL: Prisma
   * `updateMany` `@updatedAt`i ilerletirdi → sitemap lastmod'u ve içerik
   * çevirisi kapsam denetimi sahte "değişti" görürdü. Yalnız değeri DEĞİŞEN
   * satırlar yazılır. Hesap tek kaynak `productPriceBase` (yazma yoluyla aynı).
   */
  async refreshProductPriceBases(): Promise<number> {
    let cursor: string | undefined;
    let updated = 0;
    for (;;) {
      const rows = await this.bypass.companyItem.findMany({
        where: {
          OR: [{ priceMode: { in: ["FIXED", "TIERED"] } }, { priceAmountBase: { not: null } }],
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, priceMode: true, priceAmount: true, priceTiers: true, priceCurrency: true, priceAmountBase: true },
        orderBy: { id: "asc" },
        take: PRICE_BASE_BATCH,
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1]!.id;
      const ids: string[] = [];
      const bases: (string | null)[] = [];
      for (const r of rows) {
        const next = productPriceBase(r, fxRate);
        const prev = r.priceAmountBase == null ? null : Number(r.priceAmountBase);
        if (next === prev) continue;
        ids.push(r.id);
        bases.push(next == null ? null : next.toFixed(2));
      }
      if (ids.length > 0) {
        updated += await this.bypass.$executeRaw`
          UPDATE "company_items" AS ci SET "priceAmountBase" = v.base::numeric
          FROM (SELECT unnest(${ids}::text[]) AS id, unnest(${bases}::text[]) AS base) AS v
          WHERE ci."id" = v.id`;
      }
      if (rows.length < PRICE_BASE_BATCH) break;
    }
    return updated;
  }

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
   * Para-yolu (taban/hemen-al kıyası) için GÜVENİLİR kur: kayıt yoksa veya
   * bayatsa (>7 gün) null döner — sessiz fallback/bayat kurla YANLIŞ kıyas
   * yapıp teklifi haksız kabul/reddetmek yerine caller işlemi açık hatayla
   * reddeder. Gösterim amaçlı yaklaşık değer için getCurrentRate kullanın.
   */
  async getFreshRate(currency: Currency): Promise<number | null> {
    if (currency === "TRY") return 1;
    const latest = await this.prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { rateDate: "desc" },
    });
    if (!latest) return null;
    const ageMs = Date.now() - latest.rateDate.getTime();
    if (ageMs > STALE_AFTER_MS) {
      this.warnThrottled(
        `fresh-stale:${currency}`,
        `${currency} kuru BAYAT (${Math.floor(ageMs / 86_400_000)} gün) — para-yolu kıyası REDDEDİLİYOR; TCMB cron'unu kontrol edin`,
      );
      return null;
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

  // KALDIRILDI (Dalga B, P11): `takeSnapshot()` — ÇAĞRISI YOKTU (ölü kod) ve
  // kur bulunamadığında `source: "FALLBACK"` ile UYDURMA bir kur döndürüyordu.
  // Teklif damgası kalıcıdır ve kazandırma kararını sürer; uydurma kurun oraya
  // yazılabilmesi INV-FX-1'in fail-closed kuralını deliyordu. Bugünkü canlı yol
  // `getFreshRate()` (bayat/yok → null → gönderim reddedilir) — doğru olan o.
  // Yeniden ihtiyaç olursa: null dönmeli, asla FALLBACK damgası değil.

  async toTry(amount: number, currency: Currency, onDate?: Date): Promise<number> {
    if (currency === "TRY") return amount;
    const rate = onDate
      ? await this.getRateOnDate(currency, onDate)
      : await this.getCurrentRate(currency);
    return amount * rate;
  }

  /**
   * TCMB'den fetch + upsert (takip edilen tüm birimler). İdempotent: aynı gün
   * tekrar çağrılınca update. Başarıda bellek tablosu + ürün fiyat tabanı tazelenir.
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
    await this.onRatesChanged();
    return { success: true, date: fetched.date, rates: persisted };
  }
}
