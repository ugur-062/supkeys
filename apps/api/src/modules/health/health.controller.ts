import { Controller, Get, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

interface HealthCheckResult {
  status: "ok" | "degraded";
  service: "supkeys-api";
  timestamp: string;
  checks: {
    database: "up" | "down";
  };
}

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async check(): Promise<HealthCheckResult> {
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

    return {
      status: dbStatus === "down" ? "degraded" : "ok",
      service: "supkeys-api",
      timestamp: new Date().toISOString(),
      checks: { database: dbStatus },
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
