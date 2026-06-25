import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyListingTemplatesController } from "./company-listing-templates.controller";
import { CompanyListingTemplatesService } from "./company-listing-templates.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyListingTemplatesController],
  providers: [CompanyListingTemplatesService],
})
export class CompanyListingTemplatesModule {}
