import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { TwoFactorModule } from "../two-factor/two-factor.module";
import { BuyerRegistrationController } from "./controllers/buyer-registration.controller";
import { BuyerSignupController } from "./controllers/buyer-signup.controller";
import { SupplierRegistrationController } from "./controllers/supplier-registration.controller";
import { SupplierSignupController } from "./controllers/supplier-signup.controller";
import { BuyerRegistrationService } from "./services/buyer-registration.service";
import { BuyerSignupService } from "./services/buyer-signup.service";
import { SupplierRegistrationService } from "./services/supplier-registration.service";
import { SupplierSignupService } from "./services/supplier-signup.service";

@Module({
  imports: [EmailModule, SupabaseAuthModule, TwoFactorModule],
  controllers: [
    BuyerRegistrationController,
    BuyerSignupController,
    SupplierRegistrationController,
    SupplierSignupController,
  ],
  providers: [
    BuyerRegistrationService,
    BuyerSignupService,
    SupplierRegistrationService,
    SupplierSignupService,
  ],
})
export class RegistrationModule {}
