import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierOrderPaymentsController } from "./controllers/supplier-order-payments.controller";
import { TenantOrderPaymentsController } from "./controllers/tenant-order-payments.controller";
import { OrderPaymentsService } from "./services/order-payments.service";

// Faz 3 madde 16 — Direkt ödeme (nakit/çek) handshake'i: alıcı kaydeder,
// tedarikçi onaylar/reddeder. Tam ödeme onaylanınca sipariş otomatik tamamlanır
// (alıcıya e-posta). Okuma sipariş detayı ile birlikte döner.
@Module({
  imports: [AuthModule, SupplierAuthModule, EmailModule],
  controllers: [TenantOrderPaymentsController, SupplierOrderPaymentsController],
  providers: [OrderPaymentsService],
})
export class OrderPaymentsModule {}
