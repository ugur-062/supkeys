import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { PasswordResetModule } from "../password-reset/password-reset.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { CompanyUsersController } from "./company-users.controller";
import { CompanyUsersService } from "./company-users.service";

@Module({
  imports: [CompanyAuthModule, SupabaseAuthModule, PasswordResetModule],
  controllers: [CompanyUsersController],
  providers: [CompanyUsersService],
})
export class CompanyUsersModule {}
