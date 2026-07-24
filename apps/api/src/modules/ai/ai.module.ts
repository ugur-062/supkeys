import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { checkAiKey } from "../../common/config/ai-config";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { NotificationModule } from "../notifications/notification.module";
import { AI_CONFIG, AI_PROVIDER_TOKEN, loadAiConfig, type AiConfig } from "./ai.config";
import { AiBudgetService } from "./ai-budget.service";
import { AiScheduler } from "./ai.scheduler";
import { AiService } from "./ai.service";
import { AiUsageController } from "./ai-usage.controller";
import { GeminiProvider } from "./providers/gemini.provider";
import type { BaseAiProvider } from "./providers/ai-provider.interface";
import { TenderExtractController } from "./tender-extract/tender-extract.controller";
import { TenderExtractService } from "./tender-extract/tender-extract.service";
import { AssistantController } from "./assistant/assistant.controller";
import { AssistantService } from "./assistant/assistant.service";
import { CompanyListingsModule } from "../company-listings/company-listings.module";
import { CompanyOrdersModule } from "../company-orders/company-orders.module";
import { CompanyConnectionsModule } from "../company-connections/company-connections.module";

/**
 * Faz AI-0 — AI altyapısı: sağlayıcı adapteri + maliyet ölçümü + firma bütçesi
 * + erişim kapısı + kullanım ekranı. Gerçek AI özellikleri AI-1/AI-2'de bu
 * modülün AiService.callAi kapısından geçer.
 *
 * Anahtar (GEMINI_API_KEY) yalnız backend env'inde — frontend'e ASLA sızmaz;
 * sağlayıcı çağrısı yalnız buradan yapılır. Anahtar yoksa provider null →
 * AI kapalı (503), boot engellenmez (prod gürültüsü main.ts'te).
 */
@Module({
  imports: [
    CompanyAuthModule,
    NotificationModule,
    CompanyListingsModule,
    CompanyOrdersModule,
    CompanyConnectionsModule,
  ],
  controllers: [AiUsageController, TenderExtractController, AssistantController],
  providers: [
    {
      provide: AI_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): AiConfig => loadAiConfig(cs),
    },
    {
      provide: AI_PROVIDER_TOKEN,
      inject: [AI_CONFIG],
      useFactory: (cfg: AiConfig): BaseAiProvider | null => {
        if (!cfg.enabled || !cfg.apiKey) return null;
        if (checkAiKey(cfg.apiKey) !== "ok") {
          // Prod'da main.ts boot'u zaten keser; dev'de net uyarı + kapalı.
          new Logger("AiModule").warn(
            "GEMINI_API_KEY placeholder/bozuk görünüyor — AI kapalı.",
          );
          return null;
        }
        return new GeminiProvider(cfg.apiKey);
      },
    },
    AiBudgetService,
    AiService,
    AiScheduler,
    TenderExtractService,
    AssistantService,
  ],
  exports: [AiService, AiBudgetService],
})
export class AiModule {}
