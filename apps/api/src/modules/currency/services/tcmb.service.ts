import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { parseStringPromise } from "xml2js";

interface TcmbRates {
  USD: number;
  EUR: number;
  /** ISO YYYY-MM-DD */
  date: string;
}

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
      let usd: number | null = null;
      let eur: number | null = null;

      for (const c of tarihDate.Currency) {
        const code = c.$?.CurrencyCode;
        const sellingStr = c.ForexSelling?.[0];
        if (!sellingStr) continue;
        const value = parseFloat(sellingStr);
        if (!Number.isFinite(value)) continue;
        if (code === "USD") usd = value;
        else if (code === "EUR") eur = value;
      }

      if (usd === null || eur === null) {
        this.logger.warn(`TCMB'de USD veya EUR eksik (${isoDate})`);
        return null;
      }

      this.logger.log(
        `TCMB rates ${isoDate}: USD=${usd.toFixed(4)} TRY, EUR=${eur.toFixed(4)} TRY`,
      );
      return { USD: usd, EUR: eur, date: isoDate };
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
