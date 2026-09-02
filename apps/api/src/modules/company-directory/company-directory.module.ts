import { Module } from "@nestjs/common";
import { CompanyDirectoryController } from "./company-directory.controller";
import { CompanyDirectoryService } from "./company-directory.service";

@Module({
  controllers: [CompanyDirectoryController],
  providers: [CompanyDirectoryService],
})
export class CompanyDirectoryModule {}
