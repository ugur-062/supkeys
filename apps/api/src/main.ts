import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { BadRequestException, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ValidationError } from "class-validator";
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

  // Vergi levhası + tender attachment base64 payload'ları için yüksek limit
  // (MinIO V2'ye geçince düşürülür). Default 100kb yetersiz.
  app.useBodyParser("json", {
    limit: "25mb",
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
  app.useBodyParser("urlencoded", { limit: "25mb", extended: true });

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

  // Graceful shutdown — Nest lifecycle hooks tetiklenir (BullMQ Worker
  // active job'ları bitirir, Prisma bağlantısı kapatılır).
  app.enableShutdownHooks();

  const shutdownLogger = new Logger("Bootstrap");
  const shutdown = async (signal: string) => {
    shutdownLogger.log(`${signal} received — shutting down gracefully`);
    try {
      await app.close();
      shutdownLogger.log("Application closed cleanly");
      process.exit(0);
    } catch (err) {
      shutdownLogger.error(
        `Shutdown error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
  console.log(`🚀 Supkeys API running on http://localhost:${port}/api`);
  console.log(`   CORS origins: ${corsOrigins.join(", ")}`);
}

bootstrap();
