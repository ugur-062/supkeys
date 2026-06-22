import { Module } from "@nestjs/common";
import { CompanyDocsModule } from "../company-docs/company-docs.module";
import { EmailModule } from "../email/email.module";
import { PaymentsModule } from "../payments/payments.module";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierSelfServiceController } from "./controllers/supplier-self-service.controller";
import { SupplierSelfServiceService } from "./services/supplier-self-service.service";

@Module({
  imports: [SupplierAuthModule, EmailModule, CompanyDocsModule, PaymentsModule],
  controllers: [SupplierSelfServiceController],
  providers: [SupplierSelfServiceService],
})
export class SupplierSelfServiceModule {}
