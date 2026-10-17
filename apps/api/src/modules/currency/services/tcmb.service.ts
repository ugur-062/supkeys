import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { FOREIGN_CURRENCY_CODES } from "@rothern/shared";
import { parseStringPromise } from "xml2js";

/** TCMB XML'den fetch edilen kurlar — Currency code → 1 birim TRY karşılığı. */
export interface TcmbRates {
  rates: Partial<Record<string, number>>;
  /** ISO YYYY-MM-DD */
  date: string;
}

/**
 * Çekilen birimler — TEK KAYNAK `@rothern/shared` `CURRENCY_CODES` (TRY
 * hariç; TRY=1 sabit). 2026-09-27: TCMB'nin günlük kur verdiği 12 birim
 * eklendi (AZN SEK NOK DKK BGN RON KRW SAR QAR KWD AUD CAD).
 */
const TRACKED_CURRENCIES = FOREIGN_CURRENCY_CODES;

/**
 * Avroya SABİT kurla bağlanmış (ya da avroya geçmiş) birimler: TCMB yayınlamazsa
 * EUR kurundan türetilir. Bulgaristan 2026-01-01'de avroya 1 EUR = 1,95583 BGN
 * ile geçti; TCMB BGN yayınlamayı bıraktı (yayın denetimi 2026-09-28 Bölüm 7:
 * her gün "eksik kur: BGN" uyarısı; gösterim bayat yedek kurla %34 düşük
 * çeviriyordu, para yolu taze kur bulamayıp BGN teklifi reddediyordu).
 * BGN listede eski kayıtlar için duruyor (`defaultCurrencyForCountry` BG → EUR).
 */
export const EUR_PEGGED: Readonly<Record<string, number>> = { BGN: 1.95583 };

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
        // Sıfır/negatif değer kur değildir (yayınlanmamış birim) — eksik sayılır.
        if (!Number.isFinite(value) || value <= 0) continue;
        // TCMB bazı birimleri 100'lük verir (JPY, KRW: ForexSelling 100 birim
        // karşılığı). Normalize: 1 birim = value / unit.
        const unitStr = c.Unit?.[0];
        const unit = unitStr ? parseInt(unitStr, 10) : 1;
        const safeUnit = Number.isFinite(unit) && unit > 0 ? unit : 1;
        rates[code] = value / safeUnit;
      }

      const eur = rates.EUR;
      if (eur) {
        for (const [code, perEur] of Object.entries(EUR_PEGGED)) {
          if (!(code in rates) && tracked.has(code)) rates[code] = eur / perEur;
        }
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
