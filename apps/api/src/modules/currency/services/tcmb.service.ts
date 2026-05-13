import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { parseStringPromise } from "xml2js";

/** TCMB XML'den fetch edilen kurlar — Currency code → 1 birim TRY karşılığı. */
export interface TcmbRates {
  rates: Partial<Record<string, number>>;
  /** ISO YYYY-MM-DD */
  date: string;
}

/** Türk B2B'de yaygın 8 birim (TRY hariç; TRY=1 sabit). */
const TRACKED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
] as const;

/**
 * V2-3 — TCMB günlük gösterge kurları XML feed'i.
 * Hafta içi 15:30 civarı yayınlanır; cron 16:00 İstanbul saatinde çağırır.
 * Kullandığımız değer: ForexSelling (Döviz Satış) — alıcı için en muhafazakâr.
 */
@Injectable()
export class TcmbService {
  private readonly logger = new Logger(TcmbService.name);
  private readonly url = "https://www.tcmb.gov.tr/kurlar/today.xml";

  constructor(private readonly http: HttpService) {}

  async fetchTodayRates(): Promise<TcmbRates | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<string>(this.url, {
          timeout: 15_000,
          responseType: "text",
        }),
      );

      const parsed = (await parseStringPromise(data)) as {
        Tarih_Date?: {
          $?: { Tarih?: string; Date?: string };
          Currency?: Array<{
            $: { CurrencyCode?: string };
            Unit?: string[];
            ForexSelling?: string[];
          }>;
        };
      };

      const tarihDate = parsed.Tarih_Date;
      if (!tarihDate?.Currency) {
        this.logger.warn("TCMB XML beklenen yapıda değil");
        return null;
      }

      // `Tarih` TR formatı DD.MM.YYYY, `Date` US formatı MM/DD/YYYY.
      // İkisinden hangisi varsa parse et.
      const tarih = tarihDate.$?.Tarih;
      const dateAttr = tarihDate.$?.Date;
      const isoDate = tarih
        ? this.parseTrDate(tarih)
        : dateAttr
          ? this.parseUsDate(dateAttr)
          : null;
      if (!isoDate) {
        this.logger.warn("TCMB XML tarih attribute'u bulunamadı");
        return null;
      }
      const tracked = new Set<string>(TRACKED_CURRENCIES);
      const rates: Record<string, number> = {};

      for (const c of tarihDate.Currency) {
        const code = c.$?.CurrencyCode;
        if (!code || !tracked.has(code)) continue;
        const sellingStr = c.ForexSelling?.[0];
        if (!sellingStr) continue;
        const value = parseFloat(sellingStr);
        if (!Number.isFinite(value)) continue;
        // TCMB JPY için Unit=100 (ForexSelling 100 JPY karşılığı). Normalize: 1 JPY = value / unit.
        const unitStr = c.Unit?.[0];
        const unit = unitStr ? parseInt(unitStr, 10) : 1;
        const safeUnit = Number.isFinite(unit) && unit > 0 ? unit : 1;
        rates[code] = value / safeUnit;
      }

      const missing = TRACKED_CURRENCIES.filter((c) => !(c in rates));
      if (missing.length > 0) {
        this.logger.warn(
          `TCMB'de eksik kurlar (${isoDate}): ${missing.join(", ")}`,
        );
      }

      const summary = TRACKED_CURRENCIES.filter((c) => c in rates)
        .map((c) => `${c}=${rates[c]!.toFixed(4)}`)
        .join(" ");
      this.logger.log(`TCMB rates ${isoDate}: ${summary}`);
      return { rates, date: isoDate };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`TCMB fetch hatası: ${msg}`);
      return null;
    }
  }

  /** "09.05.2026" → "2026-05-09" */
  private parseTrDate(s: string): string | null {
    const parts = s.split(".");
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  /** "05/09/2026" → "2026-05-09" */
  private parseUsDate(s: string): string | null {
    const parts = s.split("/");
    if (parts.length !== 3) return null;
    const [m, d, y] = parts;
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
}
