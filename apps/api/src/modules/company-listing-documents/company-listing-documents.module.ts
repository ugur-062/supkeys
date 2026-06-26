import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { StorageModule } from "../storage/storage.module";
import { CompanyListingDocumentsController } from "./company-listing-documents.controller";
import { CompanyListingDocumentsService } from "./company-listing-documents.service";

@Module({
  imports: [CompanyAuthModule, StorageModule],
  controllers: [CompanyListingDocumentsController],
  providers: [CompanyListingDocumentsService],
})
export class CompanyListingDocumentsModule {}
