import { Module } from "@nestjs/common";
import { PublicSupplierProfileController } from "./controllers/public-supplier-profile.controller";
import { PublicSupplierProfileService } from "./services/public-supplier-profile.service";

/**
 * V2-PUBLIC-PROFILE — Tedarikçinin herkese açık profili.
 * Auth gerekmez. Sadece PREMIUM + publicEnabled + slug varsa 200, aksi 404.
 */
@Module({
  controllers: [PublicSupplierProfileController],
  providers: [PublicSupplierProfileService],
})
export class PublicSupplierProfileModule {}
