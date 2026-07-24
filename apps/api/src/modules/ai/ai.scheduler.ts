import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AI_EXTRACT_KEY_PREFIX } from "./tender-extract/ai-extract-keys";

/** RESERVED bir kayıt bu süreden eskiyse süreç ölmüş demektir (settle çalışmadı). */
const STALE_RESERVATION_MS = 10 * 60 * 1000;

/**
 * AI-1 — geçici belge ömrü: 24 saat ("yeniden dene" + refine penceresi),
 * sonrası KVKK/depolama gereği otomatik silinir.
 */
const EXTRACT_FILE_TTL_MS = 24 * 60 * 60 * 1000;

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
    @Optional() private readonly storage?: StorageService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "ai.reapStaleReservations",
      "Askıda kalan AI rezervasyonlarını FAILED(timeout) yap",
      "5 dakikada bir",
    );
    this.cronRegistry?.register(
      "ai.cleanupExtractFiles",
      "24 saatten eski geçici AI belge yüklemelerini sil (KVKK/depolama)",
      "günlük 04:00",
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reapStaleReservations(): Promise<void> {
    return trackCronRun(this.cronRegistry, "ai.reapStaleReservations", () =>
      this.doReap(),
    );
  }

  /** AI-1 — ai-extract/ altındaki 24h+ geçici belgeleri sil (bkz. plan b). */
  @Cron("0 4 * * *", { timeZone: "Europe/Istanbul" })
  async cleanupExtractFiles(): Promise<void> {
    return trackCronRun(this.cronRegistry, "ai.cleanupExtractFiles", () =>
      this.doCleanupExtractFiles(),
    );
  }

  private async doCleanupExtractFiles(): Promise<void> {
    if (!this.storage) return; // testlerde storage yok — no-op
    const cutoff = Date.now() - EXTRACT_FILE_TTL_MS;
    const objects = await this.storage.listObjects(
      "private",
      AI_EXTRACT_KEY_PREFIX,
    );
    let deleted = 0;
    for (const o of objects) {
      if (o.lastModified && o.lastModified.getTime() < cutoff) {
        await this.storage
          .deleteObject("private", o.key)
          .then(() => deleted++)
          .catch(() => undefined); // best-effort; kalan sonraki turda silinir
      }
    }
    if (deleted > 0) {
      this.logger.log(`${deleted} geçici AI belge dosyası silindi (24h TTL)`);
    }
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
