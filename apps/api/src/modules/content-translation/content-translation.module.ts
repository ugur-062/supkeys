import { Global, Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ContentTranslationController } from "./content-translation.controller";
import { ContentTranslationScheduler } from "./content-translation.scheduler";
import { ContentTranslationService } from "./content-translation.service";
import { CategoryTranslationService } from "./category-translation.service";

/**
 * GLOBAL: yazma yolları (ürün onayı, talep yayını, profil kaydı) servisi
 * `@Optional()` enjekte eder — `SeoIndexService` deseniyle aynı; modül
 * içe aktarma zinciri gerekmez, testlerde undefined kalır.
 */
@Global()
@Module({
  imports: [AiModule],
  controllers: [ContentTranslationController],
  providers: [ContentTranslationService, ContentTranslationScheduler, CategoryTranslationService],
  exports: [ContentTranslationService],
})
export class ContentTranslationModule {}
