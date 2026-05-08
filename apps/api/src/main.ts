import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);

  // Vergi levhası + tender attachment base64 payload'ları için yüksek limit
  // (MinIO V2'ye geçince düşürülür). Default 100kb yetersiz.
  app.useBodyParser("json", { limit: "25mb" });
  app.useBodyParser("urlencoded", { limit: "25mb", extended: true });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
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
