import { Module } from "@nestjs/common";
import { CompanyApprovalsModule } from "../company-approvals/company-approvals.module";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { CompanyListingsController } from "./controllers/company-listings.controller";
import { ListingItemImportController } from "./import/listing-item-import.controller";
import { ListingItemImportService } from "./import/listing-item-import.service";
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
  controllers: [CompanyListingsController, ListingItemImportController],
  providers: [CompanyListingsService, ListingScheduler, ListingItemImportService],
  // Faz AI-2: asistan araçları bu servisi kullanıcı kimliğiyle çağırır.
  exports: [CompanyListingsService],
})
export class CompanyListingsModule {}
