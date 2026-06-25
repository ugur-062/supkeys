import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksController } from "./company-blocks.controller";
import { CompanyBlocksService } from "./company-blocks.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyBlocksController],
  providers: [CompanyBlocksService],
  exports: [CompanyBlocksService],
})
export class CompanyBlocksModule {}
