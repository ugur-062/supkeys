import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyRequestDefaultsController } from "./company-request-defaults.controller";
import { CompanyRequestDefaultsService } from "./company-request-defaults.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyRequestDefaultsController],
  providers: [CompanyRequestDefaultsService],
})
export class CompanyRequestDefaultsModule {}
