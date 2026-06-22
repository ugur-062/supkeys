import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";

/**
 * Faz 7 — Ödeme. PrismaModule global; ConfigService global. Sağlayıcı
 * (Iyzico/test) PaymentsService içinde env'e göre seçilir. Diğer modüller
 * (supplier-self-service) PaymentsService'i inject eder.
 */
@Module({
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
