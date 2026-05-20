import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { EmailModule } from "../email/email.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { TenantUsersModule } from "../tenant-users/tenant-users.module";
import { AdminTenantsController } from "./controllers/admin-tenants.controller";
import { PasswordResetPublicController } from "./controllers/password-reset-public.controller";
import { AdminTenantUsersService } from "./services/admin-tenant-users.service";
import { AdminTenantsService } from "./services/admin-tenants.service";

@Module({
  imports: [AdminAuthModule, EmailModule, TenantUsersModule, SupabaseAuthModule],
  controllers: [AdminTenantsController, PasswordResetPublicController],
  providers: [AdminTenantsService, AdminTenantUsersService],
})
export class AdminTenantsModule {}
