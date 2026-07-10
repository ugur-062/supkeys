import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtStrategy } from "./strategies/admin-jwt.strategy";

@Module({
  imports: [
    PassportModule,
    SupabaseAuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          // Security audit Y-1 — V2 refresh token mekanizmasına kadar 1h
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "1h"),
        },
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminStaffController],
  providers: [AdminAuthService, AdminStaffService, AdminJwtStrategy],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
