import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { EmailModule } from "../email/email.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { AdminSuppliersController } from "./controllers/admin-suppliers.controller";
import { AdminSuppliersService } from "./services/admin-suppliers.service";

@Module({
  imports: [AdminAuthModule, SupabaseAuthModule, EmailModule],
  controllers: [AdminSuppliersController],
  providers: [AdminSuppliersService],
})
export class AdminSuppliersModule {}
