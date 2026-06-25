import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { CompanyListingsController } from "./controllers/company-listings.controller";
import { CompanyListingsService } from "./services/company-listings.service";

@Module({
  imports: [CompanyAuthModule, CompanyBlocksModule],
  controllers: [CompanyListingsController],
  providers: [CompanyListingsService],
})
export class CompanyListingsModule {}
