import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CompanyItemsController } from "./company-items.controller";
import { CompanyItemsService } from "./company-items.service";

@Module({
  imports: [AuditModule],
  controllers: [CompanyItemsController],
  providers: [CompanyItemsService],
  exports: [CompanyItemsService],
})
export class CompanyItemsModule {}
