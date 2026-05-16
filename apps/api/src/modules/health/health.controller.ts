import { Controller, Get, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EMAIL_QUEUE_NAME } from "../email/dto/email-job.dto";
import { StorageService } from "../storage/storage.service";

interface HealthCheckResult {
  status: "ok" | "degraded";
  service: "supkeys-api";
  timestamp: string;
  checks: {
    database: "up" | "down";
    redis: "up" | "down" | "unknown";
    queue: {
      waiting: number | null;
      failed: number | null;
      // failed > 50 → degraded sinyali, ops alert tetiklemeli
      warning: boolean;
    };
  };
}

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(EMAIL_QUEUE_NAME) private readonly emailQueue: Queue,
  ) {}

  @Get()
  async check(): Promise<HealthCheckResult> {
    // Logging audit O-2 — boş catch yutması yerine err logla. Response yine
    // "down" döner; ops debug için log gerekli.
    let dbStatus: "up" | "down" = "down";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = "up";
    } catch (err) {
      this.logger.error(
        `Health DB ping failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Logging audit O-1 — Redis ping + BullMQ queue waiting/failed.
    // Redis down olduğunda BullMQ Worker job alamaz → e-posta gönderilmez.
    // Health endpoint bu durumu yansıtmalı.
    let redisStatus: "up" | "down" | "unknown" = "unknown";
    let queueWaiting: number | null = null;
    let queueFailed: number | null = null;
    try {
      const client = await this.emailQueue.client;
      const pong = await client.ping();
      redisStatus = pong === "PONG" ? "up" : "down";
      queueWaiting = await this.emailQueue.getWaitingCount();
      queueFailed = await this.emailQueue.getFailedCount();
    } catch (err) {
      redisStatus = "down";
      this.logger.error(
        `Health Redis/queue ping failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const queueWarning = (queueFailed ?? 0) > 50;
    const isDegraded =
      dbStatus === "down" || redisStatus === "down" || queueWarning;

    return {
      status: isDegraded ? "degraded" : "ok",
      service: "supkeys-api",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
        queue: {
          waiting: queueWaiting,
          failed: queueFailed,
          warning: queueWarning,
        },
      },
    };
  }

  /**
   * V2-2 — R2 bucket CORS state debug endpoint.
   * Browser upload başarısız olursa "AllowedOrigins" listesinin doğru olup
   * olmadığını buradan görebilirsin.
   */
  @Get("storage")
  async storageHealth() {
    const cors = await this.storage.getBucketCorsConfig();
    return {
      bucket: this.storage.getBucketName(),
      envPrefix: this.storage.getEnvPrefix(),
      cors,
    };
  }
}
