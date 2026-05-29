import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SupplierReviewsController } from "./controllers/supplier-reviews.controller";
import { SupplierReviewsService } from "./services/supplier-reviews.service";

/**
 * V2-REVIEWS — Sipariş-sonu alıcı (buyer) değerlendirme modülü.
 * AuthModule, JwtAuthGuard için gerekli.
 */
@Module({
  imports: [AuthModule],
  controllers: [SupplierReviewsController],
  providers: [SupplierReviewsService],
})
export class SupplierReviewsModule {}
