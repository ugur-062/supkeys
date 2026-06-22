import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { TwoFactorService } from "./two-factor.service";

/**
 * Madde 29 — FAZ 3.3 e-posta 2FA. PrismaModule global; EmailModule import.
 * Tenant + Supplier auth modülleri paylaşır.
 */
@Module({
  imports: [EmailModule],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
