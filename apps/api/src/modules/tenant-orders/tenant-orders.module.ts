import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantOrdersController } from "./controllers/tenant-orders.controller";
import { TenantOrdersService } from "./services/tenant-orders.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantOrdersController],
  providers: [TenantOrdersService],
})
export class TenantOrdersModule {}
