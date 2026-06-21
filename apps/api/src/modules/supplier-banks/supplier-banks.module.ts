import { Module } from "@nestjs/common";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierBanksController } from "./controllers/supplier-banks.controller";
import { SupplierBanksService } from "./services/supplier-banks.service";

// G6 madde 20 — Tedarikçi kayıtlı banka hesapları.
@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierBanksController],
  providers: [SupplierBanksService],
  exports: [SupplierBanksService],
})
export class SupplierBanksModule {}
