import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          // Security audit Y-1 — eski 7d default, refresh token mekanizması
          // gelmeden access token uzun TTL ile tutmak riskli. V2 refresh
          // token sprint'inde 15dk'ya inecek; şimdilik 1h.
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "1h"),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule export edildi — PublicInvitationsModule gibi modüller
  // JwtService inject edip aynı imza ile token üretebilsin (auto-login).
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
