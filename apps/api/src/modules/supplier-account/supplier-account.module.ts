import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierManagerGuard } from "../supplier-auth/guards/supplier-manager.guard";
import { SupplierAccountController } from "./controllers/supplier-account.controller";
import { SupplierTeamController } from "./controllers/supplier-team.controller";
import { SupplierAccountService } from "./services/supplier-account.service";
import { SupplierTeamService } from "./services/supplier-team.service";

@Module({
  imports: [SupplierAuthModule, SupabaseAuthModule, EmailModule],
  controllers: [SupplierAccountController, SupplierTeamController],
  providers: [SupplierAccountService, SupplierTeamService, SupplierManagerGuard],
})
export class SupplierAccountModule {}
