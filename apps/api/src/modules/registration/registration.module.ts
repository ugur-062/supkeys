import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { BuyerRegistrationController } from "./controllers/buyer-registration.controller";
import { EmailVerificationController } from "./controllers/email-verification.controller";
import { SupplierRegistrationController } from "./controllers/supplier-registration.controller";
import { BuyerRegistrationService } from "./services/buyer-registration.service";
import { EmailVerificationService } from "./services/email-verification.service";
import { SupplierRegistrationService } from "./services/supplier-registration.service";

@Module({
  imports: [EmailModule],
  controllers: [
    BuyerRegistrationController,
    SupplierRegistrationController,
    EmailVerificationController,
  ],
  providers: [
    BuyerRegistrationService,
    SupplierRegistrationService,
    EmailVerificationService,
  ],
})
export class RegistrationModule {}
