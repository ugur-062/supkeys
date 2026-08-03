import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { CronRegistryService } from "../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AllowAnyAdminRole } from "../admin-auth/decorators/allow-any-admin-role.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { ExchangeRateService } from "../currency/services/exchange-rate.service";
import { EmailSuppressionService } from "../email/email-suppression.service";

const MANUAL_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
];

class ManualRateDto {
  @IsIn(MANUAL_CURRENCIES)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  rate!: number;
}

class ClearSuppressionDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

/** Zaman Tasarrufu parametreleri (dk) — hepsi opsiyonel; verilen alan yazılır. */
class TimeSavingsConfigDto {
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  rfqMailPrepMin?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  followupMin?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  bidToExcelMin?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(9)
  bidItemFactor?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  comparisonTableMin?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  revisionRoundMin?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  approvalLoopMin?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(999)
  poPrepMin?: number;
  /** null gönderilirse TL gösterimi kapanır. */
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  hourlyLaborCost?: number | null;
}

/**
 * Sistem Sağlığı — admin paneli "platform şu an sağlıklı mı?" ekranının
 * arkası: DB ping, TCMB kur tazeliği + güncel kurlar, cron çalışma kayıtları.
 * R2 CORS debug ayrı uçta kalır (GET health/storage, admin-guard'lı).
 */
@Controller("admin/system")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminSystemController {
  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly exchangeRates: ExchangeRateService,
    private readonly cronRegistry: CronRegistryService,
    private readonly audit: AuditService,
    private readonly suppression: EmailSuppressionService,
  ) {}

  @Get()
  @AllowAnyAdminRole() // altyapı sağlık paneli — PII yok, tüm rollere açık
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

  /**
   * Manuel kur girişi (Faz 8) — TCMB uzun süre erişilemezse para yolu
   * kilitlenmesin (getFreshRate bayat kuru reddediyor). Bugünün kuru olarak
   * MANUAL kaynakla upsert edilir; SONRAKİ TCMB fetch'i üzerine yazar.
   * Para-yoluna dokunur → yalnız SUPER_ADMIN + sıkı audit.
   */
  @Post("rates/manual")
  @RequireAdminRole("SUPER_ADMIN")
  @HttpCode(HttpStatus.OK)
  async setManualRate(
    @Body() dto: ManualRateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    // Fat-finger koruması: mevcut kurdan 10x sapma reddedilir.
    const current = await this.exchangeRates
      .getCurrentRate(dto.currency as never)
      .catch(() => null);
    if (current && (dto.rate > current * 10 || dto.rate < current / 10)) {
      throw new BadRequestException(
        `Girilen kur mevcut değerden (${current}) aşırı sapıyor — kontrol edin`,
      );
    }
    const rateDate = new Date();
    rateDate.setHours(0, 0, 0, 0);
    await this.prisma.exchangeRate.upsert({
      where: {
        currency_rateDate: {
          currency: dto.currency as never,
          rateDate,
        },
      },
      create: {
        currency: dto.currency as never,
        rate: dto.rate,
        rateDate,
        source: "MANUAL",
      },
      update: { rate: dto.rate, source: "MANUAL", fetchedAt: new Date() },
    });
    await this.audit.log({
      action: "admin.system.manual_rate_set",
      actorType: "admin",
      actorId: admin.id,
      entityType: "system",
      entityId: `rate:${dto.currency}`,
      metadata: { currency: dto.currency, rate: dto.rate },
    });
    return { ok: true, currency: dto.currency, rate: dto.rate };
  }

  /**
   * E-posta itibar (Faz 8) — suppress edilmiş adresler: hard-bounce/complaint
   * almış VE sonrasında aklanmamış olanlar.
   */
  // Bastırılmış adres listesi e-posta PII'ı içerir → gated; clear zaten
  // SUPER_ADMIN (asimetri kapatıldı).
  @Get("suppressions")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  async listSuppressions() {
    // Türetme tek-kaynak EmailSuppressionService'te (firma detayı da aynısını
    // kullanır — clear-marker sıra mantığı iki yerde kalmasın).
    return this.suppression.listSuppressed(500);
  }

  /** Adresi akla — append-only marker (tarih yeniden yazılmaz). */
  @Post("suppressions/clear")
  @RequireAdminRole("SUPER_ADMIN")
  @HttpCode(HttpStatus.OK)
  async clearSuppression(
    @Body() dto: ClearSuppressionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const email = dto.email.trim().toLowerCase();
    await this.prisma.emailLog.create({
      data: {
        template: "suppression_clear",
        toEmail: email,
        subject: "suppression clear (admin)",
        provider: "internal",
        status: "SENT",
        sentAt: new Date(),
        contextType: "suppression_clear",
        contextId: admin.id,
      },
    });
    await this.audit.log({
      action: "admin.system.suppression_cleared",
      actorType: "admin",
      actorId: admin.id,
      entityType: "email",
      entityId: email,
    });
    return { ok: true };
  }

  /** Zaman Tasarrufu parametreleri — global satır (yoksa şema default'ları). */
  @Get("time-savings-config")
  @AllowAnyAdminRole()
  async getTimeSavingsConfig(): Promise<{
    config: Record<string, number | string | null> | null;
  }> {
    const row = await this.prisma.timeSavingsConfig.findFirst({
      where: { companyId: null },
    });
    return { config: row ? serializeTsConfig(row) : null };
  }

  @Post("time-savings-config")
  @RequireAdminRole("SUPER_ADMIN")
  @HttpCode(HttpStatus.OK)
  async updateTimeSavingsConfig(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: TimeSavingsConfigDto,
  ): Promise<{ config: Record<string, number | string | null> }> {
    const data = { ...dto, updatedById: admin.id };
    const existing = await this.prisma.timeSavingsConfig.findFirst({
      where: { companyId: null },
      select: { id: true },
    });
    const row = existing
      ? await this.prisma.timeSavingsConfig.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.timeSavingsConfig.create({
          data: { ...data, companyId: null },
        });
    await this.audit.log({
      action: "admin.system.time_savings_config_updated",
      actorType: "admin",
      actorId: admin.id,
      entityType: "system",
      entityId: row.id,
      metadata: dto as Record<string, unknown>,
    });
    return { config: serializeTsConfig(row) };
  }
}

/** Prisma Decimal'leri number'a indir (TS2742 + JSON tutarlılığı). */
function serializeTsConfig(row: {
  id: string;
  rfqMailPrepMin: unknown;
  followupMin: unknown;
  bidToExcelMin: unknown;
  bidItemFactor: unknown;
  comparisonTableMin: unknown;
  revisionRoundMin: unknown;
  approvalLoopMin: unknown;
  poPrepMin: unknown;
  hourlyLaborCost: unknown | null;
  updatedAt: Date;
}): Record<string, number | string | null> {
  return {
    id: row.id,
    rfqMailPrepMin: Number(row.rfqMailPrepMin),
    followupMin: Number(row.followupMin),
    bidToExcelMin: Number(row.bidToExcelMin),
    bidItemFactor: Number(row.bidItemFactor),
    comparisonTableMin: Number(row.comparisonTableMin),
    revisionRoundMin: Number(row.revisionRoundMin),
    approvalLoopMin: Number(row.approvalLoopMin),
    poPrepMin: Number(row.poPrepMin),
    hourlyLaborCost:
      row.hourlyLaborCost != null ? Number(row.hourlyLaborCost) : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
