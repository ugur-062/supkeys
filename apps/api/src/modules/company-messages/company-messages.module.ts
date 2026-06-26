import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyMessagesController } from "./company-messages.controller";
import { CompanyMessagesService } from "./company-messages.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyMessagesController],
  providers: [CompanyMessagesService],
})
export class CompanyMessagesModule {}
