import { Module } from "@nestjs/common";
import { CategoriesModule } from "../categories/categories.module";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyProfileController } from "./company-profile.controller";
import { CompanyProfileService } from "./company-profile.service";

@Module({
  imports: [CompanyAuthModule, CategoriesModule],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
})
export class CompanyProfileModule {}
