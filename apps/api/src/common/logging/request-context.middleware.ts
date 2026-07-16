import { Injectable, NestMiddleware } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import type { NextFunction, Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";
import { sentryEnabled } from "../../instrument";

type RequestWithId = Request & { id?: string };

/**
 * İstek başına correlation-id bağlama. nestjs-pino'nun middleware'inden SONRA
 * çalışır (LoggerModule AppModule.imports'ta → onun middleware'i önce kaydolur →
 * `req.id` + ALS store hazır).
 *
 * İki bağlama yapar:
 * 1. `PinoLogger.assign` → reqId nestjs-pino'nun AsyncLocalStorage context'ine
 *    yazılır; bu isteğin TÜM logları (delege edilen `new Logger(...)` dahil, 32
 *    kullanım) otomatik reqId taşır. Redaction'a DOKUNMAZ.
 * 2. Sentry isolation-scope tag → exception (SentryGlobalFilter) VE fırlatılmayan
 *    `reportToSentry` çağrıları (audit [AUDIT-KRİTİK-KAYIP], webhook imza) aynı
 *    isteğe korele olur. Isolation scope, @sentry/nestjs http entegrasyonuyla
 *    istek boyunca (awaited servis çağrıları dahil) AsyncLocalStorage üzerinden
 *    taşınır — bu yüzden middleware'de basılan tag, sonraki async servis
 *    bağlamındaki captureMessage'da görünür (request-context-sentry.spec kanıtı).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly logger: PinoLogger) {}

  use(req: RequestWithId, _res: Response, next: NextFunction): void {
    const reqId = req.id;
    if (reqId) {
      this.logger.assign({ reqId });
      if (sentryEnabled) {
        Sentry.getIsolationScope().setTag("request_id", reqId);
      }
    }
    next();
  }
}
