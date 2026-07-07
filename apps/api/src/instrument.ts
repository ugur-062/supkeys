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

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    // Performans izleme opsiyonel — varsayılan kapalı (yalnız hata izleme).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // PII varsayılan olarak GÖNDERİLMEZ (gövde/başlık/çerez sızıntısını azalt).
    sendDefaultPii: false,
  });
}

export const sentryEnabled = !!dsn;
