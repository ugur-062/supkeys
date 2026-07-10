import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { CronRegistryService } from "../../common/cron/cron-registry.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";

/**
 * Sistem Sağlığı — admin paneli "platform şu an sağlıklı mı?" ekranının
 * arkası: DB ping, TCMB kur tazeliği + güncel kurlar, cron çalışma kayıtları.
 * R2 CORS debug ayrı uçta kalır (GET health/storage, admin-guard'lı).
 */
@Controller("admin/system")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminSystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRateService,
    private readonly cronRegistry: CronRegistryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async status() {
    let database: "up" | "down" = "down";
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DB ping timeout (5s)")), 5000),
        ),
      ]);
      database = "up";
    } catch {
      // down kalır
    }
    const [freshness, rates, latestRateDate] =
      database === "up"
        ? await Promise.all([
            this.exchangeRates.freshness().catch(() => null),
            this.exchangeRates.getCurrentRates().catch(() => null),
            this.exchangeRates.latestRateDate().catch(() => null),
          ])
        : [null, null, null];
    return {
      database,
      bootAt: this.cronRegistry.bootAt,
      exchangeRates: {
        latestRateDate,
        stale: freshness?.stale ?? true,
        rates,
      },
      crons: this.cronRegistry.snapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * "Kurları şimdi yenile" — TCMB arızasında/cron kaçırmasında admin panelden
   * elle tetiklenir (para yolu bayat kuru zaten reddediyor; bu, kilidi açar).
   */
  @Post("refresh-rates")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  @HttpCode(HttpStatus.OK)
  async refreshRates(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const result = await this.exchangeRates.refreshFromTcmb();
    await this.audit.log({
      action: "admin.system.rates_refreshed",
      actorType: "admin",
      actorId: admin.id,
      entityType: "system",
      entityId: "exchange-rates",
      metadata: { success: result.success, date: result.date ?? null },
    });
    return result;
  }
}
