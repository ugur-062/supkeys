/**
 * Sentry başlatma — main.ts'te reflect-metadata'dan HEMEN SONRA import edilir
 * (auto-instrumentation için diğer modüllerden önce). SENTRY_DSN yoksa NO-OP:
 * dev/test/self-host DSN'siz sorunsuz çalışır, hiçbir şey gönderilmez.
 */
import * as path from "node:path";
import * as dotenv from "dotenv";

// Env'i kendi yükle (main.ts'ten önce çalışabilir) — idempotent.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import * as Sentry from "@sentry/nestjs";
import { maskQueryString, maskSensitiveQuery, maskSensitiveUrl } from "./common/logging/mask-sensitive-url";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    // Performans izleme opsiyonel — varsayılan kapalı (yalnız hata izleme).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // PII varsayılan olarak GÖNDERİLMEZ. DİKKAT: `sendDefaultPii:false` tek
    // başına istek verisini KAPATMAZ — @sentry/nestjs varsayılan
    // requestDataIntegration cookies/headers/body'yi olaya ekler (denetim
    // 2026-08-23 #5: beklenmedik 500'de rk_company JWT + parola gövdesi Sentry'e
    // gidiyordu). Entegrasyonu aynı adla ezerek kapatıyoruz + beforeSend ağı.
    sendDefaultPii: false,
    integrations: [
      Sentry.requestDataIntegration({
        include: { cookies: false, data: false, headers: false, ip: false, user: false, query_string: true, url: true },
      }),
    ],
    beforeSend: scrubRequestPii,
    beforeSendTransaction: scrubRequestPii,
  });
}

export const sentryEnabled = !!dsn;

/**
 * Olaydaki istek verisinden cookie/header/gövde'yi düşürür (kemer-pantolon
 * askısı); adres ve sorgudaki davet/çıkış/sıfırlama jetonlarını maskeler
 * (yayın denetimi 2026-09-28 Bölüm 5: `query_string: true` ile `?ref=`/`?t=`
 * 5xx olaylarında Sentry'e düz metin gidiyordu — web tarafı zaten maskeliydi).
 */
export function scrubRequestPii<T extends { request?: object }>(event: T): T {
  const r = event.request as Record<string, unknown> | undefined;
  if (r) {
    delete r.cookies;
    delete r.headers;
    delete r.data;
    if (typeof r.url === "string") r.url = maskSensitiveUrl(r.url);
    if (typeof r.query_string === "string") r.query_string = maskQueryString(r.query_string);
    else if (Array.isArray(r.query_string)) {
      r.query_string = (r.query_string as unknown[]).map((pair) =>
        Array.isArray(pair) && typeof pair[0] === "string" && maskSensitiveQuery({ [pair[0]]: pair[1] })[pair[0]] === "[redacted]"
          ? [pair[0], "[redacted]"]
          : pair,
      );
    } else if (r.query_string && typeof r.query_string === "object") {
      r.query_string = maskSensitiveQuery(r.query_string);
    }
  }
  return event;
}

/**
 * Fırlatılmayan kritik olayları (kritik-audit kaybı, webhook imza hatası) Sentry'e
 * bildirir — bunlar `logger.error/warn` olduğu için SentryGlobalFilter yakalamaz.
 *
 * Güvenlik/emniyet garantileri:
 * - DSN yoksa (`sentryEnabled=false`) SESSİZ no-op — dev/test'te hiçbir şey gönderilmez.
 * - Kendi try/catch'i var → çağıran akışı (audit `log()`, webhook guard) ASLA bozmaz.
 * - PII göndermek çağıranın sorumluluğu: `sendDefaultPii:false` (init'te) korunur;
 *   buraya yalnız kimlik/eylem context'i (id/action) geçir, e-posta/gövde/sır GEÇME.
 */
export function reportToSentry(
  message: string,
  level: "error" | "warning",
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  if (!sentryEnabled) return;
  try {
    Sentry.captureMessage(message, { level, ...context });
  } catch {
    // Gözlemlenebilirlik ana iş akışını bozamaz — yut.
  }
}
