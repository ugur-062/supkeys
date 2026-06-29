import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyDocsController } from "./company-docs.controller";
import { CompanyDocsService } from "./company-docs.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyDocsController],
  providers: [CompanyDocsService],
})
export class CompanyDocsModule {}
