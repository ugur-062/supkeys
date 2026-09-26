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

  /** Açılıştan sonraki ilk süpürmede arama metni mevcut çevirilerden kurulur (model çağrısı yok). */
  private searchTextsRebuilt = false;

  @Cron("*/5 * * * *")
  async sweep(): Promise<void> {
    return trackCronRun(this.cronRegistry, "contentTranslation.sweep", async () => {
      if (!this.searchTextsRebuilt) {
        this.searchTextsRebuilt = true;
        const r = await this.translations.rebuildAllSearchTexts();
        if (r.entities > 0) this.logger.log(`Search text rebuilt for ${r.entities} entities`);
      }
      if (this.translations.enabled) {
        const c = await this.translations.ensureCoverage(50);
        const n = c.products + c.listings + c.companies;
        if (n > 0 || c.retried > 0) {
          this.logger.log(`Translation coverage: queued ${c.products} products, ${c.listings} listings, ${c.companies} companies; retried ${c.retried}`);
        }
      }
      const r = await this.translations.processPending(25);
      if (r.processed > 0) {
        this.logger.log(`Content translation sweep: ${r.done} done, ${r.failed} failed / ${r.processed} processed`);
      }
    });
  }
}
