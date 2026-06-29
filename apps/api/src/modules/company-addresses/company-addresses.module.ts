import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyAddressesController } from "./company-addresses.controller";
import { CompanyAddressesService } from "./company-addresses.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyAddressesController],
  providers: [CompanyAddressesService],
})
export class CompanyAddressesModule {}
