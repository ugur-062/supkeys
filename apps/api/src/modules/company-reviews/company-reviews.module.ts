import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyReviewsController } from "./company-reviews.controller";
import { CompanyReviewsService } from "./company-reviews.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyReviewsController],
  providers: [CompanyReviewsService],
})
export class CompanyReviewsModule {}
