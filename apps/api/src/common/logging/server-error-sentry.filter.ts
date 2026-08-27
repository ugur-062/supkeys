import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { SentryGlobalFilter } from "@sentry/nestjs/setup";
import { reportToSentry } from "../../instrument";

/**
 * `SentryGlobalFilter` + SUNUCU HATALARI (denetim 2026-08-27 Parça 11 #1).
 *
 * Sorun: `@sentry/nestjs`'in filtresi "beklenen kontrol akışı hatalarını"
 * atlıyor ve bu kararı şöyle veriyor (build/cjs/helpers.js):
 *
 *     isExpectedError = 'status' in exception || 'error' in exception
 *
 * Nest'in `HttpException` kurucusu kendi `this.status` alanını yazdığı için
 * **HER HttpException — 500'ler dahil — "beklenen" sayılıyordu.** Kod tabanında
 * elle atılan 18 adet 5xx var (R2 yapılandırma/erişim hataları, AI sağlayıcı
 * 502/503, "Dosya içeriği okunamadı"); bunların hiçbiri Sentry'e ulaşmıyordu.
 * Sonuç: R2 kısmi arızasında kullanıcı "dosya açılmıyor" derken gözlem
 * tarafında tek bir olay bile görünmüyordu.
 *
 * Çözüm: 4xx'leri (gerçekten beklenen kontrol akışı) atlamaya devam et, ama
 * durum kodu ≥500 olan HttpException'ları açıkça raporla. Yakalanmamış
 * istisnalar (HttpException olmayanlar) zaten üst sınıf tarafından
 * raporlanıyor — orayı olduğu gibi bırakıyoruz.
 */
@Catch()
export class ServerErrorSentryFilter extends SentryGlobalFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException && exception.getStatus() >= 500) {
      const res = exception.getResponse();
      reportToSentry(`HTTP ${exception.getStatus()}: ${exception.message}`, "error", {
        tags: { http_status: String(exception.getStatus()) },
        extra: {
          name: exception.name,
          response: typeof res === "string" ? res : JSON.stringify(res).slice(0, 2000),
          stack: exception.stack?.slice(0, 2000),
        },
      });
    }
    super.catch(exception, host);
  }
}
