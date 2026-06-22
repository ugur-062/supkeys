import { Module } from "@nestjs/common";
import { CompanyDocsService } from "./company-docs.service";

/**
 * Madde 29 — FAZ 3.2 firma doğrulama belgeleri. PrismaModule + StorageModule
 * global olduğu için ek import gerekmez. Supplier + Tenant modülleri paylaşır.
 */
@Module({
  providers: [CompanyDocsService],
  exports: [CompanyDocsService],
})
export class CompanyDocsModule {}
