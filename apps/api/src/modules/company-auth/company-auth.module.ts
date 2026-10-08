import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { EmailModule } from "../email/email.module";
import { PasswordResetModule } from "../password-reset/password-reset.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { CompanyAuthController } from "./controllers/company-auth.controller";
import { MembershipScheduler } from "./schedulers/membership.scheduler";
import { UnverifiedSignupScheduler } from "./schedulers/unverified-signup.scheduler";
import { CompanyAuthService } from "./services/company-auth.service";
import { UnverifiedSignupCleanupService } from "./services/unverified-signup-cleanup.service";
import { CompanyJwtStrategy } from "./strategies/company-jwt.strategy";

@Module({
  imports: [
    PassportModule,
    SupabaseAuthModule,
    PasswordResetModule,
    EmailModule,
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
  providers: [
    CompanyAuthService,
    CompanyJwtStrategy,
    MembershipScheduler,
    UnverifiedSignupCleanupService,
    UnverifiedSignupScheduler,
  ],
  // The cleanup service is exported for the team invitation path
  // (`CompanyUsersService`): an address held by an expired unverified sign-up
  // is released there too.
  exports: [CompanyAuthService, UnverifiedSignupCleanupService],
})
export class CompanyAuthModule {}
