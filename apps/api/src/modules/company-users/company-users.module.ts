import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { EmailModule } from "../email/email.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { CompanyInvitationsController } from "./company-invitations.controller";
import { CompanyUsersController } from "./company-users.controller";
import { CompanyUsersService } from "./company-users.service";

@Module({
  imports: [CompanyAuthModule, SupabaseAuthModule, EmailModule],
  controllers: [CompanyUsersController, CompanyInvitationsController],
  providers: [CompanyUsersService],
})
export class CompanyUsersModule {}
