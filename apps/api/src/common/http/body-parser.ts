import type { NestApplicationOptions } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * HTTP gövde ayrıştırıcı kablolaması — `main.ts` ve uçtan uca testin ORTAK
 * kaynağı (test/integration/resend-webhook-e2e.spec.ts gerçek kablolamayı
 * koşar; ayar burada değişirse test de aynı ayarla koşar).
 *
 * Resend webhook'u svix imzasını HAM gövde üzerinden doğrular
 * (`WebhookSignatureGuard` → `request.rawBody`). Ham gövde YALNIZ o uç için
 * saklanır; diğer uçlarda 5 MB'a kadar gövdenin ikinci kopyası bellekte
 * tutulmaz.
 */

/** Global önek dahil tam yol (Resend panelindeki webhook URL'inin yolu). */
export const RESEND_WEBHOOK_PATH = "/api/webhooks/resend";

/** JSON gövde tavanı (security audit Y-3: 25 MB → 5 MB). */
export const JSON_BODY_LIMIT = "5mb";

/**
 * `NestFactory.create` seçenekleri — gövde ayrıştırıcıyı biz kurarız.
 *
 * `rawBody` BİLİNÇLİ OLARAK `true` DEĞİL (canlı öncesi sağlamlaştırma H5):
 * `rawBody: true` iken Nest, `app.useBodyParser(...)`a verilen `verify`
 * geri çağrısını kendi `rawBodyParser`'ıyla EZER
 * (@nestjs/platform-express `getBodyParserOptions`) ve ham gövdeyi HER
 * istekte saklar. Yani aşağıdaki "yalnız webhook" süzgeci ölü koddu; her JSON
 * isteği (5 MB'a kadar belge yüklemeleri dahil) bellekte iki kopya tutuyordu.
 */
export const HTTP_BODY_APP_OPTIONS = {
  bodyParser: false,
  rawBody: false,
} as const satisfies NestApplicationOptions;

/**
 * Ham gövde bu istek için saklanmalı mı. Sorgu dizgisi ve sondaki `/`
 * yok sayılır: eski tam eşitlik (`url === "/api/webhooks/resend"`) sorgulu
 * URL'de ham gövdeyi düşürür, geçerli imzalı olay 401 alırdı.
 */
export function shouldKeepRawBody(url: string | undefined): boolean {
  if (!url) return false;
  const q = url.indexOf("?");
  const path = (q === -1 ? url : url.slice(0, q)).replace(/\/+$/, "");
  return path === RESEND_WEBHOOK_PATH;
}

/** JSON ayrıştırıcıyı kurar (urlencoded BİLİNÇLİ yok — bkz. main.ts notu). */
export function configureBodyParser(app: NestExpressApplication): void {
  app.useBodyParser("json", {
    limit: JSON_BODY_LIMIT,
    verify: (
      req: { rawBody?: Buffer; url?: string; originalUrl?: string },
      _res: unknown,
      buf: Buffer,
    ) => {
      if (shouldKeepRawBody(req.originalUrl ?? req.url)) {
        req.rawBody = buf;
      }
    },
  });
}
