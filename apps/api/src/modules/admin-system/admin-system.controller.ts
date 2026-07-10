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
  IsPositive,
  MaxLength,
} from "class-validator";
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

const MANUAL_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY"];

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
  @Get("suppressions")
  async listSuppressions() {
    const rows = await this.prisma.emailLog.findMany({
      where: {
        OR: [
          { status: "COMPLAINED" },
          { status: "BOUNCED", bounceType: "hard" },
        ],
      },
      select: {
        toEmail: true,
        status: true,
        bounceReason: true,
        queuedAt: true,
      },
      orderBy: { queuedAt: "desc" },
      take: 500,
    });
    const markers = await this.prisma.emailLog.findMany({
      where: { template: "suppression_clear" },
      select: { toEmail: true, queuedAt: true },
      orderBy: { queuedAt: "desc" },
    });
    const lastClear = new Map<string, Date>();
    for (const m of markers) {
      if (!lastClear.has(m.toEmail)) lastClear.set(m.toEmail, m.queuedAt);
    }
    // Adres başına en yeni tetikleyici; marker'dan eskiyse aklanmış say.
    const byEmail = new Map<
      string,
      { email: string; status: string; reason: string | null; at: Date }
    >();
    for (const r of rows) {
      const cleared = lastClear.get(r.toEmail);
      if (cleared && r.queuedAt <= cleared) continue;
      if (!byEmail.has(r.toEmail)) {
        byEmail.set(r.toEmail, {
          email: r.toEmail,
          status: r.status,
          reason: r.bounceReason,
          at: r.queuedAt,
        });
      }
    }
    return [...byEmail.values()];
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
}
