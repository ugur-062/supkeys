import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CompanyDocsModule } from "../company-docs/company-docs.module";
import { TenantOnboardingController } from "./tenant-onboarding.controller";
import { TenantOnboardingService } from "./tenant-onboarding.service";

@Module({
  imports: [AuthModule, CompanyDocsModule],
  controllers: [TenantOnboardingController],
  providers: [TenantOnboardingService],
})
export class TenantOnboardingModule {}
