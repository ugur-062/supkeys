import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async check() {
    let dbStatus = "down";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = "up";
    } catch {
      dbStatus = "down";
    }

    return {
      status: "ok",
      service: "supkeys-api",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
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
