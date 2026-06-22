import { Module } from "@nestjs/common";
import { CompanyDocsModule } from "../company-docs/company-docs.module";
import { AdminCompanyVerificationsController } from "./admin-company-verifications.controller";
import { AdminCompanyVerificationsService } from "./admin-company-verifications.service";

@Module({
  imports: [CompanyDocsModule],
  controllers: [AdminCompanyVerificationsController],
  providers: [AdminCompanyVerificationsService],
})
export class AdminCompanyVerificationsModule {}
