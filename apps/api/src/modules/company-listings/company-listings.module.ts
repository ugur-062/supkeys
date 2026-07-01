import { Module } from "@nestjs/common";
import { CompanyApprovalsModule } from "../company-approvals/company-approvals.module";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { CompanyListingsController } from "./controllers/company-listings.controller";
import { ListingScheduler } from "./schedulers/listing.scheduler";
import { CompanyListingsService } from "./services/company-listings.service";

@Module({
  imports: [
    CompanyAuthModule,
    CompanyBlocksModule,
    CompanyApprovalsModule,
    EmailModule,
    NotificationModule,
  ],
  controllers: [CompanyListingsController],
  providers: [CompanyListingsService, ListingScheduler],
})
export class CompanyListingsModule {}
