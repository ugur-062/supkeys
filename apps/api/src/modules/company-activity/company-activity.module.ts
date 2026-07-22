import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyActivityController } from "./company-activity.controller";
import { CompanyActivityService } from "./company-activity.service";

/** Faz O — firma-yüzü aktivite logu (AuditService @Global'dan gelir). */
@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyActivityController],
  providers: [CompanyActivityService],
})
export class CompanyActivityModule {}
