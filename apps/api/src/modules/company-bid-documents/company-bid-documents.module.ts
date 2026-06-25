import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { StorageModule } from "../storage/storage.module";
import { CompanyBidDocumentsController } from "./company-bid-documents.controller";
import { CompanyBidDocumentsService } from "./company-bid-documents.service";

@Module({
  imports: [CompanyAuthModule, StorageModule],
  controllers: [CompanyBidDocumentsController],
  providers: [CompanyBidDocumentsService],
})
export class CompanyBidDocumentsModule {}
