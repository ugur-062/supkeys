import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { TenantOrdersController } from "./controllers/tenant-orders.controller";
import { TenantOrdersService } from "./services/tenant-orders.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [TenantOrdersController],
  providers: [TenantOrdersService],
})
export class TenantOrdersModule {}
