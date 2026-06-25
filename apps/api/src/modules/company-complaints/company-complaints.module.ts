import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyComplaintsController } from "./company-complaints.controller";
import { CompanyComplaintsService } from "./company-complaints.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyComplaintsController],
  providers: [CompanyComplaintsService],
})
export class CompanyComplaintsModule {}
