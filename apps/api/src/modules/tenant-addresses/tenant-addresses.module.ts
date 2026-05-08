import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantAddressesController } from "./controllers/tenant-addresses.controller";
import { TenantAddressesService } from "./services/tenant-addresses.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantAddressesController],
  providers: [TenantAddressesService],
  exports: [TenantAddressesService],
})
export class TenantAddressesModule {}
