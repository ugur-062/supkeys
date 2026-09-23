import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../common/cron/cron-registry.service";
import { ContentTranslationService } from "./content-translation.service";

/**
 * Çeviri süpürücüsü — 5 dakikada bir bekleyen/başarısız (≤3 deneme)
 * kayıtları çevirir. Yazma yolu zaten `kick` ile anında çeviriyor; bu iş
 * süreç yeniden başlarken kaybolan `setImmediate`leri ve geçici sağlayıcı
 * hatalarını toplar. Çok örnekli koşumda advisory lock (trackCronRun).
 */
@Injectable()
export class ContentTranslationScheduler {
  private readonly logger = new Logger(ContentTranslationScheduler.name);

  constructor(
    private readonly translations: ContentTranslationService,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  @Cron("*/5 * * * *")
  async sweep(): Promise<void> {
    return trackCronRun(this.cronRegistry, "contentTranslation.sweep", async () => {
      const r = await this.translations.processPending(25);
      if (r.processed > 0) {
        this.logger.log(`İçerik çevirisi süpürüldü: ${r.done} tamam, ${r.failed} hata / ${r.processed}`);
      }
    });
  }
}
