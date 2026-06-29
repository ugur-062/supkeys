import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { EmailModule } from "../email/email.module";
import { ApprovalsScheduler } from "./approvals.scheduler";
import { CompanyApprovalsController } from "./company-approvals.controller";
import { CompanyApprovalsService } from "./company-approvals.service";

@Module({
  imports: [CompanyAuthModule, EmailModule],
  controllers: [CompanyApprovalsController],
  providers: [CompanyApprovalsService, ApprovalsScheduler],
  exports: [CompanyApprovalsService],
})
export class CompanyApprovalsModule {}
