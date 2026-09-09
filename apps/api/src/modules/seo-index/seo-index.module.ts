import { Global, Module } from "@nestjs/common";
import { SeoIndexService } from "./seo-index.service";

/**
 * Global — yayın anı bildirimi (IndexNow + web tazeleme) her modülden
 * ekstra import olmadan `@Optional()` ile enjekte edilir (AuditModule kalıbı).
 */
@Global()
@Module({
  providers: [SeoIndexService],
  exports: [SeoIndexService],
})
export class SeoIndexModule {}
