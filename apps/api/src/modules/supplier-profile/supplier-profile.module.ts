import { Module } from "@nestjs/common";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierProfileController } from "./controllers/supplier-profile.controller";
import { SupplierProfileService } from "./services/supplier-profile.service";

@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierProfileController],
  providers: [SupplierProfileService],
})
export class SupplierProfileModule {}
