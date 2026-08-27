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
import { assertProdWebUrl } from "./common/config/web-url";
import { assertProdConfigSanity } from "./common/config/prod-config-sanity";
import { checkAiKey } from "./common/config/ai-config";
import { reportToSentry } from "./instrument";
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
  // Proxy arkasında gerçek client IP'si: `trust proxy 1` yalnız Render LB'yi
  // güvenir; prod'da Render'ın ÖNÜNDE Cloudflare de var (3 hop) → req.ip CF
  // egress'i olur. Bu yüzden throttle/audit IP'si `resolveClientIp` üzerinden
  // (TRUST_CF_CONNECTING_IP=true iken cf-connecting-ip) okunur — bkz.
  // common/http/client-ip.ts (denetim 2026-08-23 Parça 1 #7).
  app.set("trust proxy", 1);
  // Süreç-seviyesi güvenlik ağı (denetim 2026-08-23 #1): yakalanmamış promise
  // reddi Node 22'de süreci DÜŞÜRÜR (Sentry DSN yoksa hiçbir handler yoktu).
  // Logla + Sentry'e bildir, süreç ayakta kalsın; kök neden ayrıca düzeltilir.
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    new Logger("Process").error(`unhandledRejection: ${msg}`);
    reportToSentry("unhandledRejection", "error", {
      extra: { reason: msg.slice(0, 2000) },
    });
  });
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

  // WEB_URL fail-open → fail-closed: prod'da WEB_URL unset/localhost ise BOOT
  // ETME. Aksi halde tüm e-posta linkleri (reset/davet/doğrulama) sessizce
  // localhost'a düşüp ölü link gönderirdi (bkz. common/config/web-url.ts).
  assertProdWebUrl(config);

  // Cookie/CSRF prod config sağlığı (fail-closed): COOKIE_SAMESITE=lax +
  // COOKIE_DOMAIN=.rothern.com zorunlu. Eksikse cookie'ler host-only kalır →
  // frontend rk_csrf'i okuyamaz → mutasyonlar 403. Sessiz runtime 403 yerine
  // boot'ta yakala (bkz. common/config/prod-config-sanity.ts).
  assertProdConfigSanity(config);

  // Faz AI-0 — AI anahtar sağlığı: placeholder/bozuk anahtar prod'da BOOT
  // ETMEZ (bozuk anahtarla "AI açık" sanılıp runtime'da her çağrının 502
  // dönmesi sessiz kırıktır). Anahtar YOKSA boot devam eder ama AI kapalıdır
  // (fail-closed) ve prod'da GÜRÜLTÜLÜ: warn log + Sentry uyarısı — sessiz
  // no-op değil (bkz. common/config/ai-config.ts).
  const aiKeyStatus = checkAiKey(config.get<string>("GEMINI_API_KEY"));
  // Vertex modu (service account) varsa GEMINI_API_KEY şart değil — AI Vertex'ten çalışır.
  const hasVertex = !!config.get<string>("GEMINI_SERVICE_ACCOUNT_JSON");
  if (nodeEnv === "production" && !hasVertex) {
    if (aiKeyStatus === "placeholder") {
      throw new Error(
        "🚨 GEMINI_API_KEY placeholder/bozuk görünüyor — ya geçerli anahtar ver ya da tamamen boş bırak (AI kapalı).",
      );
    }
    if (aiKeyStatus === "missing") {
      const bootLogger = new Logger("Bootstrap");
      bootLogger.warn(
        "GEMINI_API_KEY yok — AI özellikleri KAPALI (503). Bilinçli değilse anahtarı ekleyin.",
      );
      reportToSentry("AI kapalı: GEMINI_API_KEY eksik (prod)", "warning", {
        tags: { ai: "disabled-missing-key" },
      });
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

/**
 * Denetim 2026-08-27 Parça 11: `bootstrap()` REDDİ artık ölümcül.
 *
 * Parça 1'de eklenen `process.on("unhandledRejection")` ağı (yukarıda), Node'un
 * varsayılan çökme davranışını devre dışı bırakıyor. Ağ `bootstrap()`'ın İÇİNDE
 * ve config guard'larından ÖNCE kurulduğu için, `checkJwtSecret` /
 * `assertProdWebUrl` / `assertProdConfigSanity` / R2 `HeadBucket` /
 * `EmailService.getOrThrow` gibi FAIL-CLOSED kapıların throw'ları yutuluyor ve
 * süreç BAŞARI koduyla (exit 0) bitiyordu — yani "yanlış yapılandırmada deploy
 * patlasın" garantisi sessizce kırılmıştı. Bu `.catch` onu geri veriyor.
 */
bootstrap().catch((err: unknown) => {
  new Logger("Bootstrap").error(
    `Uygulama başlatılamadı: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  reportToSentry("bootstrap-failed", "error", {
    extra: { reason: err instanceof Error ? err.message : String(err) },
  });
  process.exit(1);
});
