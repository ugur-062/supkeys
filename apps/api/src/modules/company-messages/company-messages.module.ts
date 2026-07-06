import { Module } from "@nestjs/common";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { EmailModule } from "../email/email.module";
import { CompanyMessagesController } from "./company-messages.controller";
import { CompanyMessagesService } from "./company-messages.service";

@Module({
  imports: [CompanyAuthModule, CompanyBlocksModule, EmailModule],
  controllers: [CompanyMessagesController],
  providers: [CompanyMessagesService],
})
export class CompanyMessagesModule {}
