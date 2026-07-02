import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBankAccountsController } from "./company-bank-accounts.controller";
import { CompanyBankAccountsService } from "./company-bank-accounts.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyBankAccountsController],
  providers: [CompanyBankAccountsService],
  exports: [CompanyBankAccountsService],
})
export class CompanyBankAccountsModule {}
