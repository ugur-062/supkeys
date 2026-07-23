import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../common/prisma/prisma.service";

/** RESERVED bir kayıt bu süreden eskiyse süreç ölmüş demektir (settle çalışmadı). */
const STALE_RESERVATION_MS = 10 * 60 * 1000;

/**
 * Faz AI-0 — rezervasyon reaper'ı: settle/fail hiç çalışmadıysa (process crash,
 * elektrik kesintisi) RESERVED satırlar sonsuza dek bütçede asılı kalırdı.
 * Timeout kuralıyla kapatılır: tahmin tutarı KALIR (fail-closed — kısmi token
 * harcanmış olabilir; bütçeyi korumak yanlış yönde hata yapmaktan iyidir).
 */
@Injectable()
export class AiScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiScheduler.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'ler.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "ai.reapStaleReservations",
      "Askıda kalan AI rezervasyonlarını FAILED(timeout) yap",
      "5 dakikada bir",
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reapStaleReservations(): Promise<void> {
    return trackCronRun(this.cronRegistry, "ai.reapStaleReservations", () =>
      this.doReap(),
    );
  }

  private async doReap(): Promise<void> {
    const { count } = await this.prisma.aiUsage.updateMany({
      where: {
        status: "RESERVED",
        createdAt: { lt: new Date(Date.now() - STALE_RESERVATION_MS) },
      },
      // costUsd'e DOKUNULMAZ → tahmin tutarı bütçede kalır (fail-closed).
      data: { status: "FAILED", errorCode: "reaper_timeout", settledAt: new Date() },
    });
    if (count > 0) {
      this.logger.warn(`${count} askıda AI rezervasyonu timeout ile kapatıldı`);
    }
  }
}
