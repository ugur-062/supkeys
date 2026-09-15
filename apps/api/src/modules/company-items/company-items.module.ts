import { Module } from "@nestjs/common";
import { CompanyViewsModule } from "../company-views/company-views.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { CompanyItemsController } from "./company-items.controller";
import { CompanyItemsService } from "./company-items.service";

@Module({
  imports: [AuditModule, StorageModule, CompanyViewsModule],
  controllers: [CompanyItemsController],
  providers: [CompanyItemsService],
  exports: [CompanyItemsService],
})
export class CompanyItemsModule {}
