import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantTendersController } from "./controllers/tenant-tenders.controller";
import { TenantTendersService } from "./services/tenant-tenders.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantTendersController],
  providers: [TenantTendersService],
})
export class TenantTendersModule {}
