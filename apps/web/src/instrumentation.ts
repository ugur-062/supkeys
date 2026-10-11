/**
 * Sunucu ve edge çalışma zamanı için Sentry (DSN yoksa NO-OP).
 *
 * KONUM ÖNEMLİ (derin denetim Y-12): uygulama `src/app` düzeninde olduğu için
 * Next bu kancayı YALNIZ `src/instrumentation.ts` olarak arar (appDir'in bir
 * üstü). Uygulama kökünde dururken `register()` hiç çağrılmıyor, Sentry hiç
 * başlamıyordu. Taşımayın — `src/instrumentation.test.ts` konumu korur.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
    integrations: [],
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
