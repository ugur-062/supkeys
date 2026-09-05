import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyViewsController, PublicViewsController } from "./company-views.controller";
import { CompanyViewsScheduler } from "./company-views.scheduler";
import { CompanyViewsService } from "./company-views.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyViewsController, PublicViewsController],
  providers: [CompanyViewsService, CompanyViewsScheduler],
  exports: [CompanyViewsService],
})
export class CompanyViewsModule {}
