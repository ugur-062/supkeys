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
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { isCorsOriginAllowed } from "./common/cors-origin";
import { checkJwtSecret } from "./common/config/jwt-secret";
import { translateValidatorMessage } from "./common/error-messages";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Pino logger devralınana kadar bootstrap loglarını tamponla.
    bufferLogs: true,
    bodyParser: false,
    /**
     * V2-1 — Resend webhook svix signature verification için raw body gerekir.
     * `rawBody: true` ile Nest, body parser tarafından buffer'ı `request.rawBody`'de
     * saklar. Aşağıda webhook endpoint'i için raw verifier eklenir.
     */
    rawBody: true,
  });
  // Structured logger (Pino) — tüm Nest loglarını JSON + redaction ile üstlenir.
  app.useLogger(app.get(PinoLogger));
  // Proxy arkasında (Render/Vercel/Cloudflare) gerçek client IP'si
  // X-Forwarded-For'dan okunsun — aksi halde rate limiter TÜM trafiği proxy'nin
  // tek IP'si altında toplar ve herkes ortak limite takılıp 429 alır.
  app.set("trust proxy", 1);
  const config = app.get(ConfigService);

  // Security audit O-3 / #6 — placeholder/zayıf JWT_SECRET reddi (fail-closed).
  // `getOrThrow` boş string'i yakalar ama `.env.example`'daki "change_me_..."
  // placeholder'ı truthy olduğu için geçer; yanlışlıkla prod'a deploy edilirse
  // herkesin tahmin edebileceği secret'la JWT imzalanır (token forge riski).
  // Kontrol allowlist mantığında: placeholder yalnız açıkça development/test'te
  // kabul edilir — NODE_ENV unset/"staging"/tanınmayan da reddeder.
  // (Saf mantık + config-matrix testleri: common/config/jwt-secret.ts.)
  const jwtSecret = config.getOrThrow<string>("JWT_SECRET");
  const nodeEnv = config.get<string>("NODE_ENV");
  const jwtRejection = checkJwtSecret(nodeEnv, jwtSecret);
  if (jwtRejection === "placeholder") {
    throw new Error(
      "🚨 JWT_SECRET placeholder/fixture değer olamaz (yalnız development/test'te izinli). .env'de güçlü bir secret koy (öneri: openssl rand -hex 32).",
    );
  }
  if (jwtRejection === "too_short") {
    throw new Error(
      "🚨 JWT_SECRET en az 32 karakter olmalı. Mevcut uzunluk: " +
        jwtSecret.length,
    );
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
  // NOT: urlencoded body parser KALDIRILDI (güvenlik) — hiçbir endpoint form/
  // urlencoded gövde beklemiyordu (zero consumers, grep-verified); JSON-only API.
  // Parser'ı tutmak, form-urlencoded'ın *simple request* olması nedeniyle
  // preflight'sız <form method=POST> CSRF yüzeyini açık tutuyordu.

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
  // GÜVENLİK: `*.vercel.app` jokeri VARSAYILAN KAPALI (isCorsOriginAllowed). Yalnız
  // CORS_ALLOW_VERCEL=true (preview/demo) iken açılır — prod'da her vercel.app
  // origin'ine credentials'lı erişim vermez (CSRF/veri sızıntısı riski).
  const allowVercel = config.get<string>("CORS_ALLOW_VERCEL") === "true";
  app.enableCors({
    origin: (origin, cb) =>
      cb(null, isCorsOriginAllowed(origin, { corsOrigins, allowVercel })),
    credentials: true,
    // Correlation-id: api ve app AYRI origin'de → tarayıcı istemci response
    // header'ını ancak expose edilirse okuyabilir (destek ekibine iletmek için).
    exposedHeaders: ["x-request-id"],
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

  // PORT: Railway/Heroku gibi platformlar dinamik atar → önce ona bak, yoksa
  // API_PORT (Coolify/dev), yoksa 4000. 0.0.0.0: konteynerde dış arayüzden erişim.
  const port = config.get<number>("PORT") ?? config.get<number>("API_PORT", 4000);
  await app.listen(port, "0.0.0.0");
  // Logging audit Y-1 — NestJS Logger üzerinden yazılıyor (structured log
  // pipeline'ı için tutarlı). console.log paralel akışta kalmasın.
  bootstrapLogger.log(`🚀 Rothern API running on http://localhost:${port}/api`);
  bootstrapLogger.log(`   CORS origins: ${corsOrigins.join(", ")}`);
}

bootstrap();
