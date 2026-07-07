import "reflect-metadata";
// Sentry — AppModule'den ÖNCE (auto-instrumentation + env'i kendi yükler).
import "./instrument";
// .env'i NestFactory'den ÖNCE yükle — decorator'larda process.env'e güvenen
// modüller (ThrottlerModule.forRoot vb.) için critical.
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { NestFactory } from "@nestjs/core";
import { BadRequestException, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ValidationError } from "class-validator";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { translateValidatorMessage } from "./common/error-messages";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    /**
     * V2-1 — Resend webhook svix signature verification için raw body gerekir.
     * `rawBody: true` ile Nest, body parser tarafından buffer'ı `request.rawBody`'de
     * saklar. Aşağıda webhook endpoint'i için raw verifier eklenir.
     */
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Security audit O-3 — Production'da placeholder/zayıf JWT_SECRET reddi.
  // `getOrThrow` boş string'i yakalar ama `.env.example`'daki "change_me_..."
  // placeholder'ı truthy olduğu için geçer; yanlışlıkla prod'a deploy edilirse
  // herkesin tahmin edebileceği secret'la JWT imzalanır (token forge riski).
  const jwtSecret = config.getOrThrow<string>("JWT_SECRET");
  const isProd = config.get<string>("NODE_ENV") === "production";
  const JWT_SECRET_PLACEHOLDERS = [
    "change_me_in_production_minimum_32_chars_long",
    "ci_test_jwt_secret_only_for_pipeline_runs_64_chars_minimum_xxxxx",
    "test_jwt_secret",
  ];
  if (isProd) {
    if (
      JWT_SECRET_PLACEHOLDERS.includes(jwtSecret) ||
      jwtSecret.toLowerCase().startsWith("change_me") ||
      jwtSecret.toLowerCase().startsWith("ci_test") ||
      jwtSecret.toLowerCase().startsWith("test_")
    ) {
      throw new Error(
        "🚨 JWT_SECRET production ortamında placeholder/fixture değer olamaz. .env'de güçlü bir secret koy (öneri: openssl rand -hex 32).",
      );
    }
    if (jwtSecret.length < 32) {
      throw new Error(
        "🚨 JWT_SECRET production'da en az 32 karakter olmalı. Mevcut uzunluk: " +
          jwtSecret.length,
      );
    }
  }

  // Security audit Y-3 — Body parser limit 25MB → 5MB (saldırı yüzeyi
  // düşürüldü). Vergi levhası ve doc upload'ları için 5MB makul — TR
  // vergi levhası taramaları 3-4MB'a çıkabiliyor. V2.5'te R2 presigned'a
  // geçince 1MB'a düşürülecek. Auth ve diğer route'larda zaten ufak body.
  app.useBodyParser("json", {
    limit: "5mb",
    /**
     * Sadece `/api/webhooks/resend` için raw body sakla (svix verify gerekli).
     * Diğer endpoint'ler için memory'i tutmuyoruz.
     */
    verify: (
      req: { rawBody?: Buffer; url?: string },
      _res: unknown,
      buf: Buffer,
    ) => {
      const url = req.url ?? "";
      if (url === "/api/webhooks/resend" || url.startsWith("/webhooks/resend")) {
        req.rawBody = buf;
      }
    },
  });
  app.useBodyParser("urlencoded", { limit: "5mb", extended: true });

  // Security audit K-2 — defense-in-depth HTTP security headers.
  // CSP Next/React inline script'lerle çakışmasın diye kapalı (frontend zaten
  // ayrı origin'de); diğer header'lar — X-Frame-Options, X-Content-Type-Options,
  // Referrer-Policy, Strict-Transport-Security (prod'da HTTPS terminator
  // arkasında) — default aktif. crossOriginEmbedderPolicy'i kapatıyoruz çünkü
  // presigned R2 URL'lerini fetch ediyoruz.
  app.use(
    helmet({
      // API saf JSON döner (HTML/script/Swagger sunmaz) → en sıkı CSP güvenli.
      // default-src 'none' + frame-ancestors 'none' (clickjacking koruması).
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      /**
       * Polish-3 — class-validator sonuçlarını TR mesajlarla
       * `{ message, errors: { field: msg } }` shape'ine çevir.
       * Frontend `extractFieldErrors` ile inline gösterir.
       */
      exceptionFactory: (errors: ValidationError[]) => {
        const fieldErrors: Record<string, string> = {};

        const collect = (errs: ValidationError[], prefix = ""): void => {
          for (const err of errs) {
            const path = prefix ? `${prefix}.${err.property}` : err.property;
            if (err.constraints) {
              const values = Object.values(err.constraints);
              const firstMsg = values[0] ?? "Geçersiz değer";
              fieldErrors[path] = translateValidatorMessage(firstMsg);
            }
            if (err.children && err.children.length > 0) {
              collect(err.children, path);
            }
          }
        };
        collect(errors);

        return new BadRequestException({
          statusCode: 400,
          error: "Bad Request",
          message: "Doğrulama hatası",
          errors: fieldErrors,
        });
      },
    }),
  );

  // CORS — virgülle ayrılmış origin listesi (.env CORS_ORIGINS)
  const corsOriginsRaw = config.get<string>(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001",
  );
  const corsOrigins = corsOriginsRaw.split(",").map((o) => o.trim()).filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Graceful shutdown — Nest lifecycle hooks tetiklenir (Prisma bağlantısı
  // kapatılır, in-flight HTTP istekleri tamamlanır).
  app.enableShutdownHooks();

  const bootstrapLogger = new Logger("Bootstrap");
  const shutdown = async (signal: string) => {
    bootstrapLogger.log(`${signal} received — shutting down gracefully`);
    try {
      await app.close();
      bootstrapLogger.log("Application closed cleanly");
      process.exit(0);
    } catch (err) {
      bootstrapLogger.error(
        `Shutdown error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
  // Logging audit Y-1 — NestJS Logger üzerinden yazılıyor (structured log
  // pipeline'ı için tutarlı). console.log paralel akışta kalmasın.
  bootstrapLogger.log(`🚀 Supkeys API running on http://localhost:${port}/api`);
  bootstrapLogger.log(`   CORS origins: ${corsOrigins.join(", ")}`);
}

bootstrap();
