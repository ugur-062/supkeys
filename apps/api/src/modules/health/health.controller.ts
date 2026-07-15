import { Controller, Get, Logger, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";
import { AllowAnyAdminRole } from "../admin-auth/decorators/allow-any-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";

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

// Health uçları rate-limit DIŞI — platform (Render/uptime) sık sık yoklar;
// throttle'a takılıp 429 dönerse sağlıksız sayılıp gereksiz yeniden başlatılır.
// HER İKİ isimli throttler'ı da atla: argümansız @SkipThrottle() yalnızca
// "default"u atlar, "auth" (10/dk, global) takılı kalır → Render yoklaması
// dakikada 10'u aşınca 429 alır. Bu yüzden ikisini de açıkça kapatıyoruz.
@SkipThrottle({ default: true, auth: true })
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
      // Timeout: DB bağlantısı asılırsa health isteği süresiz beklemesin
      // (yalnız global throttler koruması vardı).
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DB ping timeout (5s)")), 5000),
        ),
      ]);
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
   * olmadığını buradan görebilirsin. YALNIZ ADMIN — bucket adı/envPrefix/CORS
   * iç altyapı bilgisidir, kimliksiz kullanıcıya sızmamalı; ayrıca her çağrı
   * R2'ya komut atar.
   */
  @Get("storage")
  // RolesGuard zincire dahil (fail-closed tuzağı kapalı): buraya konacak bir
  // @RequireAdminRole artık sessizce no-op olmaz. Infra debug → her admin.
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AllowAnyAdminRole()
  async storageHealth() {
    const [publicCors, privateCors] = await Promise.all([
      this.storage.getBucketCorsConfig("public"),
      this.storage.getBucketCorsConfig("private"),
    ]);
    return {
      buckets: this.storage.getBucketNames(),
      envPrefix: this.storage.getEnvPrefix(),
      cors: { public: publicCors, private: privateCors },
    };
  }
}
