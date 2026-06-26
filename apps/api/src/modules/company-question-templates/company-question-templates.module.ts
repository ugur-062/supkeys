import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyQuestionTemplatesController } from "./company-question-templates.controller";
import { CompanyQuestionTemplatesService } from "./company-question-templates.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyQuestionTemplatesController],
  providers: [CompanyQuestionTemplatesService],
})
export class CompanyQuestionTemplatesModule {}
