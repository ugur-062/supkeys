import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { SupplierAuthController } from "./controllers/supplier-auth.controller";
import { SupplierAuthService } from "./services/supplier-auth.service";
import { SupplierJwtStrategy } from "./strategies/supplier-jwt.strategy";

@Module({
  imports: [
    PassportModule,
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
  controllers: [SupplierAuthController],
  providers: [SupplierAuthService, SupplierJwtStrategy],
  exports: [SupplierAuthService],
})
export class SupplierAuthModule {}
