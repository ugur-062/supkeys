import { Module } from "@nestjs/common";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierOrdersController } from "./controllers/supplier-orders.controller";
import { SupplierOrdersService } from "./services/supplier-orders.service";

@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierOrdersController],
  providers: [SupplierOrdersService],
})
export class SupplierOrdersModule {}
