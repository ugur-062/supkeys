import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanySupplierTemplatesController } from "./company-supplier-templates.controller";
import { CompanySupplierTemplatesService } from "./company-supplier-templates.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanySupplierTemplatesController],
  providers: [CompanySupplierTemplatesService],
})
export class CompanySupplierTemplatesModule {}
