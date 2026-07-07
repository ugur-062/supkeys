import { Controller, Get, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";

interface HealthCheckResult {
  status: "ok" | "degraded";
  service: "rothern-api";
  timestamp: string;
  checks: {
    database: "up" | "down";
    /** TCMB kuru tazeliği — bayat kur taban kıyası/TRY karşılığını bozar. */
    exchangeRates: { latestRateDate: string | null; stale: boolean } | null;
  };
}

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly exchangeRates: ExchangeRateService,
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
    // Kur tazeliği bilgilendirici; DB down iken ayrıca sorgulanmaz.
    let rates: HealthCheckResult["checks"]["exchangeRates"] = null;
    if (dbStatus === "up") {
      rates = await this.exchangeRates.freshness().catch(() => null);
    }

    return {
      // Bayat kur kesinti değildir ama izleme fark etsin → degraded.
      status: dbStatus === "down" || rates?.stale ? "degraded" : "ok",
      service: "rothern-api",
      timestamp: new Date().toISOString(),
      checks: { database: dbStatus, exchangeRates: rates },
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
