import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { SupplierPublicInvitationsController } from "./controllers/supplier-public-invitations.controller";
import { SupplierPublicInvitationsService } from "./services/supplier-public-invitations.service";

@Module({
  imports: [
    SupabaseAuthModule,
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
  controllers: [SupplierPublicInvitationsController],
  providers: [SupplierPublicInvitationsService],
})
export class SupplierPublicInvitationsModule {}
