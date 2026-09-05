import { Module } from "@nestjs/common";
import { CompanyViewsModule } from "../company-views/company-views.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { CompanyItemsController } from "./company-items.controller";
import { CompanyItemsService } from "./company-items.service";
import { ProductImportController } from "./product-import.controller";
import { ProductImportService } from "./product-import.service";

@Module({
  imports: [AuditModule, StorageModule, CompanyViewsModule],
  controllers: [CompanyItemsController, ProductImportController],
  providers: [CompanyItemsService, ProductImportService],
  exports: [CompanyItemsService],
})
export class CompanyItemsModule {}
