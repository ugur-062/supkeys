import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { PasswordResetModule } from "../password-reset/password-reset.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { AdminCompaniesController } from "./admin-companies.controller";
import { AdminCompaniesService } from "./admin-companies.service";
import { AdminCompanyUsersController } from "./admin-company-users.controller";
import { AdminCompanyUsersService } from "./admin-company-users.service";
import { AdminInspectionController } from "./admin-inspection.controller";
import { AdminInspectionService } from "./admin-inspection.service";

@Module({
  imports: [
    EmailModule,
    NotificationModule,
    // Kullanıcı kurtarma (Faz 4): reset e-postası + doğrulama kodu + Supabase.
    PasswordResetModule,
    CompanyAuthModule,
    SupabaseAuthModule,
  ],
  controllers: [
    AdminCompaniesController,
    AdminCompanyUsersController,
    AdminInspectionController,
  ],
  providers: [
    AdminCompaniesService,
    AdminCompanyUsersService,
    AdminInspectionService,
  ],
})
export class AdminCompaniesModule {}
