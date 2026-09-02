import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { CompanyInquiryController } from "./company-inquiry.controller";
import { PublicInquiryController } from "./public-inquiry.controller";
import { PublicInquiryService } from "./public-inquiry.service";

@Module({
  imports: [EmailModule],
  controllers: [PublicInquiryController, CompanyInquiryController],
  providers: [PublicInquiryService],
  exports: [PublicInquiryService],
})
export class PublicInquiryModule {}
