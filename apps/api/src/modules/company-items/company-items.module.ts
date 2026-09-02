import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { CompanyItemsController } from "./company-items.controller";
import { CompanyItemsService } from "./company-items.service";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [CompanyItemsController],
  providers: [CompanyItemsService],
  exports: [CompanyItemsService],
})
export class CompanyItemsModule {}
