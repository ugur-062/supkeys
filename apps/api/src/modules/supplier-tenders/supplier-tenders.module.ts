import { Module } from "@nestjs/common";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierTendersController } from "./controllers/supplier-tenders.controller";
import { SupplierTendersService } from "./services/supplier-tenders.service";

@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierTendersController],
  providers: [SupplierTendersService],
})
export class SupplierTendersModule {}
