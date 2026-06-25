import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PasswordResetModule } from "../password-reset/password-reset.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { CompanyAuthController } from "./controllers/company-auth.controller";
import { CompanyAuthService } from "./services/company-auth.service";
import { CompanyJwtStrategy } from "./strategies/company-jwt.strategy";

@Module({
  imports: [
    PassportModule,
    SupabaseAuthModule,
    PasswordResetModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "1h"),
        },
      }),
    }),
  ],
  controllers: [CompanyAuthController],
  providers: [CompanyAuthService, CompanyJwtStrategy],
  exports: [CompanyAuthService],
})
export class CompanyAuthModule {}
