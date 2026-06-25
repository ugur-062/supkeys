import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyInboxController } from "./company-inbox.controller";
import { CompanyInboxService } from "./company-inbox.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyInboxController],
  providers: [CompanyInboxService],
})
export class CompanyInboxModule {}
